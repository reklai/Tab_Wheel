import browser, { Tabs } from "webextension-polyfill";
import {
  buildSearchUrl,
  loadTabWheelSettings,
  MAX_MRU_TABS,
  MAX_SCROLL_MEMORY_ENTRIES,
  normalizeSearchQuery,
  saveTabWheelSettings,
  TABWHEEL_STORAGE_KEYS,
} from "../../common/contracts/tabWheel";
import { resolveCycleTargetIndex } from "../../core/tabWheel/tabWheelCore";

type ScrollMemoryByTabId = Record<string, TabWheelScrollMemoryEntry>;
type MruTabIdsByWindowId = TabWheelMruState;

interface BrowserDefaultSearchApi {
  query(queryInfo: {
    text: string;
    tabId?: number;
    disposition?: "CURRENT_TAB" | "NEW_TAB" | "NEW_WINDOW";
  }): Promise<void>;
}

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
  openSearchTab(query: string, tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  activateMostRecentTab(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  closeCurrentTabAndActivateRecent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  toggleCycleScope(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult>;
  setCycleScope(cycleScope: TabWheelCycleScope, tab?: Tabs.Tab, windowId?: number, options?: TabWheelStatusOptions): Promise<TabWheelActionResult>;
  saveScrollPosition(tabId: number, windowId: number, url: string | undefined, scroll: ScrollData): Promise<TabWheelActionResult>;
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

function normalizeScroll(scrollX: number, scrollY: number): { scrollX: number; scrollY: number } {
  return {
    scrollX: Math.max(0, Number(scrollX) || 0),
    scrollY: Math.max(0, Number(scrollY) || 0),
  };
}

function normalizeScrollRatio(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeScrollDimension(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function normalizeZoom(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10) return undefined;
  return numeric;
}

function normalizeScrollData(value: Partial<ScrollData>): ScrollData {
  const scroll = normalizeScroll(Number(value.scrollX), Number(value.scrollY));
  const scrollWidth = normalizeScrollDimension(value.scrollWidth);
  const scrollHeight = normalizeScrollDimension(value.scrollHeight);
  const viewportWidth = normalizeScrollDimension(value.viewportWidth);
  const viewportHeight = normalizeScrollDimension(value.viewportHeight);
  const maxScrollX = Math.max(0, scrollWidth - viewportWidth);
  const maxScrollY = Math.max(0, scrollHeight - viewportHeight);
  return {
    scrollX: scroll.scrollX,
    scrollY: scroll.scrollY,
    scrollRatioX: value.scrollRatioX == null
      ? maxScrollX > 0 ? Math.max(0, Math.min(1, scroll.scrollX / maxScrollX)) : 0
      : normalizeScrollRatio(value.scrollRatioX),
    scrollRatioY: value.scrollRatioY == null
      ? maxScrollY > 0 ? Math.max(0, Math.min(1, scroll.scrollY / maxScrollY)) : 0
      : normalizeScrollRatio(value.scrollRatioY),
    scrollWidth,
    scrollHeight,
    viewportWidth,
    viewportHeight,
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
  const scroll = normalizeScrollData(entry);
  const zoom = normalizeZoom(entry.zoom);
  return {
    tabId,
    windowId,
    url,
    scrollX: scroll.scrollX,
    scrollY: scroll.scrollY,
    scrollRatioX: scroll.scrollRatioX,
    scrollRatioY: scroll.scrollRatioY,
    scrollWidth: scroll.scrollWidth,
    scrollHeight: scroll.scrollHeight,
    viewportWidth: scroll.viewportWidth,
    viewportHeight: scroll.viewportHeight,
    ...(zoom != null ? { zoom } : {}),
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

function normalizeMruState(rawValue: unknown): MruTabIdsByWindowId {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) return {};
  const normalized: MruTabIdsByWindowId = {};
  for (const [key, rawTabIds] of Object.entries(rawValue as Record<string, unknown>)) {
    const windowId = Number(key);
    if (!Number.isInteger(windowId) || windowId <= 0 || !Array.isArray(rawTabIds)) continue;
    const seenTabIds = new Set<number>();
    const tabIds = rawTabIds
      .map((value) => Number(value))
      .filter((tabId) => {
        if (!Number.isInteger(tabId) || tabId <= 0 || seenTabIds.has(tabId)) return false;
        seenTabIds.add(tabId);
        return true;
      })
      .slice(0, MAX_MRU_TABS);
    if (tabIds.length > 0) normalized[key] = tabIds;
  }
  return normalized;
}

function getTabIndex(tab: Tabs.Tab): number {
  return Number(tab.index) || 0;
}

function isRestrictedTab(tab: Tabs.Tab): boolean {
  return !normalizePageUrl(tab.url);
}

function getBrowserDefaultSearchApi(): BrowserDefaultSearchApi | null {
  const searchApi = (browser as unknown as { search?: Partial<BrowserDefaultSearchApi> }).search;
  return typeof searchApi?.query === "function"
    ? searchApi as BrowserDefaultSearchApi
    : null;
}

function getEligibleTabs(tabs: Tabs.Tab[], settings: TabWheelSettings): Tabs.Tab[] {
  return tabs
    .filter((tab) => tab.id != null)
    .filter((tab) => !settings.skipPinnedTabs || tab.pinned !== true)
    .filter((tab) => !settings.skipRestrictedPages || !isRestrictedTab(tab))
    .sort((left, right) => getTabIndex(left) - getTabIndex(right));
}

function hasSameNumberList(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createTabWheelDomain(): TabWheelDomain {
  let scrollMemoryByTabId: ScrollMemoryByTabId = {};
  let mruTabIdsByWindowId: MruTabIdsByWindowId = {};
  const contentScriptReadyUrlsByTabId = new Map<number, string>();
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    const stored = await browser.storage.local.get([
      TABWHEEL_STORAGE_KEYS.scrollMemory,
      TABWHEEL_STORAGE_KEYS.mruState,
    ]);
    scrollMemoryByTabId = normalizeScrollMemory(
      stored[TABWHEEL_STORAGE_KEYS.scrollMemory],
    );
    mruTabIdsByWindowId = normalizeMruState(stored[TABWHEEL_STORAGE_KEYS.mruState]);
    loaded = true;
  }

  async function saveScrollMemory(): Promise<void> {
    scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.scrollMemory]: scrollMemoryByTabId,
    });
  }

  async function saveMruState(): Promise<void> {
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.mruState]: mruTabIdsByWindowId,
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

  async function reconcileMruWindow(windowId: number, tabs: Tabs.Tab[]): Promise<void> {
    await ensureLoaded();
    const key = windowKey(windowId);
    const tabIds = new Set(tabs.map((tab) => tab.id).filter((tabId): tabId is number => tabId != null));
    const current = mruTabIdsByWindowId[key] || [];
    const next = current.filter((tabId) => tabIds.has(tabId)).slice(0, MAX_MRU_TABS);
    if (hasSameNumberList(current, next)) return;
    if (next.length > 0) mruTabIdsByWindowId[key] = next;
    else delete mruTabIdsByWindowId[key];
    await saveMruState();
  }

  async function recordMruTab(tabId: number, windowId: number): Promise<void> {
    await ensureLoaded();
    if (!Number.isInteger(tabId) || tabId <= 0 || !Number.isInteger(windowId) || windowId <= 0) return;
    const key = windowKey(windowId);
    const current = mruTabIdsByWindowId[key] || [];
    const next = [tabId, ...current.filter((candidate) => candidate !== tabId)].slice(0, MAX_MRU_TABS);
    if (hasSameNumberList(current, next)) return;
    mruTabIdsByWindowId[key] = next;
    await saveMruState();
  }

  function getMruOrderedTabs(windowId: number, eligibleTabs: Tabs.Tab[]): Tabs.Tab[] {
    const eligibleById = new Map<number, Tabs.Tab>();
    for (const tab of eligibleTabs) {
      if (tab.id != null) eligibleById.set(tab.id, tab);
    }

    const seenTabIds = new Set<number>();
    const ordered: Tabs.Tab[] = [];
    for (const tabId of mruTabIdsByWindowId[windowKey(windowId)] || []) {
      const tab = eligibleById.get(tabId);
      if (!tab || seenTabIds.has(tabId)) continue;
      ordered.push(tab);
      seenTabIds.add(tabId);
    }

    for (const tab of eligibleTabs) {
      if (tab.id == null || seenTabIds.has(tab.id)) continue;
      ordered.push(tab);
      seenTabIds.add(tab.id);
    }
    return ordered;
  }

  function getCycleTabs(
    windowId: number,
    eligibleTabs: Tabs.Tab[],
    settings: TabWheelSettings,
  ): Tabs.Tab[] {
    return settings.cycleScope === "mru"
      ? getMruOrderedTabs(windowId, eligibleTabs)
      : eligibleTabs;
  }

  async function saveCycleScope(cycleScope: TabWheelCycleScope): Promise<TabWheelSettings> {
    const settings = await loadTabWheelSettings();
    const nextSettings = { ...settings, cycleScope };
    await saveTabWheelSettings(nextSettings);
    return nextSettings;
  }

  async function sendStatus(tabId: number | undefined, message: string): Promise<void> {
    if (tabId == null) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "TABWHEEL_STATUS", message });
    } catch (_) {
      // Status is best-effort; restricted pages cannot receive content messages.
    }
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

  async function getTabZoom(tabId: number): Promise<number | undefined> {
    try {
      return normalizeZoom(await browser.tabs.getZoom(tabId));
    } catch (_) {
      return undefined;
    }
  }

  async function restoreTabZoom(tabId: number, zoom: number | undefined): Promise<void> {
    if (zoom == null) return;
    try {
      const currentZoom = await getTabZoom(tabId);
      if (currentZoom != null && Math.abs(currentZoom - zoom) <= 0.001) return;
      await browser.tabs.setZoom(tabId, zoom);
    } catch (_) {
      // Zoom restore is best-effort; some pages reject extension zoom changes.
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
    if (tab.windowId != null) void recordMruTab(tab.id, tab.windowId).catch(() => {});
    return { ok: true };
  }

  async function restoreScroll(tab: Tabs.Tab): Promise<boolean> {
    if (tab.id == null) return false;
    const entry = scrollMemoryByTabId[tabKey(tab.id)];
    const currentUrl = normalizePageUrl(tab.url);
    if (!currentUrl || entry?.url !== currentUrl) return false;
    if (!entry) return false;
    await restoreTabZoom(tab.id, entry.zoom);
    const retryDelaysMs = [0, 80, 220, 500, 900, 1500, 2400, 3600];
    for (const delay of retryDelaysMs) {
      if (delay > 0) await sleep(delay);
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "SET_SCROLL",
          scrollX: entry.scrollX,
          scrollY: entry.scrollY,
          scrollRatioX: entry.scrollRatioX,
          scrollRatioY: entry.scrollRatioY,
          scrollWidth: entry.scrollWidth,
          scrollHeight: entry.scrollHeight,
          viewportWidth: entry.viewportWidth,
          viewportHeight: entry.viewportHeight,
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
    const normalized = normalizeScrollData(scroll);
    const zoom = await getTabZoom(tab.id);
    scrollMemoryByTabId[tabKey(tab.id)] = {
      tabId: tab.id,
      windowId: tab.windowId,
      url,
      scrollX: normalized.scrollX,
      scrollY: normalized.scrollY,
      scrollRatioX: normalized.scrollRatioX,
      scrollRatioY: normalized.scrollRatioY,
      scrollWidth: normalized.scrollWidth,
      scrollHeight: normalized.scrollHeight,
      viewportWidth: normalized.viewportWidth,
      viewportHeight: normalized.viewportHeight,
      ...(zoom != null ? { zoom } : {}),
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
  }

  async function getOverview(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelOverview> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const resolvedWindowId = await resolveCurrentWindowId(windowId ?? tab?.windowId);
    if (resolvedWindowId == null) {
      return {
        activeIndex: 0,
        tabCount: 0,
        cycleScope: settings.cycleScope,
        contentScriptStatus: "unavailable",
      };
    }
    const activeTab = await resolveActiveTab(tab, resolvedWindowId);
    const tabs = await getWindowTabs(resolvedWindowId);
    await reconcileMruWindow(resolvedWindowId, tabs);
    const eligibleTabs = getEligibleTabs(tabs, settings);
    const scopeTabs = getCycleTabs(resolvedWindowId, eligibleTabs, settings);
    const activeIndex = activeTab
      ? scopeTabs.findIndex((candidate) => candidate.id === activeTab.id)
      : -1;
    const contentScriptStatus = await resolveContentScriptStatus(activeTab);
    return {
      activeIndex: activeIndex >= 0 ? activeIndex : 0,
      ...(activeTab?.id != null ? { activeTabId: activeTab.id } : {}),
      tabCount: scopeTabs.length,
      cycleScope: settings.cycleScope,
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

  function resolveMruCycleTargetTab(
    activeTab: Tabs.Tab,
    candidateTabs: Tabs.Tab[],
    direction: "prev" | "next",
    wrapAround: boolean,
  ): Tabs.Tab | null {
    if (candidateTabs.length === 0) return null;
    const activePosition = candidateTabs.findIndex((candidate) => candidate.id === activeTab.id);
    if (activePosition < 0) return candidateTabs[0] || null;
    if (direction === "next") {
      const nextPosition = activePosition + 1;
      if (nextPosition < candidateTabs.length) return candidateTabs[nextPosition];
      return wrapAround ? candidateTabs[0] : activeTab;
    }
    const previousPosition = activePosition - 1;
    if (previousPosition >= 0) return candidateTabs[previousPosition];
    return wrapAround ? candidateTabs[candidateTabs.length - 1] : activeTab;
  }

  function resolveMostRecentTab(
    activeTab: Tabs.Tab,
    windowId: number,
    eligibleTabs: Tabs.Tab[],
  ): Tabs.Tab | null {
    const eligibleById = new Map<number, Tabs.Tab>();
    for (const tab of eligibleTabs) {
      if (tab.id != null) eligibleById.set(tab.id, tab);
    }
    for (const tabId of mruTabIdsByWindowId[windowKey(windowId)] || []) {
      if (tabId === activeTab.id) continue;
      const tab = eligibleById.get(tabId);
      if (tab) return tab;
    }
    return resolveStripTargetTab(activeTab, eligibleTabs, "prev", true);
  }

  async function activateTab(targetTab: Tabs.Tab): Promise<void> {
    if (targetTab.id == null) return;
    await browser.tabs.update(targetTab.id, { active: true });
    if (targetTab.windowId != null) await recordMruTab(targetTab.id, targetTab.windowId);
    await restoreScroll(targetTab);
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
    await reconcileMruWindow(activeTab.windowId, tabs);
    const eligibleTabs = getEligibleTabs(tabs, settings);
    if (eligibleTabs.length === 0) return { ok: false, reason: "No eligible tabs" };

    await captureTabScroll(activeTab);

    const candidateTabs = getCycleTabs(activeTab.windowId, eligibleTabs, settings);
    const targetTab = settings.cycleScope === "mru"
      ? resolveMruCycleTargetTab(activeTab, candidateTabs, direction, settings.wrapAround)
      : resolveStripTargetTab(activeTab, candidateTabs, direction, settings.wrapAround);
    if (!targetTab?.id || targetTab.id === activeTab.id) {
      return { ok: false, reason: "Edge of tab list" };
    }

    await activateTab(targetTab);
    return { ok: true, tabId: targetTab.id };
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

    const wasReady = await pingContentScript(activeTab);
    const injection = await injectContentScriptIntoTab(activeTab);
    if (injection !== "injected") {
      const overview = await getOverview(activeTab, activeTab.windowId);
      if (wasReady || overview.contentScriptStatus === "ready") {
        return {
          ok: true,
          overview,
          contentScriptStatus: overview.contentScriptStatus,
          injected: false,
        };
      }
      contentScriptReadyUrlsByTabId.delete(activeTab.id);
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

  async function openSearchTab(query: string, tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return { ok: false, reason: "Enter a search query" };
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const activeTab = await resolveActiveTab(tab, windowId);
    const searchApi = getBrowserDefaultSearchApi();
    const createProperties: Tabs.CreateCreatePropertiesType = {
      active: true,
      url: searchApi ? "about:blank" : buildSearchUrl(settings.searchUrlTemplate, normalizedQuery),
      ...(activeTab?.windowId != null ? { windowId: activeTab.windowId } : {}),
      ...(activeTab?.index != null ? { index: activeTab.index + 1 } : {}),
    };
    const createdTab = await browser.tabs.create(createProperties);
    if (createdTab.id != null && searchApi) {
      const didUseBrowserDefaultSearch = await searchApi
        .query({ text: normalizedQuery, tabId: createdTab.id })
        .then(() => true)
        .catch(() => false);
      if (!didUseBrowserDefaultSearch) {
        const didUseFallbackSearch = await browser.tabs
          .update(createdTab.id, {
            url: buildSearchUrl(settings.searchUrlTemplate, normalizedQuery),
          })
          .then(() => true)
          .catch(() => false);
        if (!didUseFallbackSearch) {
          await browser.tabs.remove(createdTab.id).catch(() => {});
          return { ok: false, reason: "Search unavailable" };
        }
      }
    }
    if (createdTab.id != null && createdTab.windowId != null) {
      await recordMruTab(createdTab.id, createdTab.windowId);
    }
    return { ok: true, tabId: createdTab.id };
  }

  async function activateMostRecentTab(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) return { ok: false, reason: "No active tab" };
    const tabs = await getWindowTabs(activeTab.windowId);
    await reconcileMruWindow(activeTab.windowId, tabs);
    const eligibleTabs = getEligibleTabs(tabs, settings).filter((candidate) => candidate.id !== activeTab.id);
    if (eligibleTabs.length === 0) return { ok: false, reason: "No recent tab" };
    await captureTabScroll(activeTab);
    const targetTab = resolveMostRecentTab(activeTab, activeTab.windowId, eligibleTabs);
    if (!targetTab?.id) return { ok: false, reason: "No recent tab" };
    await activateTab(targetTab);
    return { ok: true, tabId: targetTab.id };
  }

  async function closeCurrentTabAndActivateRecent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const settings = await loadTabWheelSettings();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) return { ok: false, reason: "No active tab" };
    const tabs = await getWindowTabs(activeTab.windowId);
    await reconcileMruWindow(activeTab.windowId, tabs);
    const eligibleTabs = getEligibleTabs(tabs, settings).filter((candidate) => candidate.id !== activeTab.id);
    const targetTab = eligibleTabs.length > 0
      ? resolveMostRecentTab(activeTab, activeTab.windowId, eligibleTabs)
      : null;
    if (targetTab?.id) await activateTab(targetTab);
    await browser.tabs.remove(activeTab.id);
    return { ok: true, tabId: targetTab?.id };
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
    const nextSettings = await saveCycleScope(cycleScope);
    const activeTab = await resolveActiveTab(tab, resolvedWindowId);
    if (options.suppressPageStatus !== true) {
      await sendStatus(activeTab?.id, cycleScope === "mru" ? "MRU scrolling" : "General scrolling");
    }
    return { ok: true, cycleScope: nextSettings.cycleScope };
  }

  async function toggleCycleScope(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelActionResult> {
    const settings = await loadTabWheelSettings();
    return await setCycleScope(settings.cycleScope === "mru" ? "general" : "mru", tab, windowId);
  }

  async function saveScrollPosition(
    tabId: number,
    windowId: number,
    rawUrl: string | undefined,
    scrollData: ScrollData,
  ): Promise<TabWheelActionResult> {
    await ensureLoaded();
    const url = normalizePageUrl(rawUrl);
    if (!url) return { ok: false, reason: "Unsupported page" };
    const scroll = normalizeScrollData(scrollData);
    const zoom = await getTabZoom(tabId);
    const key = tabKey(tabId);
    const existing = scrollMemoryByTabId[key];
    if (
      existing?.url === url
      && existing.scrollX === scroll.scrollX
      && existing.scrollY === scroll.scrollY
      && existing.scrollRatioX === scroll.scrollRatioX
      && existing.scrollRatioY === scroll.scrollRatioY
      && existing.scrollWidth === scroll.scrollWidth
      && existing.scrollHeight === scroll.scrollHeight
      && existing.viewportWidth === scroll.viewportWidth
      && existing.viewportHeight === scroll.viewportHeight
      && existing.zoom === zoom
    ) {
      return { ok: true };
    }
    scrollMemoryByTabId[key] = {
      tabId,
      windowId,
      url,
      scrollX: scroll.scrollX,
      scrollY: scroll.scrollY,
      scrollRatioX: scroll.scrollRatioX,
      scrollRatioY: scroll.scrollRatioY,
      scrollWidth: scroll.scrollWidth,
      scrollHeight: scroll.scrollHeight,
      viewportWidth: scroll.viewportWidth,
      viewportHeight: scroll.viewportHeight,
      ...(zoom != null ? { zoom } : {}),
      updatedAt: Date.now(),
    };
    await saveScrollMemory();
    return { ok: true };
  }

  function registerLifecycleListeners(): void {
    browser.runtime.onInstalled.addListener(() => {
      void activateExistingContentScripts().catch(() => {});
    });

    browser.tabs.onActivated.addListener((activeInfo: { tabId: number; windowId: number }) => {
      void recordMruTab(activeInfo.tabId, activeInfo.windowId).catch(() => {});
    });

    browser.tabs.onRemoved.addListener(async (tabId: number) => {
      await ensureLoaded();
      delete scrollMemoryByTabId[tabKey(tabId)];
      contentScriptReadyUrlsByTabId.delete(tabId);

      let mruChanged = false;
      for (const [key, tabIds] of Object.entries(mruTabIdsByWindowId)) {
        const nextTabIds = tabIds.filter((candidate) => candidate !== tabId);
        if (nextTabIds.length === tabIds.length) continue;
        mruChanged = true;
        if (nextTabIds.length > 0) mruTabIdsByWindowId[key] = nextTabIds;
        else delete mruTabIdsByWindowId[key];
      }
      if (mruChanged) await saveMruState();
      await saveScrollMemory();
    });

    browser.tabs.onUpdated.addListener((tabId: number, changeInfo: { url?: string }) => {
      if (changeInfo.url) contentScriptReadyUrlsByTabId.delete(tabId);
    });

    browser.windows.onRemoved.addListener((windowId: number) => {
      void (async () => {
        await ensureLoaded();
        delete mruTabIdsByWindowId[windowKey(windowId)];
        for (const [key, entry] of Object.entries(scrollMemoryByTabId)) {
          if (entry.windowId === windowId) delete scrollMemoryByTabId[key];
        }
        await saveMruState();
        await saveScrollMemory();
      })();
    });

    browser.runtime.onStartup.addListener(async () => {
      await ensureLoaded();
      scrollMemoryByTabId = trimScrollMemory(scrollMemoryByTabId);
      mruTabIdsByWindowId = {};
      contentScriptReadyUrlsByTabId.clear();
      await saveScrollMemory();
      await browser.storage.local.remove(TABWHEEL_STORAGE_KEYS.mruState);
    });
  }

  return {
    ensureLoaded,
    activateExistingContentScripts,
    getOverview,
    cycle,
    refreshCurrentTab,
    openSearchTab,
    activateMostRecentTab,
    closeCurrentTabAndActivateRecent,
    toggleCycleScope,
    setCycleScope,
    saveScrollPosition,
    markContentScriptReady,
    registerLifecycleListeners,
  };
}
