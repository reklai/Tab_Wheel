import browser, { Tabs } from "webextension-polyfill";
import {
  loadTabWheelSettings,
  MAX_SCROLL_MEMORY_ENTRIES,
  TABWHEEL_STORAGE_KEYS,
} from "../../common/contracts/tabWheel";
import { resolveCycleTargetIndex } from "../../core/tabWheel/tabWheelCore";

type ScrollMemoryByTabId = Record<string, TabWheelScrollMemoryEntry>;

interface MruCycleSession {
  windowId: number;
  tabIds: number[];
  cursorIndex: number;
  lastUsedAt: number;
}

export interface TabWheelDomain {
  ensureLoaded(): Promise<void>;
  getOverview(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelOverview>;
  cycle(direction: "prev" | "next", tab?: Tabs.Tab): Promise<TabWheelActionResult>;
  saveScrollPosition(tabId: number, windowId: number, scrollX: number, scrollY: number): Promise<TabWheelActionResult>;
  registerLifecycleListeners(): void;
}

const MRU_SESSION_TIMEOUT_MS = 1400;

function windowKey(windowId: number): string {
  return String(windowId);
}

function tabKey(tabId: number): string {
  return String(tabId);
}

function normalizeScroll(scrollX: number, scrollY: number): { scrollX: number; scrollY: number } {
  return {
    scrollX: Math.max(0, Number(scrollX) || 0),
    scrollY: Math.max(0, Number(scrollY) || 0),
  };
}

function normalizeScrollMemoryEntry(rawEntry: unknown): TabWheelScrollMemoryEntry | null {
  if (typeof rawEntry !== "object" || rawEntry === null) return null;
  const entry = rawEntry as Partial<TabWheelScrollMemoryEntry>;
  const tabId = Number(entry.tabId);
  const windowId = Number(entry.windowId);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  if (!Number.isInteger(windowId) || windowId <= 0) return null;
  const scroll = normalizeScroll(Number(entry.scrollX), Number(entry.scrollY));
  return {
    tabId,
    windowId,
    scrollX: scroll.scrollX,
    scrollY: scroll.scrollY,
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
  };
}

function normalizeScrollMemory(rawValue: unknown): ScrollMemoryByTabId {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) return {};
  const normalized: ScrollMemoryByTabId = {};
  for (const [key, rawEntry] of Object.entries(rawValue as Record<string, unknown>)) {
    const entry = normalizeScrollMemoryEntry(rawEntry);
    if (!entry || key !== tabKey(entry.tabId)) continue;
    normalized[key] = entry;
  }
  return normalized;
}

function trimScrollMemory(memory: ScrollMemoryByTabId): ScrollMemoryByTabId {
  const entries = Object.values(memory)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_SCROLL_MEMORY_ENTRIES);
  return Object.fromEntries(entries.map((entry) => [tabKey(entry.tabId), entry]));
}

function getTabIndex(tab: Tabs.Tab): number {
  return Number(tab.index) || 0;
}

function getEligibleTabs(tabs: Tabs.Tab[], settings: TabWheelSettings): Tabs.Tab[] {
  const filtered = settings.skipPinnedTabs
    ? tabs.filter((tab) => tab.pinned !== true)
    : tabs.slice();
  return filtered
    .filter((tab) => tab.id != null)
    .sort((left, right) => getTabIndex(left) - getTabIndex(right));
}

