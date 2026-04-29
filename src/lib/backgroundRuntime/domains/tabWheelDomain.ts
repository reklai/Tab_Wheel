import browser, { Tabs } from "webextension-polyfill";
import {
  MAX_TAGGED_TABS,
  TABWHEEL_STORAGE_KEYS,
} from "../../common/contracts/tabWheel";
import { resolveCycleTargetIndex } from "../../core/tabWheel/tabWheelCore";

type TaggedTabsByWindowId = Record<string, TaggedTabEntry[]>;

interface BadgeAction {
  setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
}

export interface TabWheelDomain {
  ensureLoaded(): Promise<void>;
  getCurrentState(tab?: Tabs.Tab): Promise<TabWheelCurrentState>;
  list(windowId?: number): Promise<TaggedTabEntry[]>;
  tagCurrent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelMutationResult>;
  removeCurrent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelMutationResult>;
  removeTab(tabId: number, windowId?: number): Promise<TabWheelMutationResult>;
  clearWindow(windowId?: number): Promise<TabWheelMutationResult>;
  activate(tabId: number, windowId?: number): Promise<TabWheelMutationResult>;
  cycle(direction: "prev" | "next", tab?: Tabs.Tab): Promise<TabWheelMutationResult>;
  saveScrollPosition(tabId: number, scrollX: number, scrollY: number): Promise<TabWheelMutationResult>;
  registerLifecycleListeners(): void;
}

const TAGGED_BADGE_TEXT = "TAG";
const TAGGED_BADGE_COLOR = "#32d74b";

function windowKey(windowId: number): string {
  return String(windowId);
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

function normalizeTaggedEntry(rawEntry: unknown): TaggedTabEntry | null {
  if (typeof rawEntry !== "object" || rawEntry === null) return null;
  const entry = rawEntry as Partial<TaggedTabEntry>;
  const tabId = Number(entry.tabId);
  const windowId = Number(entry.windowId);
  if (!Number.isInteger(tabId) || tabId <= 0) return null;
  if (!Number.isInteger(windowId) || windowId <= 0) return null;
  const scroll = normalizeScroll(Number(entry.scrollX), Number(entry.scrollY));
  return {
    tabId,
    windowId,
    url: typeof entry.url === "string" ? entry.url : "",
    title: normalizeTitle(entry.title, entry.url),
    pinned: entry.pinned === true,
    scrollX: scroll.scrollX,
    scrollY: scroll.scrollY,
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : Date.now(),
  };
}

function normalizeTaggedTabsByWindow(rawValue: unknown): TaggedTabsByWindowId {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) return {};
  const normalized: TaggedTabsByWindowId = {};
  for (const [key, rawEntries] of Object.entries(rawValue as Record<string, unknown>)) {
    const windowId = Number(key);
    if (!Number.isInteger(windowId) || windowId <= 0 || !Array.isArray(rawEntries)) continue;
    const entries = rawEntries
      .map(normalizeTaggedEntry)
      .filter((entry): entry is TaggedTabEntry => !!entry)
      .filter((entry) => entry.windowId === windowId)
      .slice(0, MAX_TAGGED_TABS);
    if (entries.length > 0) normalized[key] = entries;
  }
  return normalized;
}

