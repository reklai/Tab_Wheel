// TabWheel panel — in-page view of currently tagged tabs.

import { buildFuzzyPattern, escapeHtml, extractDomain } from "../../../common/utils/helpers";
import {
  formatTabWheelModifierCombo,
  loadTabWheelSettings,
  MAX_TAGGED_TABS,
} from "../../../common/contracts/tabWheel";
import {
  activateTaggedTab,
  clearTaggedTabs,
  listTaggedTabsWithRetry,
  openTabWheelOptions,
  removeCurrentTabTag,
  removeTaggedTab,
  tagCurrentTab,
} from "../../../adapters/runtime/tabWheelApi";
import {
  createPanelHost,
  dismissPanel,
  footerRowHtml,
  getBaseStyles,
  registerPanelCleanup,
  removePanelHost,
} from "../../../common/utils/panelHost";
import styles from "./tabWheel.css";

const SCROLL_STEP = 72;
const WHEEL_LINE_HEIGHT = 16;
const STATUS_CLEAR_MS = 2200;

function scrollLabel(entry: TaggedTabEntry): string {
  const x = Math.round(entry.scrollX);
  const y = Math.round(entry.scrollY);
  return `${x}, ${y}`;
}

interface VisibleTaggedEntry {
  entry: TaggedTabEntry;
  index: number;
  score: number;
}

function buildSearchText(entry: TaggedTabEntry): string {
  return [
    entry.title,
    extractDomain(entry.url),
    entry.url,
  ].join(" ");
}

function matchesSearch(entry: TaggedTabEntry, pattern: RegExp | null): boolean {
  if (!pattern) return true;
  return pattern.test(buildSearchText(entry));
}

function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, "").toLowerCase();
}

function scoreFuzzyMatch(text: string, query: string): number {
  const needle = normalizeSearchQuery(query);
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  const exactIndex = haystack.indexOf(needle);
  if (exactIndex >= 0) return exactIndex * 2 + haystack.length * 0.01;

  let needleIndex = 0;
  let firstMatchIndex = -1;
  let lastMatchIndex = -1;

  for (let index = 0; index < haystack.length && needleIndex < needle.length; index++) {
    if (haystack[index] !== needle[needleIndex]) continue;
    if (firstMatchIndex === -1) firstMatchIndex = index;
    lastMatchIndex = index;
    needleIndex++;
  }

  if (needleIndex !== needle.length || firstMatchIndex === -1) return Number.POSITIVE_INFINITY;
  const span = lastMatchIndex - firstMatchIndex + 1;
  const gaps = span - needle.length;
  return 10000 + gaps * 12 + firstMatchIndex * 2 + haystack.length * 0.01;
}

function getFuzzyHighlightIndexes(text: string, query: string): Set<number> {
  const needle = normalizeSearchQuery(query);
  if (!needle) return new Set();
  const characters = Array.from(text);
  const matchedIndexes = new Set<number>();
  let needleIndex = 0;

  for (let index = 0; index < characters.length && needleIndex < needle.length; index++) {
    if (characters[index].toLowerCase() !== needle[needleIndex]) continue;
    matchedIndexes.add(index);
    needleIndex++;
  }

  return needleIndex === needle.length ? matchedIndexes : new Set();
}

function renderHighlightedText(text: string, query: string): string {
  const matchedIndexes = getFuzzyHighlightIndexes(text, query);
  if (matchedIndexes.size === 0) return escapeHtml(text);
  return Array.from(text)
    .map((character, index) => {
      const escapedCharacter = escapeHtml(character);
      return matchedIndexes.has(index)
        ? `<mark class="ht-tabwheel-highlight">${escapedCharacter}</mark>`
        : escapedCharacter;
    })
    .join("");
}

function renderTaggedRows(
  visibleEntries: VisibleTaggedEntry[],
  totalCount: number,
  searchQuery: string,
  gestureModifierLabel: string,
): string {
  if (totalCount === 0) {
    return `
      <div class="ht-tabwheel-empty">
        <strong>No tagged tabs</strong>
        <span>${escapeHtml(gestureModifierLabel)} + Wheel cycles all tabs until you tag one.</span>
      </div>
    `;
  }
  if (visibleEntries.length === 0) {
    return `
      <div class="ht-tabwheel-empty">
        <strong>No matches</strong>
        <span>Fuzzy search matches tab titles, domains, and URLs.</span>
      </div>
    `;
  }

  return visibleEntries.map(({ entry, index }) => `
    <div class="ht-tabwheel-row-shell${searchQuery.trim() ? " is-search-match" : ""}">
      <button class="ht-tabwheel-row" data-tab-id="${entry.tabId}">
        <span class="ht-tabwheel-index">${index + 1}</span>
        <span class="ht-tabwheel-main">
          <span class="ht-tabwheel-title">${renderHighlightedText(entry.title || "Untitled", searchQuery)}</span>
          <span class="ht-tabwheel-url">${renderHighlightedText(extractDomain(entry.url), searchQuery)}</span>
        </span>
        <span class="ht-tabwheel-scroll" title="Scroll X, Y">${escapeHtml(scrollLabel(entry))}</span>
      </button>
      <button class="ht-tabwheel-remove-tag" data-tab-id="${entry.tabId}" title="Remove this tag">Remove</button>
    </div>
  `).join("");
}

