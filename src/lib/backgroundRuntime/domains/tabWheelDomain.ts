import browser, { Tabs } from "webextension-polyfill";
import {
  loadTabWheelSettings,
  MAX_SCROLL_MEMORY_ENTRIES,
  MAX_WHEEL_LIST_TABS,
  saveTabWheelSettings,
  TABWHEEL_STORAGE_KEYS,
} from "../../common/contracts/tabWheel";
import { resolveCycleTargetIndex } from "../../core/tabWheel/tabWheelCore";

type ScrollMemoryByTabId = Record<string, TabWheelScrollMemoryEntry>;
type WheelListByWindowId = Record<string, TabWheelTaggedTabEntry[]>;

interface ExistingTabActivationResult {
  attempted: number;
  injected: number;
  skipped: number;
  failed: number;
}

export interface TabWheelDomain {
  ensureLoaded(): Promise<void>;
  activateExistingContentScripts(): Promise<ExistingTabActivationResult>;
  getOverview(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelOverview>;
  cycle(direction: "prev" | "next", tab?: Tabs.Tab): Promise<TabWheelActionResult>;
  refreshCurrentTab(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelRefreshResult>;
  toggleCurrentTag(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  removeTaggedTab(tabId: number, windowId?: number): Promise<TabWheelActionResult>;
  clearTaggedTabs(windowId?: number): Promise<TabWheelActionResult>;
  listTaggedTabs(windowId?: number): Promise<TabWheelTaggedTabEntry[]>;
  activateTaggedTab(tabId: number, windowId?: number): Promise<TabWheelActionResult>;
  toggleCycleScope(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  setCycleScope(cycleScope: TabWheelCycleScope, tab?: Tabs.Tab, windowId?: number, options?: TabWheelStatusOptions): Promise<TabWheelActionResult>;
  saveScrollPosition(tabId: number, windowId: number, url: string | undefined, scrollX: number, scrollY: number): Promise<TabWheelActionResult>;
  markContentScriptReady(tab?: Tabs.Tab): TabWheelActionResult;
  registerLifecycleListeners(): void;
}

function windowKey(windowId: number): string {
  return String(windowId);
}

function tabKey(tabId: number): string {
  return String(tabId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePageUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch (_) {
    return null;
  }
}

function normalizeTabUrl(url: string | undefined): string {
  return typeof url === "string" ? url : "";
}

function normalizeTitle(title: string | undefined, url: string | undefined): string {
  const trimmedTitle = (title || "").trim();
  if (trimmedTitle) return trimmedTitle;
  const trimmedUrl = (url || "").trim();
  return trimmedUrl || "Untitled";
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
  const url = normalizePageUrl(entry.url);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  if (!Number.isInteger(windowId) || windowId <= 0) return null;
  if (!url) return null;
  const scroll = normalizeScroll(Number(entry.scrollX), Number(entry.scrollY));
  return {
    tabId,
    windowId,
    url,
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

function normalizeTaggedEntry(rawEntry: unknown): TabWheelTaggedTabEntry | null {
  if (typeof rawEntry !== "object" || rawEntry === null) return null;
  const entry = rawEntry as Partial<TabWheelTaggedTabEntry>;
  const tabId = Number(entry.tabId);
  const windowId = Number(entry.windowId);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  if (!Number.isInteger(windowId) || windowId <= 0) return null;
  return {
    tabId,
    windowId,
    url: normalizeTabUrl(entry.url),
    title: normalizeTitle(entry.title, entry.url),
    pinned: entry.pinned === true,
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
  };
}

function normalizeWheelList(rawValue: unknown): WheelListByWindowId {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) return {};
  const normalized: WheelListByWindowId = {};
  for (const [key, rawEntries] of Object.entries(rawValue as Record<string, unknown>)) {
    const windowId = Number(key);
    if (!Number.isInteger(windowId) || windowId <= 0 || !Array.isArray(rawEntries)) continue;
    const seenTabIds = new Set<number>();
    const entries = rawEntries
      .map(normalizeTaggedEntry)
      .filter((entry): entry is TabWheelTaggedTabEntry => {
        if (!entry || entry.windowId !== windowId || seenTabIds.has(entry.tabId)) return false;
        seenTabIds.add(entry.tabId);
        return true;
      })
      .slice(0, MAX_WHEEL_LIST_TABS);
    if (entries.length > 0) normalized[key] = entries;
  }
  return normalized;
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

function updateEntryFromTab(entry: TabWheelTaggedTabEntry, tab: Tabs.Tab): boolean {
  let changed = false;
  const nextUrl = normalizeTabUrl(tab.url);
  const nextTitle = normalizeTitle(tab.title, tab.url);
  const nextPinned = tab.pinned === true;
  if (entry.url !== nextUrl) {
    entry.url = nextUrl;
    changed = true;
  }
  if (entry.title !== nextTitle) {
    entry.title = nextTitle;
    changed = true;
  }
  if (entry.pinned !== nextPinned) {
    entry.pinned = nextPinned;
    changed = true;
  }
  if (changed) entry.updatedAt = Date.now();
  return changed;
}

export function createTabWheelDomain(): TabWheelDomain {
  let scrollMemoryByTabId: ScrollMemoryByTabId = {};
  let wheelListByWindowId: WheelListByWindowId = {};
  const contentScriptReadyUrlsByTabId = new Map<number, string>();
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    const stored = await browser.storage.local.get([
      TABWHEEL_STORAGE_KEYS.scrollMemory,
      TABWHEEL_STORAGE_KEYS.wheelList,
    ]);
    scrollMemoryByTabId = normalizeScrollMemory(
      stored[TABWHEEL_STORAGE_KEYS.scrollMemory],
    );
    wheelListByWindowId = normalizeWheelList(stored[TABWHEEL_STORAGE_KEYS.wheelList]);
    loaded = true;
  }

  async function saveScrollMemory(): Promise<void> {
    scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.scrollMemory]: scrollMemoryByTabId,
    });
  }

  async function saveWheelList(): Promise<void> {
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.wheelList]: wheelListByWindowId,
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

  function sortEntriesByTabOrder(entries: TabWheelTaggedTabEntry[], tabs: Tabs.Tab[]): TabWheelTaggedTabEntry[] {
    const indexByTabId = new Map<number, number>();
    for (const tab of tabs) {
      if (tab.id != null) indexByTabId.set(tab.id, getTabIndex(tab));
    }
    return entries
      .slice()
      .sort((left, right) => {
        const leftIndex = indexByTabId.get(left.tabId) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = indexByTabId.get(right.tabId) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });
  }

  async function reconcileWindow(windowId: number): Promise<Tabs.Tab[]> {
    await ensureLoaded();
    const key = windowKey(windowId);
    const entries = wheelListByWindowId[key] || [];
    const tabs = await getWindowTabs(windowId);
    const tabsById = new Map<number, Tabs.Tab>();
    for (const tab of tabs) {
      if (tab.id != null) tabsById.set(tab.id, tab);
    }

    let changed = false;
    const nextEntries: TabWheelTaggedTabEntry[] = [];
    for (const entry of entries) {
      const tab = tabsById.get(entry.tabId);
      if (!tab) {
        changed = true;
        continue;
      }
      if (updateEntryFromTab(entry, tab)) changed = true;
      nextEntries.push(entry);
    }

    if (nextEntries.length === 0) {
      if (wheelListByWindowId[key]) {
        delete wheelListByWindowId[key];
        changed = true;
      }
    } else {
      wheelListByWindowId[key] = nextEntries.slice(0, MAX_WHEEL_LIST_TABS);
    }

    if (changed) await saveWheelList();
    return tabs;
  }

  function getTaggedEntries(windowId: number, tabs: Tabs.Tab[]): TabWheelTaggedTabEntry[] {
    return sortEntriesByTabOrder(wheelListByWindowId[windowKey(windowId)] || [], tabs);
  }

  function getTaggedTabs(windowId: number, tabs: Tabs.Tab[], eligibleTabs: Tabs.Tab[]): Tabs.Tab[] {
    const taggedIds = new Set(getTaggedEntries(windowId, tabs).map((entry) => entry.tabId));
    return eligibleTabs.filter((tab) => tab.id != null && taggedIds.has(tab.id));
  }

  async function saveCycleScope(cycleScope: TabWheelCycleScope): Promise<TabWheelSettings> {
    const settings = await loadTabWheelSettings();
    const nextSettings = { ...settings, cycleScope };
    await saveTabWheelSettings(nextSettings);
    return nextSettings;
  }

  async function ensureUsableCycleScope(
    settings: TabWheelSettings,
    windowId: number,
    tabs: Tabs.Tab[],
    eligibleTabs: Tabs.Tab[],
  ): Promise<TabWheelSettings> {
    if (settings.cycleScope !== "tagged") return settings;
    if (getTaggedTabs(windowId, tabs, eligibleTabs).length > 0) return settings;
    return await saveCycleScope("general");
  }

  async function sendStatus(tabId: number | undefined, message: string): Promise<void> {
    if (tabId == null) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "TABWHEEL_STATUS", message });
    } catch (_) {
      // Status is best-effort; restricted pages cannot receive content messages.
    }
  }