export function createTabWheelDomain(): TabWheelDomain {
  let taggedTabsByWindowId: TaggedTabsByWindowId = {};
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    const stored = await browser.storage.local.get(TABWHEEL_STORAGE_KEYS.taggedTabs);
    taggedTabsByWindowId = normalizeTaggedTabsByWindow(
      stored[TABWHEEL_STORAGE_KEYS.taggedTabs],
    );
    loaded = true;
  }

  async function saveTaggedTabs(): Promise<void> {
    await browser.storage.local.set({
      [TABWHEEL_STORAGE_KEYS.taggedTabs]: taggedTabsByWindowId,
    });
  }

  function getBadgeAction(): BadgeAction | null {
    const api = browser as unknown as { action?: BadgeAction; browserAction?: BadgeAction };
    return api.action || api.browserAction || null;
  }

  function getTaggedTabIds(windowId?: number): Set<number> {
    const ids = new Set<number>();
    const entryLists = windowId != null
      ? [taggedTabsByWindowId[windowKey(windowId)] || []]
      : Object.values(taggedTabsByWindowId);
    for (const entries of entryLists) {
      for (const entry of entries) ids.add(entry.tabId);
    }
    return ids;
  }

  async function updateBadge(windowId?: number): Promise<void> {
    await ensureLoaded();
    const badge = getBadgeAction();
    if (!badge) return;
    const taggedTabIds = getTaggedTabIds(windowId);
    const tabs = await browser.tabs.query(windowId != null ? { windowId } : {});

    await badge.setBadgeText({ text: "" }).catch(() => {});
    for (const tab of tabs) {
      if (tab.id == null) continue;
      await badge.setBadgeBackgroundColor({
        tabId: tab.id,
        color: TAGGED_BADGE_COLOR,
      }).catch(() => {});
      await badge.setBadgeText({
        tabId: tab.id,
        text: taggedTabIds.has(tab.id) ? TAGGED_BADGE_TEXT : "",
      }).catch(() => {});
    }
  }

  async function notifyWindowTagState(windowId: number): Promise<void> {
    await ensureLoaded();
    const entries = taggedTabsByWindowId[windowKey(windowId)] || [];
    const taggedTabIds = new Set(entries.map((entry) => entry.tabId));
    const tabs = await browser.tabs.query({ windowId });
    await Promise.all(tabs.map(async (tab) => {
      if (tab.id == null) return;
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "TABWHEEL_TAG_STATE_CHANGED",
          isTagged: taggedTabIds.has(tab.id),
          count: entries.length,
        });
      } catch (_) {
        // Restricted or unloaded pages cannot receive content messages.
      }
    }));
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

  function updateEntryFromTab(entry: TaggedTabEntry, tab: Tabs.Tab): boolean {
    let changed = false;
    const nextUrl = tab.url || entry.url;
    const nextTitle = normalizeTitle(tab.title, nextUrl);
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

  async function reconcileWindow(windowId: number): Promise<Tabs.Tab[]> {
    await ensureLoaded();
    const key = windowKey(windowId);
    const entries = taggedTabsByWindowId[key] || [];
    const tabs = await getWindowTabs(windowId);
    const tabsById = new Map<number, Tabs.Tab>();
    for (const tab of tabs) {
      if (tab.id != null) tabsById.set(tab.id, tab);
    }

    let changed = false;
    const nextEntries: TaggedTabEntry[] = [];
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
      if (taggedTabsByWindowId[key]) {
        delete taggedTabsByWindowId[key];
        changed = true;
      }
    } else {
      taggedTabsByWindowId[key] = nextEntries.slice(0, MAX_TAGGED_TABS);
    }

    if (changed) await saveTaggedTabs();
    await updateBadge(windowId);
    return tabs;
  }

  function sortEntriesByTabOrder(entries: TaggedTabEntry[], tabs: Tabs.Tab[]): TaggedTabEntry[] {
    const indexByTabId = new Map<number, number>();
    for (const tab of tabs) {
      if (tab.id != null) indexByTabId.set(tab.id, Number(tab.index) || 0);
    }
    return entries
      .slice()
      .sort((left, right) => {
        const leftIndex = indexByTabId.get(left.tabId) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = indexByTabId.get(right.tabId) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });
  }

  async function list(windowId?: number): Promise<TaggedTabEntry[]> {
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return [];
    const tabs = await reconcileWindow(resolvedWindowId);
    const entries = taggedTabsByWindowId[windowKey(resolvedWindowId)] || [];
    return sortEntriesByTabOrder(entries, tabs);
  }

  async function getCurrentState(tab?: Tabs.Tab): Promise<TabWheelCurrentState> {
    await ensureLoaded();
    if (!tab?.id || tab.windowId == null) {
      return { isTagged: false, count: 0 };
    }
    await reconcileWindow(tab.windowId);
    const entries = taggedTabsByWindowId[windowKey(tab.windowId)] || [];
    const entry = entries.find((candidate) => candidate.tabId === tab.id);
    return {
      isTagged: !!entry,
      count: entries.length,
      ...(entry ? { entry } : {}),
    };
  }

  async function getScroll(tabId: number): Promise<ScrollData> {
    try {
      return (await browser.tabs.sendMessage(tabId, { type: "GET_SCROLL" })) as ScrollData;
    } catch (_) {
      return { scrollX: 0, scrollY: 0 };
    }
  }

  async function sendStatus(tabId: number | undefined, message: string): Promise<void> {
    if (tabId == null) return;
    try {
      await browser.tabs.sendMessage(tabId, { type: "TABWHEEL_STATUS", message });
    } catch (_) {
      // Status is best-effort; restricted pages cannot receive content messages.
    }
  }

  async function restoreScroll(tabId: number, scrollX: number, scrollY: number): Promise<void> {
    const scroll = normalizeScroll(scrollX, scrollY);
    if (!scroll.scrollX && !scroll.scrollY) return;
    const retryDelaysMs = [0, 80, 220, 500, 900, 1500, 2400, 3600];
    for (const delay of retryDelaysMs) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await browser.tabs.sendMessage(tabId, {
          type: "SET_SCROLL",
          scrollX: scroll.scrollX,
          scrollY: scroll.scrollY,
        });
        return;
      } catch (_) {
        // Content script may be unavailable or not ready.
      }
    }
  }

  async function tagCurrent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) {
      return { ok: false, reason: "No active tab" };
    }
    const tabs = await reconcileWindow(activeTab.windowId);
    const key = windowKey(activeTab.windowId);
    const entries = taggedTabsByWindowId[key] || [];
    const existing = entries.find((entry) => entry.tabId === activeTab.id);
    const scroll = await getScroll(activeTab.id);
    if (existing) {
      existing.scrollX = scroll.scrollX || 0;
      existing.scrollY = scroll.scrollY || 0;
      updateEntryFromTab(existing, activeTab);
      existing.updatedAt = Date.now();
      await saveTaggedTabs();
      await sendStatus(activeTab.id, "Already tagged");
      await updateBadge(activeTab.windowId);
      await notifyWindowTagState(activeTab.windowId);
      return {
        ok: true,
        entry: existing,
        count: entries.length,
        alreadyTagged: true,
      };
    }
    if (entries.length >= MAX_TAGGED_TABS) {
      const reason = `TabWheel full (max ${MAX_TAGGED_TABS})`;
      await sendStatus(activeTab.id, reason);
      return { ok: false, reason, count: entries.length };
    }
    const now = Date.now();
    const entry: TaggedTabEntry = {
      tabId: activeTab.id,
      windowId: activeTab.windowId,
      url: activeTab.url || "",
      title: normalizeTitle(activeTab.title, activeTab.url),
      pinned: activeTab.pinned === true,
      scrollX: scroll.scrollX || 0,
      scrollY: scroll.scrollY || 0,
      createdAt: now,
      updatedAt: now,
    };
    taggedTabsByWindowId[key] = [...entries, entry];
    await saveTaggedTabs();
    const count = (taggedTabsByWindowId[key] || []).length;
    await sendStatus(activeTab.id, `Tagged tab (${count}/${MAX_TAGGED_TABS})`);
    await updateBadge(activeTab.windowId);
    await notifyWindowTagState(activeTab.windowId);
    void tabs;
    return { ok: true, entry, count };
  }

  async function removeCurrent(tab?: Tabs.Tab, windowId?: number): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const activeTab = await resolveActiveTab(tab, windowId);
    if (!activeTab?.id || activeTab.windowId == null) {
      return { ok: false, reason: "No active tab" };
    }
    await reconcileWindow(activeTab.windowId);
    const key = windowKey(activeTab.windowId);
    const entries = taggedTabsByWindowId[key] || [];
    const nextEntries = entries.filter((entry) => entry.tabId !== activeTab.id);
    if (nextEntries.length === entries.length) {
      await sendStatus(activeTab.id, "Tab was not tagged");
      return { ok: false, reason: "Tab was not tagged", count: entries.length };
    }
    if (nextEntries.length > 0) taggedTabsByWindowId[key] = nextEntries;
    else delete taggedTabsByWindowId[key];
    await saveTaggedTabs();
    await sendStatus(activeTab.id, "Removed tag");
    await updateBadge(activeTab.windowId);
    await notifyWindowTagState(activeTab.windowId);
    return { ok: true, count: nextEntries.length };
  }

  async function removeTab(
    tabId: number,
    windowId?: number,
  ): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    await reconcileWindow(resolvedWindowId);
    const key = windowKey(resolvedWindowId);
    const entries = taggedTabsByWindowId[key] || [];
    const entry = entries.find((candidate) => candidate.tabId === tabId);
    if (!entry) {
      return { ok: false, reason: "Tab was not tagged", count: entries.length };
    }
    const nextEntries = entries.filter((candidate) => candidate.tabId !== tabId);
    if (nextEntries.length > 0) taggedTabsByWindowId[key] = nextEntries;
    else delete taggedTabsByWindowId[key];
    await saveTaggedTabs();
    await sendStatus(tabId, "Removed tag");
    await updateBadge(resolvedWindowId);
    await notifyWindowTagState(resolvedWindowId);
    return { ok: true, entry, count: nextEntries.length };
  }

  async function clearWindow(windowId?: number): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    const key = windowKey(resolvedWindowId);
    const count = (taggedTabsByWindowId[key] || []).length;
    delete taggedTabsByWindowId[key];
    await saveTaggedTabs();
    await updateBadge(resolvedWindowId);
    await notifyWindowTagState(resolvedWindowId);
    const [tab] = await browser.tabs.query({ active: true, windowId: resolvedWindowId });
    await sendStatus(tab?.id, count > 0 ? `Cleared ${count} tags` : "No tagged tabs");
    return { ok: true, count: 0 };
  }

  async function captureTaggedTabScroll(tab: Tabs.Tab): Promise<void> {
    if (tab.id == null || tab.windowId == null) return;
    const key = windowKey(tab.windowId);
    const entry = (taggedTabsByWindowId[key] || []).find((candidate) => candidate.tabId === tab.id);
    if (!entry) return;
    const scroll = await getScroll(tab.id);
    entry.scrollX = scroll.scrollX || 0;
    entry.scrollY = scroll.scrollY || 0;
    entry.updatedAt = Date.now();
    await saveTaggedTabs();
  }

  async function cycle(
    direction: "prev" | "next",
    tab?: Tabs.Tab,
  ): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const activeTab = await resolveActiveTab(tab);
    if (!activeTab?.id || activeTab.windowId == null) {
      return { ok: false, reason: "No active tab" };
    }
    const tabs = await reconcileWindow(activeTab.windowId);
    if (tabs.length === 0) return { ok: false, reason: "No tabs" };
    await captureTaggedTabScroll(activeTab);

    const entries = sortEntriesByTabOrder(
      taggedTabsByWindowId[windowKey(activeTab.windowId)] || [],
      tabs,
    );
    const allIndices = tabs.map((candidate) => Number(candidate.index) || 0);
    const taggedTabIds = new Set(entries.map((entry) => entry.tabId));
    const taggedIndices = tabs
      .filter((candidate) => candidate.id != null && taggedTabIds.has(candidate.id))
      .map((candidate) => Number(candidate.index) || 0);
    const targetIndex = resolveCycleTargetIndex(
      allIndices,
      taggedIndices,
      Number(activeTab.index) || 0,
      direction,
    );
    const targetTab = tabs.find((candidate) => Number(candidate.index) === targetIndex);
    if (!targetTab?.id) return { ok: false, reason: "No target tab" };

    await browser.tabs.update(targetTab.id, { active: true });
    const targetEntry = entries.find((entry) => entry.tabId === targetTab.id);
    if (targetEntry) {
      await restoreScroll(targetTab.id, targetEntry.scrollX, targetEntry.scrollY);
      await sendStatus(
        targetTab.id,
        `Tagged ${entries.findIndex((entry) => entry.tabId === targetTab.id) + 1}/${entries.length}`,
      );
    } else {
      await sendStatus(targetTab.id, "Cycling all tabs");
    }
    await updateBadge(activeTab.windowId);
    return {
      ok: true,
      entry: targetEntry,
      count: entries.length,
    };
  }

  async function activate(tabId: number, windowId?: number): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const resolvedWindowId = await resolveCurrentWindowId(windowId);
    if (resolvedWindowId == null) return { ok: false, reason: "No current window" };
    const entries = await list(resolvedWindowId);
    const entry = entries.find((candidate) => candidate.tabId === tabId);
    if (!entry) return { ok: false, reason: "Tagged tab not found" };
    await browser.tabs.update(tabId, { active: true });
    await restoreScroll(tabId, entry.scrollX, entry.scrollY);
    await sendStatus(tabId, `Tagged ${entries.findIndex((candidate) => candidate.tabId === tabId) + 1}/${entries.length}`);
    return { ok: true, entry, count: entries.length };
  }

  async function saveScrollPosition(
    tabId: number,
    scrollX: number,
    scrollY: number,
  ): Promise<TabWheelMutationResult> {
    await ensureLoaded();
    const scroll = normalizeScroll(scrollX, scrollY);
    for (const entries of Object.values(taggedTabsByWindowId)) {
      const entry = entries.find((candidate) => candidate.tabId === tabId);
      if (!entry) continue;
      if (entry.scrollX === scroll.scrollX && entry.scrollY === scroll.scrollY) {
        return { ok: true, entry };
      }
      entry.scrollX = scroll.scrollX;
      entry.scrollY = scroll.scrollY;
      entry.updatedAt = Date.now();
      await saveTaggedTabs();
      return { ok: true, entry };
    }
    return { ok: false, reason: "Tab is not tagged" };
  }

  function registerLifecycleListeners(): void {
    browser.tabs.onRemoved.addListener(async (tabId: number) => {
      await ensureLoaded();
      let changed = false;
      for (const [key, entries] of Object.entries(taggedTabsByWindowId)) {
        const nextEntries = entries.filter((entry) => entry.tabId !== tabId);
        if (nextEntries.length !== entries.length) {
          changed = true;
          if (nextEntries.length > 0) taggedTabsByWindowId[key] = nextEntries;
          else delete taggedTabsByWindowId[key];
        }
      }
      if (changed) {
        await saveTaggedTabs();
        await updateBadge();
      }
    });

    browser.tabs.onUpdated.addListener(async (tabId: number, changeInfo: Tabs.OnUpdatedChangeInfoType, tab: Tabs.Tab) => {
      await ensureLoaded();
      if (tab.windowId == null) return;
      const entries = taggedTabsByWindowId[windowKey(tab.windowId)] || [];
      const entry = entries.find((candidate) => candidate.tabId === tabId);
      if (!entry) return;
      if (changeInfo.url || changeInfo.title || typeof changeInfo.pinned === "boolean") {
        updateEntryFromTab(entry, tab);
        entry.updatedAt = Date.now();
        await saveTaggedTabs();
      }
    });

    browser.tabs.onActivated.addListener(async (activeInfo: Tabs.OnActivatedActiveInfoType) => {
      await updateBadge(activeInfo.windowId);
    });

    browser.windows.onFocusChanged.addListener(async (windowId: number) => {
      if (windowId <= 0) return;
      await updateBadge(windowId);
    });

    browser.runtime.onStartup.addListener(async () => {
      taggedTabsByWindowId = {};
      loaded = true;
      await browser.storage.local.remove(TABWHEEL_STORAGE_KEYS.taggedTabs);
      await updateBadge();
    });
  }

  return {
    ensureLoaded,
    getCurrentState,
    list,
    tagCurrent,
    removeCurrent,
    removeTab,
    clearWindow,
    activate,
    cycle,
    saveScrollPosition,
    registerLifecycleListeners,
  };
}
