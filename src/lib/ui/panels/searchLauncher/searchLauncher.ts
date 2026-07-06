// TabWheel search launcher - a live command palette. Typing filters your recent
// searches (default), "/tab" fuzzy-searches open tabs, and Enter runs a web
// search when nothing is selected. History ("/hist") and bookmarks ("/book")
// are recognized but arrive in a later update. All matching happens in the
// background; this file renders the animated, keyboard-navigable results.

import { normalizeSearchQuery } from "../../../common/contracts/tabWheel";
import { createDebouncedCallback } from "../../../common/utils/asyncFlow";
import {
  createPanelModalSession,
  createPanelHost,
  getBaseStyles,
  registerPanelCleanup,
  removePanelHost,
} from "../../../common/utils/panelHost";
import type { PanelModalSession } from "../../../common/utils/panelHost";
import {
  activateTabWheelTab,
  getTabWheelSearchSuggestions,
  openTabWheelSearchTab,
} from "../../../adapters/runtime/tabWheelApi";
import styles from "./searchLauncher.css";

type LauncherCommand = "tab" | "hist" | "book";

type LauncherInputState =
  | { kind: "fetch"; mode: TabWheelSearchMode; query: string }
  | { kind: "commandMenu"; filter: string }
  | { kind: "deferred"; command: "hist" | "book" };

type LauncherRow =
  | { kind: "recent"; item: TabWheelSuggestionItem }
  | { kind: "tab"; item: TabWheelSuggestionItem }
  | { kind: "web"; query: string }
  | { kind: "command"; command: LauncherCommand }
  | { kind: "deferred"; command: "hist" | "book" };

const SEARCH_MODE_LABELS: Record<TabWheelSearchMode, string> = {
  recent: "RECENT",
  tab: "TAB",
};

const COMMAND_DEFINITIONS: ReadonlyArray<{ command: LauncherCommand; hint: string }> = [
  { command: "tab", hint: "search open tabs" },
  { command: "hist", hint: "search history (soon)" },
  { command: "book", hint: "search bookmarks (soon)" },
];

const DEFERRED_LABELS: Record<"hist" | "book", string> = {
  hist: "History search arrives in a later update.",
  book: "Bookmark search arrives in a later update.",
};

function parseLauncherInput(rawValue: string): LauncherInputState {
  const committed = rawValue.match(/^\/(tab|hist|book)\s([\s\S]*)$/);
  if (committed) {
    const command = committed[1] as LauncherCommand;
    if (command === "tab") return { kind: "fetch", mode: "tab", query: committed[2] };
    return { kind: "deferred", command };
  }
  if (rawValue.startsWith("/")) {
    return { kind: "commandMenu", filter: rawValue.slice(1).toLowerCase() };
  }
  return { kind: "fetch", mode: "recent", query: rawValue };
}

function domainFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return url;
  }
}

