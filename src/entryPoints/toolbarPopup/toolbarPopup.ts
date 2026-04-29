// Browser-action popup for quick TabWheel actions.

import browser from "webextension-polyfill";
import { buildFuzzyPattern, escapeHtml, extractDomain } from "../../lib/common/utils/helpers";
import {
  formatTabWheelModifierCombo,
  loadTabWheelSettings,
  MAX_TAGGED_TABS,
} from "../../lib/common/contracts/tabWheel";
import {
  activateTaggedTab,
  clearTaggedTabs,
  listTaggedTabsWithRetry,
  openTabWheelHelp,
  removeCurrentTabTag,
  removeTaggedTab,
  tagCurrentTab,
} from "../../lib/adapters/runtime/tabWheelApi";

const SCROLL_STEP = 72;
const WHEEL_LINE_HEIGHT = 16;

interface VisibleTaggedEntry {
  entry: TaggedTabEntry;
  index: number;
  score: number;
}

function scrollLabel(entry: TaggedTabEntry): string {
  return `${Math.round(entry.scrollX)}, ${Math.round(entry.scrollY)}`;
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
        ? `<mark class="match-highlight">${escapedCharacter}</mark>`
        : escapedCharacter;
    })
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const taggedListEl = document.getElementById("taggedTabsList")!;
  const countEl = document.getElementById("tagCount")!;
  const listMetaEl = document.getElementById("listMeta")!;
  const statusEl = document.getElementById("statusLine")!;
  const searchInput = document.getElementById("searchInput") as HTMLInputElement;
  const tagBtn = document.getElementById("tagBtn") as HTMLButtonElement;
  const removeBtn = document.getElementById("removeBtn") as HTMLButtonElement;
  const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
  const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
  const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
  const helpBtn = document.getElementById("helpBtn") as HTMLButtonElement;

  let taggedTabs: TaggedTabEntry[] = [];
  let activeIndex = 0;
  let isConfirmingClear = false;
  let searchQuery = "";
  const settings = await loadTabWheelSettings();
  const gestureModifier = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
  let statusTimer = 0;

  function focusSearch(): void {
    searchInput.focus({ preventScroll: true });
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  function setStatus(message: string): void {
    isConfirmingClear = false;
    statusEl.textContent = message;
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      statusEl.textContent = "";
      statusTimer = 0;
    }, 2500);
  }

  function getVisibleEntries(): VisibleTaggedEntry[] {
    const pattern = buildFuzzyPattern(searchQuery);
    const visibleEntries = taggedTabs
      .map((entry, index) => ({
        entry,
        index,
        score: scoreFuzzyMatch(buildSearchText(entry), searchQuery),
      }))
      .filter(({ entry }) => matchesSearch(entry, pattern));
    if (!searchQuery.trim()) return visibleEntries;
    return visibleEntries.sort((a, b) => a.score - b.score || a.index - b.index);
  }

  function renderStatus(): void {
    if (!isConfirmingClear) return;
    statusEl.innerHTML = `
      <div class="confirm-row">
        <span>Clear ${taggedTabs.length} tagged ${taggedTabs.length === 1 ? "tab" : "tabs"}?</span>
        <button id="clearYesBtn">Y</button>
        <button id="clearNoBtn">N</button>
      </div>
    `;
    document.getElementById("clearNoBtn")?.addEventListener("click", () => {
      setStatus("Clear cancelled");
    });
    document.getElementById("clearYesBtn")?.addEventListener("click", async () => {
      const count = taggedTabs.length;
      isConfirmingClear = false;
      const result = await clearTaggedTabs();
      setStatus(result.ok ? `Cleared ${count} tagged ${count === 1 ? "tab" : "tabs"}` : result.reason || "Clear failed");
      await refresh();
    });
  }

  function renderTaggedTabs(): void {
    const visibleEntries = getVisibleEntries();
    countEl.textContent = `${taggedTabs.length}/${MAX_TAGGED_TABS} tagged`;
    searchInput.classList.toggle("is-searching", !!searchQuery.trim());
    listMetaEl.textContent = searchQuery.trim()
      ? `${visibleEntries.length}/${taggedTabs.length} shown`
      : "Click a row to activate";

    if (taggedTabs.length === 0) {
      taggedListEl.innerHTML = `
        <div class="empty-state">
          <strong>No tagged tabs</strong>
          <span>${escapeHtml(gestureModifier)} + Wheel cycles all tabs until you tag one.</span>
        </div>
      `;
      renderStatus();
      return;
    }

    if (visibleEntries.length === 0) {
      taggedListEl.innerHTML = `
        <div class="empty-state">
          <strong>No matches</strong>
          <span>Fuzzy search matches tab titles, domains, and URLs.</span>
        </div>
      `;
      renderStatus();
      return;
    }

    taggedListEl.innerHTML = visibleEntries
      .map(({ entry, index }) => `
        <div class="tagged-row-shell${searchQuery.trim() ? " is-search-match" : ""}">
          <button class="tagged-row" data-tab-id="${entry.tabId}">
            <span class="slot-badge">${index + 1}</span>
            <span class="item-info">
              <span class="item-title">${renderHighlightedText(entry.title || "Untitled", searchQuery)}</span>
              <span class="item-url" title="${escapeHtml(entry.url)}">${renderHighlightedText(extractDomain(entry.url), searchQuery)}</span>
            </span>
            <span class="scroll-pill" title="Scroll X, Y">${escapeHtml(scrollLabel(entry))}</span>
          </button>
          <button class="remove-tag-btn" data-tab-id="${entry.tabId}" title="Remove this tag">Remove</button>
        </div>
      `)
      .join("");

    taggedListEl.querySelectorAll(".tagged-row").forEach((itemElement, index) => {
      itemElement.addEventListener("click", async () => {
        const tabId = Number((itemElement as HTMLElement).dataset.tabId);
        const result = await activateTaggedTab(tabId);
        if (!result.ok) {
          setStatus(result.reason || "Could not activate tab");
          return;
        }
        window.close();
      });
      itemElement.classList.toggle("active", index === activeIndex);
    });

    taggedListEl.querySelectorAll(".remove-tag-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const tabId = Number((button as HTMLElement).dataset.tabId);
        const result = await removeTaggedTab(tabId);
        setStatus(result.ok ? "Removed tag" : result.reason || "Remove failed");
        await refresh();
      });
    });

    renderStatus();
  }

  async function refresh(): Promise<void> {
    taggedTabs = await listTaggedTabsWithRetry();
    const visibleEntries = getVisibleEntries();
    if (visibleEntries.length === 0) activeIndex = 0;
    else activeIndex = Math.min(activeIndex, visibleEntries.length - 1);
    renderTaggedTabs();
  }

  function clearSearch(): void {
    if (!searchQuery) {
      focusSearch();
      return;
    }
    searchQuery = "";
    searchInput.value = "";
    activeIndex = 0;
    renderTaggedTabs();
    focusSearch();
  }

  function moveActive(delta: number): void {
    const visibleEntries = getVisibleEntries();
    if (visibleEntries.length === 0) return;
    activeIndex = (activeIndex + delta + visibleEntries.length) % visibleEntries.length;
    renderTaggedTabs();
    const active = taggedListEl.querySelector(".tagged-row.active") as HTMLElement | null;
    active?.focus({ preventScroll: true });
    active?.scrollIntoView({ block: "nearest" });
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

  function resolveWheelDeltaY(event: WheelEvent): number {
    if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT;
    if (event.deltaMode === 2) return event.deltaY * taggedListEl.clientHeight;
    return event.deltaY;
  }

  tagBtn.addEventListener("click", async () => {
    const result = await tagCurrentTab();
    setStatus(result.ok ? result.alreadyTagged ? "Current tab is already tagged" : "Tagged current tab" : result.reason || "Tag failed");
    await refresh();
  });

  removeBtn.addEventListener("click", async () => {
    const result = await removeCurrentTabTag();
    setStatus(result.ok ? "Removed current tab tag" : result.reason || "Current tab is not tagged");
    await refresh();
  });

  clearBtn.addEventListener("click", () => {
    if (taggedTabs.length === 0) {
      setStatus("No currently tagged tabs");
      return;
    }
    isConfirmingClear = true;
    renderStatus();
  });

  refreshBtn.addEventListener("click", () => {
    setStatus("Refreshed tagged tabs");
    void refresh();
  });

  settingsBtn.addEventListener("click", () => {
    void browser.runtime.openOptionsPage();
    window.close();
  });

  helpBtn.addEventListener("click", async () => {
    const result = await openTabWheelHelp();
    if (!result.ok) {
      setStatus(result.reason || "Help unavailable");
      return;
    }
    window.close();
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    activeIndex = 0;
    renderTaggedTabs();
    focusSearch();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.shiftKey && event.code === "Space") {
      event.preventDefault();
      clearSearch();
    }
  });

  taggedListEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    taggedListEl.scrollTop += resolveWheelDeltaY(event);
  }, { passive: false });

  document.addEventListener("keydown", (event) => {
    const isSearchFocused = document.activeElement === searchInput;
    if (event.key === "Escape") {
      event.preventDefault();
      window.close();
      return;
    }
    if (isConfirmingClear && event.key.toLowerCase() === "n") {
      event.preventDefault();
      setStatus("Clear cancelled");
      return;
    }
    if (isConfirmingClear && event.key.toLowerCase() === "y") {
      event.preventDefault();
      document.getElementById("clearYesBtn")?.click();
      return;
    }
    if (event.shiftKey && event.code === "Space") {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (isSearchFocused) return;
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      focusSearch();
      return;
    }
    if (event.key.toLowerCase() === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key.toLowerCase() === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (!isConfirmingClear && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void deleteActiveEntry();
      return;
    }
    const visibleEntries = getVisibleEntries();
    if (event.key === "Enter" && visibleEntries[activeIndex]) {
      event.preventDefault();
      void activateTaggedTab(visibleEntries[activeIndex].entry.tabId).then((result) => {
        if (!result.ok) {
          setStatus(result.reason || "Could not activate tab");
          return;
        }
        window.close();
      });
    }
  });

  await refresh();
  focusSearch();
});
