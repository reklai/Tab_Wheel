// TabWheel search launcher - in-page search bar for opening adjacent search tabs.

import { normalizeSearchQuery } from "../../../common/contracts/tabWheel";
import {
  createPanelHost,
  getBaseStyles,
  registerPanelCleanup,
  removePanelHost,
} from "../../../common/utils/panelHost";
import { openTabWheelSearchTab } from "../../../adapters/runtime/tabWheelApi";
import styles from "./searchLauncher.css";

type SearchLauncherEventType =
  | "keydown"
  | "keypress"
  | "keyup"
  | "pointerdown"
  | "pointerup"
  | "mousedown"
  | "mouseup"
  | "click"
  | "auxclick"
  | "contextmenu";

const SEARCH_LAUNCHER_EVENT_TYPES: readonly SearchLauncherEventType[] = [
  "keydown",
  "keypress",
  "keyup",
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "contextmenu",
];

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
    <form class="ht-search-form" id="ht-search-form">
      <input class="ht-search-input" name="query" type="search" autocomplete="off" spellcheck="false" placeholder="Search" autofocus />
      <button class="ht-search-cancel" type="button">Cancel</button>
      <button class="ht-search-submit" type="submit">Search</button>
    </form>
    <div class="ht-search-status" role="status" aria-live="polite" hidden></div>
  `;

  const cancelButton = panel.querySelector(".ht-search-cancel") as HTMLButtonElement;
  const submitButton = panel.querySelector(".ht-search-submit") as HTMLButtonElement;
  const form = panel.querySelector(".ht-search-form") as HTMLFormElement;
  const input = panel.querySelector(".ht-search-input") as HTMLInputElement;
  const status = panel.querySelector(".ht-search-status") as HTMLDivElement;
  let isSubmitting = false;

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
    if (!document.getElementById("ht-panel-host")) return;
    input.focus({ preventScroll: true });
  }

  function close(): void {
    document.removeEventListener("keydown", keyHandler, true);
    for (const eventType of SEARCH_LAUNCHER_EVENT_TYPES) {
      shadow.removeEventListener(eventType, searchLauncherEventHandler);
    }
    removePanelHost();
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
    }
  }

  function searchLauncherEventHandler(event: Event): void {
    event.stopPropagation();
    if (event instanceof KeyboardEvent && event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isSubmitting) return;
    const query = normalizeSearchQuery(input.value);
    if (!query) {
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
        if (!document.getElementById("ht-panel-host")) return;
        setSubmitting(false);
        focusSearchInput();
      });
  });
  input.addEventListener("input", () => setStatus(""));
  cancelButton.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (event) => event.preventDefault());
  for (const eventType of SEARCH_LAUNCHER_EVENT_TYPES) {
    shadow.addEventListener(eventType, searchLauncherEventHandler);
  }
  document.addEventListener("keydown", keyHandler, true);
  registerPanelCleanup(close);
  host.focus({ preventScroll: true });
  focusSearchInput();
  requestAnimationFrame(focusSearchInput);
}