export async function openTabWheelSearchLauncher(): Promise<void> {
  const { host, shadow } = createPanelHost();

  const style = document.createElement("style");
  style.textContent = getBaseStyles() + styles;
  shadow.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.className = "ht-backdrop";
  shadow.appendChild(backdrop);

  const panel = document.createElement("div");
  panel.className = "ht-search-launcher";
  shadow.appendChild(panel);

  panel.innerHTML = `
    <div class="ht-search-hint">
      <span class="ht-search-hint-label">Try</span>
    </div>
    <form class="ht-search-form" id="ht-search-form">
      <div class="ht-search-field">
        <span class="ht-search-mode" hidden></span>
        <input class="ht-search-input" name="query" type="search" autocomplete="off" spellcheck="false" placeholder="Search, or type / for commands" autofocus />
      </div>
      <button class="ht-search-cancel" type="button">Cancel</button>
      <button class="ht-search-submit" type="submit">Search</button>
    </form>
    <div class="ht-search-suggest" hidden>
      <div class="ht-search-glow" aria-hidden="true"></div>
      <ul class="ht-search-list" role="listbox" aria-label="Search suggestions"></ul>
    </div>
    <div class="ht-search-status" role="status" aria-live="polite" hidden></div>
  `;

  const cancelButton = panel.querySelector(".ht-search-cancel") as HTMLButtonElement;
  const submitButton = panel.querySelector(".ht-search-submit") as HTMLButtonElement;
  const form = panel.querySelector(".ht-search-form") as HTMLFormElement;
  const input = panel.querySelector(".ht-search-input") as HTMLInputElement;
  const modeChip = panel.querySelector(".ht-search-mode") as HTMLSpanElement;
  const hint = panel.querySelector(".ht-search-hint") as HTMLDivElement;
  const suggest = panel.querySelector(".ht-search-suggest") as HTMLDivElement;
  const glow = panel.querySelector(".ht-search-glow") as HTMLDivElement;
  const list = panel.querySelector(".ht-search-list") as HTMLUListElement;
  const status = panel.querySelector(".ht-search-status") as HTMLDivElement;

  let isSubmitting = false;
  let modalSession: PanelModalSession | null = null;
  let rows: LauncherRow[] = [];
  let rowElements: HTMLLIElement[] = [];
  let selectedIndex = -1;
  let requestSerial = 0;

  function isPanelAlive(): boolean {
    return document.getElementById("ht-panel-host") !== null;
  }

  function setStatus(message: string): void {
    status.textContent = message;
    status.hidden = message.length === 0;
  }

  function setSubmitting(nextIsSubmitting: boolean): void {
    isSubmitting = nextIsSubmitting;
    submitButton.disabled = nextIsSubmitting;
    input.disabled = nextIsSubmitting;
    form.setAttribute("aria-busy", String(nextIsSubmitting));
  }

  function focusSearchInput(): void {
    if (!isPanelAlive()) return;
    input.focus({ preventScroll: true });
  }

  function close(): void {
    requestSuggestions.cancel();
    modalSession?.dispose();
    modalSession = null;
    removePanelHost();
  }

  function setModeChip(mode: TabWheelSearchMode | LauncherCommand | null): void {
    if (!mode) {
      modeChip.hidden = true;
      modeChip.textContent = "";
      return;
    }
    const label = mode === "hist"
      ? "HISTORY"
      : mode === "book"
        ? "BOOKMARK"
        : SEARCH_MODE_LABELS[mode as TabWheelSearchMode] ?? mode.toUpperCase();
    modeChip.textContent = label;
    modeChip.hidden = false;
  }

  function appendHighlightedText(target: HTMLElement, text: string, positions: number[]): void {
    const matched = new Set(positions);
    let run = "";
    let runMatched = false;
    const flush = (): void => {
      if (!run) return;
      if (runMatched) {
        const mark = document.createElement("span");
        mark.className = "ht-search-hit";
        mark.textContent = run;
        target.appendChild(mark);
      } else {
        target.appendChild(document.createTextNode(run));
      }
      run = "";
    };
    for (let index = 0; index < text.length; index += 1) {
      const isHit = matched.has(index);
      if (isHit !== runMatched) {
        flush();
        runMatched = isHit;
      }
      run += text[index];
    }
    flush();
  }

  function createRowIcon(row: LauncherRow): HTMLElement {
    if (row.kind === "tab" && row.item.favIconUrl) {
      const favicon = document.createElement("img");
      favicon.className = "ht-search-favicon";
      favicon.src = row.item.favIconUrl;
      favicon.referrerPolicy = "no-referrer";
      favicon.alt = "";
      favicon.addEventListener("error", () => {
        favicon.replaceWith(createGlyphIcon(row));
      });
      return favicon;
    }
    return createGlyphIcon(row);
  }

  function createGlyphIcon(row: LauncherRow): HTMLElement {
    const glyph = document.createElement("span");
    glyph.className = "ht-search-glyph";
    glyph.setAttribute("aria-hidden", "true");
    if (row.kind === "recent") glyph.textContent = "↺";
    else if (row.kind === "tab") glyph.textContent = domainFromUrl(row.item.secondary).slice(0, 1).toUpperCase() || "▸";
    else if (row.kind === "web") glyph.textContent = "⌕";
    else if (row.kind === "command") glyph.textContent = "›";
    else glyph.textContent = "·";
    if (row.kind === "tab") glyph.classList.add("ht-search-glyph-mono");
    return glyph;
  }

  function createRowElement(index: number): HTMLLIElement {
    const rowElement = document.createElement("li");
    rowElement.className = "ht-search-option";
    rowElement.id = `ht-search-option-${index}`;
    rowElement.setAttribute("role", "option");
    rowElement.style.setProperty("--i", String(index));
    wireRowInteractions(rowElement, index);
    return rowElement;
  }

  // Rebuild only a row's inner content, leaving the <li> itself in place. Because
  // the entrance animation lives on the <li> (and runs once), reusing elements
  // across keystrokes means existing rows never re-animate — only brand-new rows
  // fade in, which is what stops the list from flickering as you type.
  function fillRowContent(rowElement: HTMLLIElement, row: LauncherRow): void {
    rowElement.replaceChildren();
    rowElement.classList.toggle("ht-search-option-muted", row.kind === "deferred");

    rowElement.appendChild(createRowIcon(row));

    const text = document.createElement("span");
    text.className = "ht-search-text";
    const primary = document.createElement("span");
    primary.className = "ht-search-primary";
    if (row.kind === "recent" || row.kind === "tab") {
      appendHighlightedText(primary, row.item.primary, row.item.positions);
    } else if (row.kind === "web") {
      primary.textContent = `Search the web for "${row.query}"`;
    } else if (row.kind === "command") {
      primary.textContent = `/${row.command}`;
    } else {
      primary.textContent = DEFERRED_LABELS[row.command];
    }
    text.appendChild(primary);

    if (row.kind === "tab" && row.item.secondary) {
      const secondary = document.createElement("span");
      secondary.className = "ht-search-secondary";
      secondary.textContent = domainFromUrl(row.item.secondary);
      text.appendChild(secondary);
    } else if (row.kind === "command") {
      const definition = COMMAND_DEFINITIONS.find((entry) => entry.command === row.command);
      const hint = document.createElement("span");
      hint.className = "ht-search-secondary";
      hint.textContent = definition?.hint ?? "";
      text.appendChild(hint);
    }
    rowElement.appendChild(text);
    appendRowKicker(rowElement, row);
  }

  function appendRowKicker(rowElement: HTMLLIElement, row: LauncherRow): void {
    const kickerText = row.kind === "tab"
      ? "open tab"
      : row.kind === "web"
        ? "web search"
        : row.kind === "recent"
          ? "recent"
          : "";
    if (!kickerText) return;
    const kicker = document.createElement("span");
    kicker.className = "ht-search-kicker";
    kicker.textContent = kickerText;
    rowElement.appendChild(kicker);
  }

  function wireRowInteractions(rowElement: HTMLLIElement, index: number): void {
    rowElement.addEventListener("mousedown", (event) => event.preventDefault());
    rowElement.addEventListener("mouseenter", () => setSelectedIndex(index));
    rowElement.addEventListener("click", () => {
      setSelectedIndex(index);
      activateSelection();
    });
  }

  function moveGlowToSelected(): void {
    const selected = rowElements[selectedIndex];
    if (!selected) {
      glow.classList.remove("is-visible");
      return;
    }
    glow.style.transform = `translateY(${selected.offsetTop}px)`;
    glow.style.height = `${selected.offsetHeight}px`;
    glow.classList.add("is-visible");
  }

  function setSelectedIndex(nextIndex: number): void {
    if (rows.length === 0) {
      selectedIndex = -1;
      list.removeAttribute("aria-activedescendant");
      glow.classList.remove("is-visible");
      return;
    }
    selectedIndex = (nextIndex + rows.length) % rows.length;
    rowElements.forEach((rowElement, index) => {
      const isSelected = index === selectedIndex;
      rowElement.classList.toggle("is-selected", isSelected);
      rowElement.setAttribute("aria-selected", String(isSelected));
    });
    const selected = rowElements[selectedIndex];
    if (selected) {
      list.setAttribute("aria-activedescendant", selected.id);
      selected.scrollIntoView({ block: "nearest" });
    }
    moveGlowToSelected();
  }

  function showSuggest(visible: boolean): void {
    suggest.hidden = !visible;
    if (!visible) glow.classList.remove("is-visible");
  }

  function renderRows(nextRows: LauncherRow[]): void {
    rows = nextRows;
    if (nextRows.length === 0) {
      rowElements.forEach((rowElement) => rowElement.remove());
      rowElements = [];
      selectedIndex = -1;
      showSuggest(false);
      return;
    }
    // Reconcile positionally: reuse the <li> already at each index (just refresh
    // its content), create only the rows the list grew by, and drop the surplus.
    const nextElements: HTMLLIElement[] = [];
    for (let index = 0; index < nextRows.length; index += 1) {
      let rowElement = rowElements[index];
      if (!rowElement) {
        rowElement = createRowElement(index);
        list.appendChild(rowElement);
      }
      fillRowContent(rowElement, nextRows[index]);
      nextElements.push(rowElement);
    }
    for (let index = nextRows.length; index < rowElements.length; index += 1) {
      rowElements[index].remove();
    }
    rowElements = nextElements;
    showSuggest(true);
    setSelectedIndex(0);
  }

  function renderCommandMenu(filter: string): void {
    setModeChip(null);
    const matches = COMMAND_DEFINITIONS.filter((entry) => entry.command.startsWith(filter));
    const visible = matches.length > 0 ? matches : COMMAND_DEFINITIONS;
    renderRows(visible.map((entry) => ({ kind: "command", command: entry.command })));
  }

  function renderDeferred(command: "hist" | "book"): void {
    setModeChip(command);
    renderRows([{ kind: "deferred", command }]);
  }

  function buildFetchRows(mode: TabWheelSearchMode, query: string, items: TabWheelSuggestionItem[]): LauncherRow[] {
    const nextRows: LauncherRow[] = items.map((item) => (
      mode === "tab"
        ? { kind: "tab", item }
        : { kind: "recent", item }
    ));
    const normalizedQuery = normalizeSearchQuery(query);
    if (normalizedQuery) nextRows.push({ kind: "web", query: normalizedQuery });
    return nextRows;
  }

  async function runFetch(state: { mode: TabWheelSearchMode; query: string }): Promise<void> {
    const serial = requestSerial + 1;
    requestSerial = serial;
    const result = await getTabWheelSearchSuggestions(state.query, state.mode).catch(() => null);
    if (serial !== requestSerial || !isPanelAlive()) return;
    const items = result?.ok ? result.items : [];
    renderRows(buildFetchRows(state.mode, state.query, items));
  }

  const requestSuggestions = createDebouncedCallback(
    (state: { mode: TabWheelSearchMode; query: string }) => void runFetch(state),
    140,
  );

  function handleInput(): void {
    setStatus("");
    const state = parseLauncherInput(input.value);
    if (state.kind === "commandMenu") {
      requestSuggestions.cancel();
      renderCommandMenu(state.filter);
      return;
    }
    if (state.kind === "deferred") {
      requestSuggestions.cancel();
      renderDeferred(state.command);
      return;
    }
    setModeChip(state.mode === "tab" ? "tab" : null);
    requestSuggestions(state);
  }

  function insertCommand(command: LauncherCommand): void {
    input.value = `/${command} `;
    focusSearchInput();
    handleInput();
  }

  function submitWebSearch(query: string): void {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) {
      setStatus("Enter a search query");
      input.focus({ preventScroll: true });
      return;
    }
    setSubmitting(true);
    setStatus("Opening search...");
    void openTabWheelSearchTab(query)
      .then((result) => {
        if (result.ok) {
          close();
          return;
        }
        setStatus(result.reason || "Search unavailable");
      })
      .catch(() => setStatus("Search unavailable"))
      .finally(() => {
        if (!isPanelAlive()) return;
        setSubmitting(false);
        focusSearchInput();
      });
  }

  function openTabSuggestion(item: TabWheelSuggestionItem): void {
    if (item.tabId == null) return;
    setSubmitting(true);
    setStatus("Switching tab...");
    void activateTabWheelTab(item.tabId)
      .then((result) => {
        if (result.ok) {
          close();
          return;
        }
        setStatus(result.reason || "Tab unavailable");
      })
      .catch(() => setStatus("Tab unavailable"))
      .finally(() => {
        if (!isPanelAlive()) return;
        setSubmitting(false);
        focusSearchInput();
      });
  }

  function activateSelection(): void {
    if (isSubmitting) return;
    const selected = rows[selectedIndex];
    if (!selected) {
      submitWebSearch(input.value);
      return;
    }
    if (selected.kind === "tab") openTabSuggestion(selected.item);
    else if (selected.kind === "recent") submitWebSearch(selected.item.primary);
    else if (selected.kind === "web") submitWebSearch(selected.query);
    else if (selected.kind === "command") insertCommand(selected.command);
    else setStatus(DEFERRED_LABELS[selected.command]);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activateSelection();
  });
  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex(selectedIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex(selectedIndex - 1);
    }
  });
  cancelButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (event) => event.preventDefault());
  modalSession = createPanelModalSession({
    root: shadow,
    closeOnEscape: true,
    closeOnFullscreenChange: true,
    closeOnPageHide: true,
    closeOnVisibilityHidden: true,
    onClose: close,
  });
  for (const definition of COMMAND_DEFINITIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ht-search-hint-cmd";
    if (definition.command !== "tab") chip.classList.add("ht-search-hint-soon");
    chip.textContent = `/${definition.command}`;
    chip.title = definition.hint;
    chip.addEventListener("mousedown", (event) => event.preventDefault());
    chip.addEventListener("click", () => insertCommand(definition.command));
    hint.appendChild(chip);
  }

  registerPanelCleanup(close);
  host.focus({ preventScroll: true });
  focusSearchInput();
  requestAnimationFrame(focusSearchInput);
  handleInput();
}