  async function notifyWindowTagState(windowId: number): Promise<void> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const tabs = await reconcileWindow(windowId);
    const entries = getTaggedEntries(windowId, tabs);
    const taggedTabIds = new Set(entries.map((entry) => entry.tabId));
    await Promise.all(tabs.map(async (tab) => {
      if (tab.id == null) return;
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "TABWHEEL_TAG_STATE_CHANGED",
          isTagged: taggedTabIds.has(tab.id),
          count: entries.length,
          cycleScope: settings.cycleScope,
        });
      } catch (_) {
        // Restricted or unloaded pages cannot receive content messages.
      }
    }));
  }

  async function injectContentScriptIntoTab(tab: Tabs.Tab): Promise<"injected" | "skipped" | "failed"> {
    if (tab.id == null || tab.discarded === true || !normalizePageUrl(tab.url)) return "skipped";
    const runtimeBrowser = browser as typeof browser & {
      scripting?: {
        executeScript(details: { target: { tabId: number; allFrames?: boolean }; files: string[] }): Promise<unknown>;
      };
      tabs: typeof browser.tabs & {
        executeScript?: (tabId: number, details: { file: string; runAt?: string; allFrames?: boolean }) => Promise<unknown>;
      };
    };

    try {
      if (runtimeBrowser.scripting?.executeScript) {
        await runtimeBrowser.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["contentScript.js"],
        });
        return "injected";
      }
      if (runtimeBrowser.tabs.executeScript) {
        await runtimeBrowser.tabs.executeScript(tab.id, {
          file: "contentScript.js",
          runAt: "document_start",
          allFrames: true,
        });
        return "injected";
      }
    } catch (_) {
      return "failed";
    }

    return "failed";
  }

  async function activateExistingContentScripts(): Promise<ExistingTabActivationResult> {
    const result: ExistingTabActivationResult = {
      attempted: 0,
      injected: 0,
      skipped: 0,
      failed: 0,
    };
    const tabs = await browser.tabs.query({});

    await Promise.all(tabs.map(async (tab) => {
      const activation = await injectContentScriptIntoTab(tab);
      if (activation === "skipped") {
        result.skipped += 1;
        return;
      }
      result.attempted += 1;
      if (activation === "injected") result.injected += 1;
      else result.failed += 1;
    }));

    return result;
  }

  async function pingContentScript(tab: Tabs.Tab): Promise<boolean> {
    if (tab.id == null) return false;
    const url = normalizePageUrl(tab.url);
    if (!url) return false;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "TABWHEEL_PING" });
      contentScriptReadyUrlsByTabId.set(tab.id, url);
      return true;
    } catch (_) {
      contentScriptReadyUrlsByTabId.delete(tab.id);
      return false;
    }
  }

  async function waitForContentScriptReady(tab: Tabs.Tab): Promise<boolean> {
    const retryDelaysMs = [0, 90, 240, 450, 800];
    for (const delay of retryDelaysMs) {
      if (delay > 0) await sleep(delay);
      if (await pingContentScript(tab)) return true;
    }
    return false;
  }

  async function getScroll(tabId: number): Promise<ScrollData | null> {
    try {
      return (await browser.tabs.sendMessage(tabId, { type: "GET_SCROLL" })) as ScrollData;
    } catch (_) {
      return null;
    }
  }

  async function resolveContentScriptStatus(tab: Tabs.Tab | null): Promise<TabWheelContentScriptStatus> {
    if (!tab?.id) return "unavailable";
    const url = normalizePageUrl(tab.url);
    if (!url) return "unavailable";
    if (contentScriptReadyUrlsByTabId.get(tab.id) === url) return "ready";

    return await pingContentScript(tab) ? "ready" : "unavailable";
  }

  function markContentScriptReady(tab?: Tabs.Tab): TabWheelActionResult {
    if (!tab?.id) return { ok: false, reason: "No sender tab" };
    const url = normalizePageUrl(tab.url);
    if (!url) return { ok: false, reason: "Unsupported page" };
    contentScriptReadyUrlsByTabId.set(tab.id, url);
    return { ok: true };
  }

  async function restoreScroll(tab: Tabs.Tab): Promise<boolean> {
    if (tab.id == null) return false;
    const entry = scrollMemoryByTabId[tabKey(tab.id)];
    const currentUrl = normalizePageUrl(tab.url);
    if (!currentUrl || entry?.url !== currentUrl) return false;
    if (!entry || (!entry.scrollX && !entry.scrollY)) return false;
    const retryDelaysMs = [0, 80, 220, 500, 900, 1500, 2400, 3600];
    for (const delay of retryDelaysMs) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await browser.tabs.sendMessage(tab.id, {
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

  async function captureTabScroll(tab: Tabs.Tab): Promise<void> {
    if (tab.id == null || tab.windowId == null) return;
    const url = normalizePageUrl(tab.url);
    if (!url) return;
    const scroll = await getScroll(tab.id);
    if (!scroll) return;
    const normalized = normalizeScroll(scroll.scrollX, scroll.scrollY);
    scrollMemoryByTabId[tabKey(tab.id)] = {
      tabId: tab.id,
      windowId: tab.windowId,
      url,
      scrollX: normalized.scrollX,
      scrollY: normalized.scrollY,
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
  }

  async function listTaggedTabs(windowId?: number): Promise<TabWheelTaggedTabEntry[]> {
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return [];
    const tabs = await reconcileWindow(resolvedWindowId);
    return getTaggedEntries(resolvedWindowId, tabs);
  }

  async function getOverview(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelOverview> {
    await ensureLoaded();
    let settings = await loadTabWheelSettings();
    const resolvedWindowId = await resolveCurrentWindowId(windowId ?? tab?.windowId);
    if (resolvedWindowId == null) {
      return {
        activeIndex: 0,
        tabCount: 0,
        cycleScope: settings.cycleScope,
        taggedCount: 0,
        isCurrentTagged: false,
        taggedTabs: [],
        contentScriptStatus: "unavailable",
      };
    }
    const activeTab = await resolveActiveTab(tab, resolvedWindowId);
    const tabs = await reconcileWindow(resolvedWindowId);
    const eligibleTabs = getEligibleTabs(tabs, settings);
    settings = await ensureUsableCycleScope(settings, resolvedWindowId, tabs, eligibleTabs);
    const taggedTabs = getTaggedEntries(resolvedWindowId, tabs);
    const scopeTabs = settings.cycleScope === "tagged"
      ? getTaggedTabs(resolvedWindowId, tabs, eligibleTabs)
      : eligibleTabs;
    const activeIndex = activeTab
      ? scopeTabs.findIndex((candidate) => candidate.id === activeTab.id)
      : -1;
    const contentScriptStatus = await resolveContentScriptStatus(activeTab);
    return {
      activeIndex: activeIndex >= 0 ? activeIndex : 0,
      ...(activeTab?.id != null ? { activeTabId: activeTab.id } : {}),
      tabCount: scopeTabs.length,
      cycleScope: settings.cycleScope,
      taggedCount: taggedTabs.length,
      isCurrentTagged: !!activeTab?.id && taggedTabs.some((entry) => entry.tabId === activeTab.id),
      taggedTabs,
      contentScriptStatus,
    };
  }

  function resolveStripTargetTab(
    activeTab: Tabs.Tab,
    candidateTabs: Tabs.Tab[],
    direction: "prev" | "next",
    wrapAround: boolean,
  ): Tabs.Tab | null {
    const targetIndex = resolveCycleTargetIndex(
      candidateTabs.map(getTabIndex),
      getTabIndex(activeTab),
      direction,
      wrapAround,
    );
    return candidateTabs.find((tab) => getTabIndex(tab) === targetIndex) || null;
  }

  async function cycle(
    direction: "prev" | "next",
    tab?: Tabs.Tab,
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    let settings = await loadTabWheelSettings();
    const activeTab = await resolveActiveTab(tab);
    if (!activeTab?.id || activeTab.windowId == null) {
      return { ok: false, reason: "No active tab" };
    }
    const tabs = await reconcileWindow(activeTab.windowId);
    const eligibleTabs = getEligibleTabs(tabs, settings);
    if (eligibleTabs.length === 0) return { ok: false, reason: "No tabs" };

    await captureTabScroll(activeTab);

    settings = await ensureUsableCycleScope(settings, activeTab.windowId, tabs, eligibleTabs);
    const candidateTabs = settings.cycleScope === "tagged"
      ? getTaggedTabs(activeTab.windowId, tabs, eligibleTabs)
      : eligibleTabs;
    if (candidateTabs.length === 0) return { ok: false, reason: "No tabs" };
    if (settings.cycleScope === "general" && !candidateTabs.some((candidate) => candidate.id === activeTab.id)) {
      return { ok: false, reason: "Current tab is skipped" };
    }

    const targetTab = resolveStripTargetTab(activeTab, candidateTabs, direction, settings.wrapAround);
    if (!targetTab?.id || targetTab.id === activeTab.id) {
      return { ok: false, reason: "Edge of tab list" };
    }

    await browser.tabs.update(targetTab.id, { active: true });
    await restoreScroll(targetTab);
    return { ok: true };
  }

  async function refreshCurrentTab(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelRefreshResult> {
    await ensureLoaded();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) {
      return {
        ok: false,
        reason: "No active tab",
        contentScriptStatus: "unavailable",
      };
    }

    if (!normalizePageUrl(activeTab.url)) {
      contentScriptReadyUrlsByTabId.delete(activeTab.id);
      return {
        ok: false,
        reason: "TabWheel cannot run on this page.",
        overview: await getOverview(activeTab, activeTab.windowId),
        contentScriptStatus: "unavailable",
      };
    }

    await pingContentScript(activeTab);
    const injection = await injectContentScriptIntoTab(activeTab);
    if (injection !== "injected") {
      contentScriptReadyUrlsByTabId.delete(activeTab.id);
      const overview = await getOverview(activeTab, activeTab.windowId);
      return {
        ok: false,
        reason: "TabWheel cannot run on this page.",
        overview,
        contentScriptStatus: overview.contentScriptStatus,
        injected: false,
      };
    }

    const currentTab = await browser.tabs.get(activeTab.id).catch(() => activeTab);
    const isReady = await waitForContentScriptReady(currentTab);
    if (isReady) await notifyWindowTagState(activeTab.windowId);
    const overview = await getOverview(currentTab, activeTab.windowId);
    if (!isReady || overview.contentScriptStatus !== "ready") {
      return {
        ok: false,
        reason: "TabWheel refresh failed",
        overview,
        contentScriptStatus: overview.contentScriptStatus,
        injected: true,
      };
    }

    return {
      ok: true,
      overview,
      contentScriptStatus: "ready",
      injected: true,
    };
  }

  async function toggleCurrentTag(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) return { ok: false, reason: "No active tab" };
    await reconcileWindow(activeTab.windowId);
    const key = windowKey(activeTab.windowId);
    const entries = wheelListByWindowId[key] || [];
    const existing = entries.find((entry) => entry.tabId === activeTab.id);

    if (existing) {
      const nextEntries = entries.filter((entry) => entry.tabId !== activeTab.id);
      if (nextEntries.length > 0) wheelListByWindowId[key] = nextEntries;
      else delete wheelListByWindowId[key];
      await saveWheelList();
      const settings = await loadTabWheelSettings();
      if (settings.cycleScope === "tagged" && nextEntries.length === 0) {
        await saveCycleScope("general");
      }
      await sendStatus(activeTab.id, `Removed from Wheel List (${nextEntries.length})`);
      await notifyWindowTagState(activeTab.windowId);
      return { ok: true, entry: existing, count: nextEntries.length };
    }

    if (entries.length >= MAX_WHEEL_LIST_TABS) {
      const reason = `Wheel List full (${MAX_WHEEL_LIST_TABS})`;
      await sendStatus(activeTab.id, reason);
      return { ok: false, reason, count: entries.length };
    }

    const now = Date.now();
    const entry: TabWheelTaggedTabEntry = {
      tabId: activeTab.id,
      windowId: activeTab.windowId,
      url: normalizeTabUrl(activeTab.url),
      title: normalizeTitle(activeTab.title, activeTab.url),
      pinned: activeTab.pinned === true,
      createdAt: now,
      updatedAt: now,
    };
    wheelListByWindowId[key] = [...entries, entry];
    await saveWheelList();
    const count = (wheelListByWindowId[key] || []).length;
    await sendStatus(activeTab.id, `Added to Wheel List (${count})`);
    await notifyWindowTagState(activeTab.windowId);
    return { ok: true, entry, count };
  }

  async function removeTaggedTab(tabId: number, windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    await reconcileWindow(resolvedWindowId);
    const key = windowKey(resolvedWindowId);
    const entries = wheelListByWindowId[key] || [];
    const entry = entries.find((candidate) => candidate.tabId === tabId);
    if (!entry) return { ok: false, reason: "Tab is not in Wheel List", count: entries.length };
    const nextEntries = entries.filter((candidate) => candidate.tabId !== tabId);
    if (nextEntries.length > 0) wheelListByWindowId[key] = nextEntries;
    else delete wheelListByWindowId[key];
    await saveWheelList();
    const settings = await loadTabWheelSettings();
    if (settings.cycleScope === "tagged" && nextEntries.length === 0) {
      await saveCycleScope("general");
    }
    await notifyWindowTagState(resolvedWindowId);
    return { ok: true, entry, count: nextEntries.length };
  }

  async function clearTaggedTabs(windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    delete wheelListByWindowId[windowKey(resolvedWindowId)];
    await saveWheelList();
    const settings = await loadTabWheelSettings();
    if (settings.cycleScope === "tagged") await saveCycleScope("general");
    await notifyWindowTagState(resolvedWindowId);
    return { ok: true, count: 0 };
  }

  async function activateTaggedTab(tabId: number, windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    const tabs = await reconcileWindow(resolvedWindowId);
    const entries = getTaggedEntries(resolvedWindowId, tabs);
    const entry = entries.find((candidate) => candidate.tabId === tabId);
    if (!entry) return { ok: false, reason: "Tagged tab not found" };
    await browser.tabs.update(tabId, { active: true });
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (tab) await restoreScroll(tab);
    return { ok: true, entry, count: entries.length };
  }

  async function setCycleScope(
    cycleScope: TabWheelCycleScope,
    tab?: Tabs.Tab,
    windowId?: number,
    options: TabWheelStatusOptions = {},
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId ?? tab?.windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    const tabs = await reconcileWindow(resolvedWindowId);
    const settings = await loadTabWheelSettings();
    const eligibleTabs = getEligibleTabs(tabs, settings);
    const shouldSendPageStatus = options.suppressPageStatus !== true;
    if (cycleScope === "tagged" && getTaggedTabs(resolvedWindowId, tabs, eligibleTabs).length === 0) {
      const activeTab = await resolveActiveTab(tab, resolvedWindowId);
      if (shouldSendPageStatus) await sendStatus(activeTab?.id, "Tag a tab first");
      return { ok: false, reason: "Tag a tab first", cycleScope: settings.cycleScope };
    }
    const nextSettings = await saveCycleScope(cycleScope);
    const activeTab = await resolveActiveTab(tab, resolvedWindowId);
    if (shouldSendPageStatus) await sendStatus(activeTab?.id, cycleScope === "tagged" ? "Wheel List cycling" : "General cycling");
    await notifyWindowTagState(resolvedWindowId);
    return { ok: true, cycleScope: nextSettings.cycleScope };
  }

  async function toggleCycleScope(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    const settings = await loadTabWheelSettings();
    return await setCycleScope(settings.cycleScope === "tagged" ? "general" : "tagged", tab, windowId);
  }

  async function saveScrollPosition(
    tabId: number,
    windowId: number,
    rawUrl: string | undefined,
    scrollX: number,
    scrollY: number,
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const url = normalizePageUrl(rawUrl);
    if (!url) return { ok: false, reason: "Unsupported page" };
    const scroll = normalizeScroll(scrollX, scrollY);
    const key = tabKey(tabId);
    const existing = scrollMemoryByTabId[key];
    if (existing?.url === url && existing.scrollX === scroll.scrollX && existing.scrollY === scroll.scrollY) {
      return { ok: true };
    }
    scrollMemoryByTabId[key] = {
      tabId,
      windowId,
      url,
      scrollX: scroll.scrollX,
      scrollY: scroll.scrollY,
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
    return { ok: true };
  }

  function registerLifecycleListeners(): void {
    browser.runtime.onInstalled.addListener(() => {
      void activateExistingContentScripts().catch(() => {});
    });

    browser.tabs.onRemoved.addListener(async (tabId: number) => {
      await ensureLoaded();
      delete scrollMemoryByTabId[tabKey(tabId)];
      contentScriptReadyUrlsByTabId.delete(tabId);
      let changed = false;
      const affectedWindowIds = new Set<number>();
      for (const [key, entries] of Object.entries(wheelListByWindowId)) {
        const nextEntries = entries.filter((entry) => entry.tabId !== tabId);
        if (nextEntries.length !== entries.length) {
          changed = true;
          affectedWindowIds.add(Number(key));
          if (nextEntries.length > 0) wheelListByWindowId[key] = nextEntries;
          else delete wheelListByWindowId[key];
        }
      }
      if (changed) {
        await saveWheelList();
        for (const windowId of affectedWindowIds) await notifyWindowTagState(windowId);
      }
      await saveScrollMemory();
    });

    browser.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string }, tab: Tabs.Tab) => {
      void (async () => {
        await ensureLoaded();
        if (changeInfo.url) contentScriptReadyUrlsByTabId.delete(tabId);
        if (tab.windowId == null) return;
        const entries = wheelListByWindowId[windowKey(tab.windowId)] || [];
        const entry = entries.find((candidate) => candidate.tabId === tabId);
        if (!entry) return;
        if (updateEntryFromTab(entry, tab)) {
          await saveWheelList();
          await notifyWindowTagState(tab.windowId);
        }
      })();
    });

    browser.windows.onRemoved.addListener((windowId: number) => {
      void (async () => {
        await ensureLoaded();
        delete wheelListByWindowId[windowKey(windowId)];
        for (const [key, entry] of Object.entries(scrollMemoryByTabId)) {
          if (entry.windowId === windowId) delete scrollMemoryByTabId[key];
        }
        await saveWheelList();
        await saveScrollMemory();
      })();
    });

    browser.runtime.onStartup.addListener(async () => {
      await ensureLoaded();
      scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
      wheelListByWindowId = {};
      contentScriptReadyUrlsByTabId.clear();
      await saveScrollMemory();
      await browser.storage.local.remove(TABWHEEL_STORAGE_KEYS.wheelList);
      const settings = await loadTabWheelSettings();
      if (settings.cycleScope === "tagged") await saveCycleScope("general");
    });
  }

  return {
    ensureLoaded,
    activateExistingContentScripts,
    getOverview,
    cycle,
    refreshCurrentTab,
    toggleCurrentTag,
    removeTaggedTab,
    clearTaggedTabs,
    listTaggedTabs,
    activateTaggedTab,
    toggleCycleScope,
    setCycleScope,
    saveScrollPosition,
    markContentScriptReady,
    registerLifecycleListeners,
  };
}