function sameTabOrder(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createTabWheelDomain(): TabWheelDomain {
  let scrollMemoryByTabId: ScrollMemoryByTabId = {};
  const mruTabIdsByWindowId = new Map<number, number[]>();
  const suppressedCycleActivations = new Set<number>();
  let mruCycleSession: MruCycleSession | null = null;
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    const stored = await browser.storage.local.get(TABWHEEL_STORAGE_KEYS.scrollMemory);
    scrollMemoryByTabId = normalizeScrollMemory(
      stored[TABWHEEL_STORAGE_KEYS.scrollMemory],
    );
    loaded = true;
  }

  async function saveScrollMemory(): Promise<void> {
    scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.scrollMemory]: scrollMemoryByTabId,
    });
  }

  async function resolveActiveTab(tab?: Tabs.Tab, windowId?: number): Promise<Tabs.Tab | null> {
    if (tab?.id != null && tab.windowId != null) {
      try {
        return await browser.tabs.get(tab.id);
      } catch (_) {
        return tab;
      }
    }
    if (windowId != null) {
      const [activeTab] = await browser.tabs.query({ active: true, windowId });
      return activeTab?.id != null && activeTab.windowId != null ? activeTab : null;
    }
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    return activeTab?.id != null && activeTab.windowId != null ? activeTab : null;
  }

  async function resolveCurrentWindowId(windowId?: number): Promise<number | null> {
    if (windowId != null) return windowId;
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    return activeTab?.windowId ?? null;
  }

  async function getWindowTabs(windowId: number): Promise<Tabs.Tab[]> {
    return await browser.tabs.query({ windowId });
  }

  async function getScroll(tabId: number): Promise<ScrollData> {
    try {
      return (await browser.tabs.sendMessage(tabId, { type: "GET_SCROLL" })) as ScrollData;
    } catch (_) {
      return { scrollX: 0, scrollY: 0 };
    }
  }

  async function restoreScroll(tabId: number): Promise<boolean> {
    const entry = scrollMemoryByTabId[tabKey(tabId)];
    if (!entry || (!entry.scrollX && !entry.scrollY)) return false;
    const retryDelaysMs = [0, 80, 220, 500, 900, 1500, 2400, 3600];
    for (const delay of retryDelaysMs) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await browser.tabs.sendMessage(tabId, {
          type: "SET_SCROLL",
          scrollX: entry.scrollX,
          scrollY: entry.scrollY,
        });
        return true;
      } catch (_) {
        // Content script may be unavailable or not ready.
      }
    }
    return false;
  }

  function rememberActivatedTab(windowId: number, tabId: number): void {
    const current = mruTabIdsByWindowId.get(windowId) || [];
    mruTabIdsByWindowId.set(windowId, [
      tabId,
      ...current.filter((candidate) => candidate !== tabId),
    ]);
  }

  function getMruCandidateIds(windowId: number, eligibleTabs: Tabs.Tab[]): number[] {
    const eligibleIds = eligibleTabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => tabId != null);
    const eligibleIdSet = new Set(eligibleIds);
    const knownIds = (mruTabIdsByWindowId.get(windowId) || [])
      .filter((tabId) => eligibleIdSet.has(tabId));
    const knownIdSet = new Set(knownIds);
    return [
      ...knownIds,
      ...eligibleIds.filter((tabId) => !knownIdSet.has(tabId)),
    ];
  }

  function resolveMruTargetTab(
    windowId: number,
    activeTabId: number,
    eligibleTabs: Tabs.Tab[],
    direction: "prev" | "next",
    wrapAround: boolean,
  ): Tabs.Tab | null {
    const now = Date.now();
    const candidateIds = getMruCandidateIds(windowId, eligibleTabs);
    if (candidateIds.length === 0) return null;
    if (candidateIds.length === 1) return eligibleTabs.find((tab) => tab.id === candidateIds[0]) || null;

    const session = mruCycleSession;
    const shouldReuseSession = session
      && session.windowId === windowId
      && now - session.lastUsedAt <= MRU_SESSION_TIMEOUT_MS
      && sameTabOrder(session.tabIds, candidateIds);

    const currentIndex = shouldReuseSession
      ? session.cursorIndex
      : Math.max(0, candidateIds.indexOf(activeTabId));
    const offset = direction === "next" ? 1 : -1;
    const nextIndex = currentIndex + offset;
    const cursorIndex = nextIndex < 0
      ? wrapAround ? candidateIds.length - 1 : currentIndex
      : nextIndex >= candidateIds.length
        ? wrapAround ? 0 : currentIndex
        : nextIndex;

    mruCycleSession = {
      windowId,
      tabIds: candidateIds,
      cursorIndex,
      lastUsedAt: now,
    };

    return eligibleTabs.find((tab) => tab.id === candidateIds[cursorIndex]) || null;
  }

  function resolveStripTargetTab(
    activeTab: Tabs.Tab,
    eligibleTabs: Tabs.Tab[],
    direction: "prev" | "next",
    wrapAround: boolean,
  ): Tabs.Tab | null {
    const targetIndex = resolveCycleTargetIndex(
      eligibleTabs.map(getTabIndex),
      getTabIndex(activeTab),
      direction,
      wrapAround,
    );
    return eligibleTabs.find((tab) => getTabIndex(tab) === targetIndex) || null;
  }

  async function captureTabScroll(tab: Tabs.Tab): Promise<void> {
    if (tab.id == null || tab.windowId == null) return;
    const scroll = await getScroll(tab.id);
    const normalized = normalizeScroll(scroll.scrollX, scroll.scrollY);
    scrollMemoryByTabId[tabKey(tab.id)] = {
      tabId: tab.id,
      windowId: tab.windowId,
      scrollX: normalized.scrollX,
      scrollY: normalized.scrollY,
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
  }

  async function getOverview(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelOverview> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const resolvedWindowId = await resolveCurrentWindowId(windowId ?? tab?.windowId);
    if (resolvedWindowId == null) {
      return { activeIndex: 0, tabCount: 0, cycleOrder: settings.cycleOrder };
    }
    const activeTab = await resolveActiveTab(tab, resolvedWindowId);
    const eligibleTabs = getEligibleTabs(await getWindowTabs(resolvedWindowId), settings);
    const activeIndex = activeTab
      ? eligibleTabs.findIndex((candidate) => candidate.id === activeTab.id)
      : -1;
    return {
      activeIndex: activeIndex >= 0 ? activeIndex : 0,
      tabCount: eligibleTabs.length,
      cycleOrder: settings.cycleOrder,
    };
  }

  async function cycle(
    direction: "prev" | "next",
    tab?: Tabs.Tab,
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const activeTab = await resolveActiveTab(tab);
    if (!activeTab?.id || activeTab.windowId == null) {
      return { ok: false, reason: "No active tab" };
    }
    const tabs = await getWindowTabs(activeTab.windowId);
    const eligibleTabs = getEligibleTabs(tabs, settings);
    if (eligibleTabs.length === 0) return { ok: false, reason: "No tabs" };
    if (!eligibleTabs.some((candidate) => candidate.id === activeTab.id)) {
      return { ok: false, reason: "Current tab is skipped" };
    }

    await captureTabScroll(activeTab);

    const targetTab = settings.cycleOrder === "mru"
      ? resolveMruTargetTab(activeTab.windowId, activeTab.id, eligibleTabs, direction, settings.wrapAround)
      : resolveStripTargetTab(activeTab, eligibleTabs, direction, settings.wrapAround);
    if (!targetTab?.id || targetTab.id === activeTab.id) {
      return {
        ok: false,
        reason: "Edge of tab list",
      };
    }

    suppressedCycleActivations.add(targetTab.id);
    await browser.tabs.update(targetTab.id, { active: true });
    await restoreScroll(targetTab.id);
    return {
      ok: true,
    };
  }

  async function saveScrollPosition(
    tabId: number,
    windowId: number,
    scrollX: number,
    scrollY: number,
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const scroll = normalizeScroll(scrollX, scrollY);
    const key = tabKey(tabId);
    const existing = scrollMemoryByTabId[key];
    if (existing?.scrollX === scroll.scrollX && existing.scrollY === scroll.scrollY) {
      return { ok: true };
    }
    scrollMemoryByTabId[key] = {
      tabId,
      windowId,
      scrollX: scroll.scrollX,
      scrollY: scroll.scrollY,
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
    return { ok: true };
  }

  function registerLifecycleListeners(): void {
    browser.tabs.onRemoved.addListener(async (tabId: number) => {
      await ensureLoaded();
      delete scrollMemoryByTabId[tabKey(tabId)];
      for (const [windowId, tabIds] of mruTabIdsByWindowId) {
        const nextTabIds = tabIds.filter((candidate) => candidate !== tabId);
        if (nextTabIds.length > 0) mruTabIdsByWindowId.set(windowId, nextTabIds);
        else mruTabIdsByWindowId.delete(windowId);
      }
      if (mruCycleSession?.tabIds.includes(tabId)) mruCycleSession = null;
      suppressedCycleActivations.delete(tabId);
      await saveScrollMemory();
    });

    browser.tabs.onActivated.addListener((activeInfo: Tabs.OnActivatedActiveInfoType) => {
      if (suppressedCycleActivations.delete(activeInfo.tabId)) return;
      rememberActivatedTab(activeInfo.windowId, activeInfo.tabId);
      mruCycleSession = null;
    });

    browser.windows.onRemoved.addListener((windowId: number) => {
      mruTabIdsByWindowId.delete(windowId);
      if (mruCycleSession?.windowId === windowId) mruCycleSession = null;
      for (const [key, entry] of Object.entries(scrollMemoryByTabId)) {
        if (entry.windowId === windowId) delete scrollMemoryByTabId[key];
      }
      void saveScrollMemory();
    });

    browser.runtime.onStartup.addListener(async () => {
      await ensureLoaded();
      scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
      mruTabIdsByWindowId.clear();
      mruCycleSession = null;
      await saveScrollMemory();
    });
  }

  return {
    ensureLoaded,
    getOverview,
    cycle,
    saveScrollPosition,
    registerLifecycleListeners,
  };
}