export async function openTabWheelPanel(): Promise<void> {
  try {
    const settings = await loadTabWheelSettings();
    const gestureModifierLabel = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    const { shadow } = createPanelHost();

    const style = document.createElement("style");
    style.textContent = getBaseStyles() + styles;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "ht-backdrop";
    shadow.appendChild(backdrop);

    const panel = document.createElement("div");
    panel.className = "ht-tabwheel-container";
    shadow.appendChild(panel);

    let entries: TaggedTabEntry[] = [];
    let activeIndex = 0;
    let status = "";
    let isConfirmingClear = false;
    let searchQuery = "";
    let shouldFocusActiveRow = false;
    let statusClearTimer = 0;

    function close(): void {
      document.removeEventListener("keydown", keyHandler, true);
      shadow.removeEventListener("keydown", stopPanelKeyboardBubble);
      shadow.removeEventListener("keypress", stopPanelKeyboardBubble);
      shadow.removeEventListener("keyup", stopPanelKeyboardBubble);
      panel.removeEventListener("wheel", panelWheelHandler, true);
      clearStatusTimer();
      removePanelHost();
    }

    function clearStatusTimer(): void {
      if (!statusClearTimer) return;
      window.clearTimeout(statusClearTimer);
      statusClearTimer = 0;
    }

    function setStatus(message: string): void {
      clearStatusTimer();
      status = message;
      isConfirmingClear = false;
      render();
      if (!message) return;
      statusClearTimer = window.setTimeout(() => {
        statusClearTimer = 0;
        if (isConfirmingClear) return;
        status = "";
        render();
      }, STATUS_CLEAR_MS);
    }

    async function refresh(): Promise<void> {
      entries = await listTaggedTabsWithRetry();
      const visibleEntries = getVisibleEntries();
      if (visibleEntries.length === 0) activeIndex = 0;
      else activeIndex = Math.min(activeIndex, visibleEntries.length - 1);
      render();
    }

    async function activateEntry(tabId: number): Promise<void> {
      const result = await activateTaggedTab(tabId);
      if (!result.ok) {
        setStatus(result.reason || "Could not activate tagged tab");
        return;
      }
      close();
    }

    function getVisibleEntries(): VisibleTaggedEntry[] {
      const pattern = buildFuzzyPattern(searchQuery);
      const visibleEntries = entries
        .map((entry, index) => ({
          entry,
          index,
          score: scoreFuzzyMatch(buildSearchText(entry), searchQuery),
        }))
        .filter(({ entry }) => matchesSearch(entry, pattern));
      if (!searchQuery.trim()) return visibleEntries;
      return visibleEntries.sort((a, b) => a.score - b.score || a.index - b.index);
    }

    function focusSearch(): void {
      const input = panel.querySelector('[data-action="search"]') as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(input.value.length, input.value.length);
    }

    function clearSearch(): void {
      if (!searchQuery) {
        focusSearch();
        return;
      }
      searchQuery = "";
      activeIndex = 0;
      shouldFocusActiveRow = false;
      render();
      focusSearch();
    }

    function bindSearchHandler(): void {
      const input = panel.querySelector('[data-action="search"]') as HTMLInputElement | null;
      if (!input) return;
      input.value = searchQuery;
      input.addEventListener("input", () => {
        const nextCursor = input.selectionStart ?? input.value.length;
        searchQuery = input.value;
        activeIndex = 0;
        render();
        focusSearch();
        const nextInput = panel.querySelector('[data-action="search"]') as HTMLInputElement | null;
        nextInput?.setSelectionRange(nextCursor, nextCursor);
      });
    }

    function bindRowHandlers(): void {
      panel.querySelectorAll(".ht-tabwheel-row").forEach((row, index) => {
        row.addEventListener("click", () => {
          const tabId = Number((row as HTMLElement).dataset.tabId);
          void activateEntry(tabId);
        });
        if (index !== activeIndex) return;
        row.classList.add("active");
        if (!shouldFocusActiveRow) return;
        (row as HTMLButtonElement).focus({ preventScroll: true });
      });
      shouldFocusActiveRow = false;

      panel.querySelectorAll(".ht-tabwheel-remove-tag").forEach((button) => {
        button.addEventListener("click", async () => {
          const tabId = Number((button as HTMLElement).dataset.tabId);
          const result = await removeTaggedTab(tabId);
          setStatus(result.ok ? "Removed tag" : result.reason || "Remove failed");
          await refresh();
        });
      });
    }

    function render(): void {
      const visibleEntries = getVisibleEntries();
      const visibleCount = visibleEntries.length;
      const listMeta = searchQuery.trim()
        ? `${visibleCount}/${entries.length} shown`
        : "Click a row to activate";
      const statusHtml = isConfirmingClear
        ? `
          <div class="ht-tabwheel-confirm">
            <span>Clear ${entries.length} tagged ${entries.length === 1 ? "tab" : "tabs"}?</span>
            <button data-action="clear-no">N</button>
            <button data-action="clear-yes">Y</button>
          </div>
        `
        : escapeHtml(status);
      panel.innerHTML = `
        <div class="ht-titlebar">
          <div class="ht-traffic-lights">
            <button class="ht-dot ht-dot-close" title="Close"></button>
          </div>
          <span class="ht-tabwheel-titlebar-text">
            <span class="ht-tabwheel-title-label">TabWheel</span>
            <span class="ht-tabwheel-count">${entries.length}/${MAX_TAGGED_TABS} tagged</span>
          </span>
        </div>
        <div class="ht-tabwheel-actions">
          <button class="ht-tabwheel-action ht-tabwheel-primary" data-action="tag">Tag Current</button>
          <button class="ht-tabwheel-action" data-action="remove">Remove Current</button>
          <button class="ht-tabwheel-action ht-tabwheel-danger" data-action="clear">Clear All</button>
          <button class="ht-tabwheel-icon" data-action="refresh" title="Refresh" aria-label="Refresh tagged tabs">&#8635;</button>
          <button class="ht-tabwheel-icon" data-action="settings" title="Settings" aria-label="Open settings">&#9881;</button>
        </div>
        <div class="ht-tabwheel-search-row">
          <input class="ht-tabwheel-search${searchQuery.trim() ? " is-searching" : ""}" data-action="search" type="search" placeholder="Search" autocomplete="off" value="${escapeHtml(searchQuery)}" />
        </div>
        <div class="ht-ui-pane-header">
          <span class="ht-ui-pane-header-text">Tagged Tabs</span>
          <span class="ht-ui-pane-header-meta">${escapeHtml(listMeta)}</span>
        </div>
        <div class="ht-tabwheel-list">${renderTaggedRows(visibleEntries, entries.length, searchQuery, gestureModifierLabel)}</div>
        <div class="ht-tabwheel-status">${statusHtml}</div>
        <div class="ht-footer">
          ${footerRowHtml([
            { key: "Tab", desc: "list" },
            { key: "F", desc: "search" },
            { key: "Shift+Space", desc: "clear search" },
          ])}
          ${footerRowHtml([
            { key: "Enter", desc: "open" },
            { key: "D", desc: "delete" },
            { key: "J/K", desc: "move" },
            { key: "Wheel", desc: "scroll list" },
            { key: "Esc", desc: "close" },
          ])}
        </div>
      `;

      panel.querySelector(".ht-dot-close")?.addEventListener("click", close);
      bindSearchHandler();
      panel.querySelector('[data-action="tag"]')?.addEventListener("click", async () => {
        const result = await tagCurrentTab();
        setStatus(result.ok
          ? result.alreadyTagged ? "Current tab is already tagged" : "Tagged current tab"
          : result.reason || "Tag failed");
        await refresh();
      });
      panel.querySelector('[data-action="remove"]')?.addEventListener("click", async () => {
        const result = await removeCurrentTabTag();
        setStatus(result.ok ? "Removed current tab tag" : result.reason || "Current tab is not tagged");
        await refresh();
      });
      panel.querySelector('[data-action="clear"]')?.addEventListener("click", async () => {
        if (entries.length === 0) {
          setStatus("No currently tagged tabs");
          return;
        }
        status = "";
        clearStatusTimer();
        isConfirmingClear = true;
        render();
      });
      panel.querySelector('[data-action="clear-no"]')?.addEventListener("click", () => {
        setStatus("Clear cancelled");
      });
      panel.querySelector('[data-action="clear-yes"]')?.addEventListener("click", async () => {
        const count = entries.length;
        isConfirmingClear = false;
        const result = await clearTaggedTabs();
        setStatus(result.ok ? `Cleared ${count} tagged ${count === 1 ? "tab" : "tabs"}` : result.reason || "Clear failed");
        await refresh();
      });
      panel.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
        setStatus("Refreshed tagged tabs");
        void refresh();
      });
      panel.querySelector('[data-action="settings"]')?.addEventListener("click", async () => {
        const result = await openTabWheelOptions();
        if (!result.ok) {
          setStatus(result.reason || "Settings unavailable");
          return;
        }
        close();
      });
      bindRowHandlers();
    }

    function moveActive(delta: number): void {
      const visibleEntries = getVisibleEntries();
      if (visibleEntries.length === 0) return;
      activeIndex = (activeIndex + delta + visibleEntries.length) % visibleEntries.length;
      shouldFocusActiveRow = true;
      render();
      const list = panel.querySelector(".ht-tabwheel-list") as HTMLElement | null;
      const active = panel.querySelector(".ht-tabwheel-row.active") as HTMLElement | null;
      active?.scrollIntoView({ block: "nearest" });
      if (!active && list) list.scrollTop += delta > 0 ? SCROLL_STEP : -SCROLL_STEP;
    }

    async function deleteActiveEntry(): Promise<void> {
      const visibleEntries = getVisibleEntries();
      const activeEntry = visibleEntries[activeIndex];
      if (!activeEntry) {
        setStatus("No tagged tab selected");
        return;
      }
      const result = await removeTaggedTab(activeEntry.entry.tabId);
      setStatus(result.ok ? "Removed tag" : result.reason || "Remove failed");
      await refresh();
    }

    function resolveWheelDeltaY(event: WheelEvent, list: HTMLElement): number {
      if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT;
      if (event.deltaMode === 2) return event.deltaY * list.clientHeight;
      return event.deltaY;
    }

    function panelWheelHandler(event: WheelEvent): void {
      event.preventDefault();
      event.stopPropagation();
      const list = panel.querySelector(".ht-tabwheel-list") as HTMLElement | null;
      if (!list) return;
      list.scrollTop += resolveWheelDeltaY(event, list);
    }

    function stopPanelKeyboardBubble(event: Event): void {
      event.stopPropagation();
    }

    function isTextInputEvent(event: KeyboardEvent): boolean {
      return event.composedPath().some((node) =>
        node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement,
      );
    }

    function keyHandler(event: KeyboardEvent): void {
      if (!document.getElementById("ht-panel-host")) {
        document.removeEventListener("keydown", keyHandler, true);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      if (isTextInputEvent(event)) {
        if (event.shiftKey && event.code === "Space") {
          event.preventDefault();
          event.stopPropagation();
          clearSearch();
        }
        return;
      }

      if (event.shiftKey && event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        clearSearch();
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        focusSearch();
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        moveActive(1);
        return;
      }

      if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        moveActive(-1);
        return;
      }

      if (isConfirmingClear && event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        setStatus("Clear cancelled");
        return;
      }

      if (isConfirmingClear && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        const button = panel.querySelector('[data-action="clear-yes"]') as HTMLButtonElement | null;
        button?.click();
        return;
      }

      if (!isConfirmingClear && event.key.toLowerCase() === "d") {
        event.preventDefault();
        event.stopPropagation();
        void deleteActiveEntry();
        return;
      }

      const visibleEntries = getVisibleEntries();
      if (event.key === "Enter" && visibleEntries[activeIndex]) {
        event.preventDefault();
        event.stopPropagation();
        void activateEntry(visibleEntries[activeIndex].entry.tabId);
        return;
      }

      event.stopPropagation();
    }

    backdrop.addEventListener("click", close);
    backdrop.addEventListener("mousedown", (event) => event.preventDefault());
    shadow.addEventListener("keydown", stopPanelKeyboardBubble);
    shadow.addEventListener("keypress", stopPanelKeyboardBubble);
    shadow.addEventListener("keyup", stopPanelKeyboardBubble);
    panel.addEventListener("wheel", panelWheelHandler, { passive: false, capture: true });
    document.addEventListener("keydown", keyHandler, true);
    registerPanelCleanup(close);
    render();
    await refresh();
    focusSearch();
  } catch (error) {
    console.error("[TabWheel] Failed to open panel:", error);
    dismissPanel();
  }
}
