// App init — wires TabWheel page gestures, scroll memory, and content messages.

import browser from "webextension-polyfill";
import {
  DEFAULT_TABWHEEL_SETTINGS,
  loadTabWheelSettings,
  normalizeTabWheelSettings,
  TABWHEEL_MODIFIER_KEYS,
  TABWHEEL_STORAGE_KEYS,
} from "../common/contracts/tabWheel";
import { ContentRuntimeMessage } from "../common/contracts/runtimeMessages";
import { dismissPanel } from "../common/utils/panelHost";
import { resolveWheelDirection } from "../core/tabWheel/tabWheelCore";
import {
  clearTaggedTabs,
  cycleTabWheel,
  getCurrentTabWheelStateWithRetry,
  listTaggedTabs,
  removeCurrentTabTag,
  saveTaggedTabScrollPosition,
  tagCurrentTab,
} from "../adapters/runtime/tabWheelApi";
import { escapeHtml } from "../common/utils/helpers";
import { openTabWheelHelpOverlay } from "../ui/panels/help/help";
import { openTabWheelPanel } from "../ui/panels/tabWheel/tabWheel";

declare global {
  interface Window {
    __tabWheelCleanup?: () => void;
  }
}

const WHEEL_COOLDOWN_MS = 320;
const STATUS_TIMEOUT_MS = 1800;
const SCROLL_SAVE_DEBOUNCE_MS = 700;
const SCROLL_RESTORE_SUPPRESS_SAVE_MS = 450;
const SHORTCUT_KEYUP_SUPPRESSION_MS = 900;
const TAGGED_INDICATOR_DEBOUNCE_MS = 90;
const TAGGED_PILL_ID = "tw-tagged-pill";
const TAGGED_FAVICON_ATTR = "data-tabwheel-favicon";
const TAGGED_FAVICON_RESTORE_ATTR = "data-tabwheel-favicon-restore";
type TabWheelEventModifierKey = TabWheelModifierKey | "shift";
type MouseGestureTerminalEvent = "click" | "auxclick" | "contextmenu";
interface OwnedMouseGesture {
  terminalEvent: MouseGestureTerminalEvent;
  startClientX: number;
  startClientY: number;
  releaseClientX: number | null;
  releaseClientY: number | null;
  hasReleased: boolean;
}
const EVENT_MODIFIER_KEYS: readonly TabWheelEventModifierKey[] = ["alt", "ctrl", "shift", "meta"];
const SCROLL_RESTORE_DELAYS_MS = [0, 80, 220, 500, 900, 1500, 2400, 3600];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']",
  );
  return editable !== null;
}

function isTabWheelModifier(
  event: MouseEvent | WheelEvent | KeyboardEvent,
  modifier: TabWheelModifierKey,
  withShift: boolean,
): boolean {
  const modifierState: Record<TabWheelEventModifierKey, boolean> = {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
  if (!TABWHEEL_MODIFIER_KEYS.includes(modifier)) return false;
  return EVENT_MODIFIER_KEYS.every((key) => {
    if (key === modifier) return modifierState[key];
    if (key === "shift") return modifierState.shift === withShift;
    return !modifierState[key];
  });
}

function clampScrollY(scrollY: number): number {
  const documentElement = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(
    documentElement?.scrollHeight || 0,
    body?.scrollHeight || 0,
    documentElement?.offsetHeight || 0,
    body?.offsetHeight || 0,
  );
  const maxScrollY = Math.max(0, scrollHeight - window.innerHeight);
  return Math.max(0, Math.min(scrollY, maxScrollY));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function suppressPageEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function getTabCycleWheelDelta(event: WheelEvent): number {
  if (event.deltaY !== 0) return event.deltaY;
  return event.deltaX;
}

function isModifierKeyName(key: string, modifier: TabWheelEventModifierKey): boolean {
  const normalizedKey = key.toLowerCase();
  if (modifier === "ctrl") return normalizedKey === "control" || normalizedKey === "ctrl";
  if (modifier === "alt") return normalizedKey === "alt";
  if (modifier === "shift") return normalizedKey === "shift";
  return normalizedKey === "meta" || normalizedKey === "os";
}

function isShortcutKeyEvent(event: KeyboardEvent, key: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (event.key.toLowerCase() === normalizedKey) return true;
  if (/^[a-z]$/.test(normalizedKey)) return event.code === `Key${normalizedKey.toUpperCase()}`;
  if (/^[0-9]$/.test(normalizedKey)) return event.code === `Digit${normalizedKey}`;
  return false;
}

export function initApp(): void {
  if (window.__tabWheelCleanup) {
    window.__tabWheelCleanup();
  }

  let settings: TabWheelSettings = { ...DEFAULT_TABWHEEL_SETTINGS };
  let statusTimer = 0;
  let scrollSaveTimer = 0;
  let lastScrollSaveX = Number.NaN;
  let lastScrollSaveY = Number.NaN;
  let suppressScrollSaveUntil = 0;
  let scrollRestoreToken = 0;
  let lastWheelAt = 0;
  const ownedMouseGesturesByButton = new Map<number, OwnedMouseGesture>();
  let suppressShortcutKeyUpUntil = 0;
  let suppressShortcutKeyUpModifier: TabWheelModifierKey | null = null;
  let suppressShortcutKeyUpWithShift = false;
  let suppressShortcutKeyUpKey = "";
  let suppressShortcutKeyUpBaseReleased = false;
  let suppressShortcutKeyUpShiftReleased = true;
  let taggedIndicatorRefreshTimer = 0;
  let taggedIndicatorRenderTimer = 0;
  let isTaggedIndicatorActive = false;
  let lastTaggedFaviconHref = "";
  let faviconObserver: MutationObserver | null = null;
  let faviconObserverTarget: Node | null = null;
  let clearConfirmCleanup: (() => void) | null = null;

  void loadTabWheelSettings().then((loadedSettings) => {
    settings = loadedSettings;
  });

  function showStatus(message: string): void {
    let status = document.getElementById("tw-status-indicator");
    if (!status) {
      status = document.createElement("div");
      status.id = "tw-status-indicator";
      status.setAttribute("role", "status");
      status.style.cssText = [
        "position:fixed",
        "left:50%",
        "top:50%",
        "transform:translate(-50%,-50%)",
        "z-index:2147483646",
        "width:min(420px,calc(100vw - 32px))",
        "min-height:56px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "text-align:center",
        "padding:14px 18px",
        "border-radius:10px",
        "border:1px solid rgba(255,255,255,0.14)",
        "background:#1e1e1e",
        "color:#e0e0e0",
        "box-shadow:0 18px 54px rgba(0,0,0,0.44)",
        "font:13px/1.45 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace",
        "pointer-events:none",
      ].join(";");
      document.documentElement.appendChild(status);
    }
    status.textContent = message;
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status?.remove();
      statusTimer = 0;
    }, STATUS_TIMEOUT_MS);
  }

  function getIconLinks(includeTaggedFavicon: boolean): HTMLLinkElement[] {
    return Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel]"))
      .filter((link) => link.relList.contains("icon"))
      .filter((link) => includeTaggedFavicon || link.getAttribute(TAGGED_FAVICON_ATTR) !== "true");
  }

  function resolveFaviconHref(rawHref: string): string {
    try {
      return new URL(rawHref, document.baseURI).href;
    } catch (_) {
      return rawHref;
    }
  }

  function getCurrentFaviconHref(): string {
    const icons = getIconLinks(false);
    for (let index = icons.length - 1; index >= 0; index--) {
      const rawHref = icons[index].getAttribute("href");
      if (rawHref) return resolveFaviconHref(rawHref);
    }
    return "";
  }

  function getCurrentFaviconLink(): HTMLLinkElement | null {
    const icons = getIconLinks(false);
    return icons[icons.length - 1] || null;
  }

  function getDefaultFaviconHref(): string {
    try {
      return new URL("/favicon.ico", window.location.origin).href;
    } catch (_) {
      return "";
    }
  }

  function buildTaggedFaviconHref(originalHref: string): string {
    const originalImage = originalHref
      ? `<image href="${escapeHtml(originalHref)}" width="64" height="64" preserveAspectRatio="xMidYMid meet"/>`
      : "";
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
      '<rect width="64" height="64" rx="14" fill="#16211a"/>',
      originalImage,
      '<circle cx="48" cy="48" r="14" fill="#32d74b" stroke="#101010" stroke-width="5"/>',
      '<path d="M41 48.5l4.6 4.8L56 42" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
      "</svg>",
    ].join("");
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function removeFaviconRestoreLinks(): void {
    document
      .querySelectorAll<HTMLLinkElement>(`link[${TAGGED_FAVICON_RESTORE_ATTR}="true"]`)
      .forEach((link) => link.remove());
  }

  function forceRestoreOriginalFavicon(originalLink: HTMLLinkElement | null, originalHref: string): void {
    const head = document.head;
    if (!head) return;
    removeFaviconRestoreLinks();
    if (originalLink && originalHref) {
      originalLink.href = originalHref;
      head.appendChild(originalLink);
      return;
    }
    const fallbackHref = originalHref || getDefaultFaviconHref();
    if (!fallbackHref) return;
    const link = document.createElement("link");
    link.setAttribute(TAGGED_FAVICON_RESTORE_ATTR, "true");
    link.rel = "icon";
    link.href = fallbackHref;
    head.appendChild(link);
  }

  function removeTaggedFavicon(): void {
    const taggedLinks = Array.from(
      document.querySelectorAll<HTMLLinkElement>(`link[${TAGGED_FAVICON_ATTR}="true"]`),
    );
    if (taggedLinks.length === 0) {
      lastTaggedFaviconHref = "";
      return;
    }
    const originalLink = getCurrentFaviconLink();
    const originalHref = originalLink?.href || getCurrentFaviconHref();
    taggedLinks.forEach((link) => link.remove());
    lastTaggedFaviconHref = "";
    forceRestoreOriginalFavicon(originalLink, originalHref);
  }

  function ensureTaggedFavicon(): void {
    const head = document.head;
    if (!head) return;
    const originalHref = getCurrentFaviconHref();
    removeFaviconRestoreLinks();
    const faviconHref = buildTaggedFaviconHref(originalHref);
    let link = document.querySelector<HTMLLinkElement>(`link[${TAGGED_FAVICON_ATTR}="true"]`);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute(TAGGED_FAVICON_ATTR, "true");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.setAttribute("sizes", "any");
    }
    if (lastTaggedFaviconHref !== faviconHref || link.getAttribute("href") !== faviconHref) {
      link.href = faviconHref;
      lastTaggedFaviconHref = faviconHref;
    }
    if (link.parentElement !== head) head.appendChild(link);
    const icons = getIconLinks(true);
    if (icons[icons.length - 1] !== link) head.appendChild(link);
  }

  function removeTaggedPill(): void {
    document.getElementById(TAGGED_PILL_ID)?.remove();
  }

  function ensureTaggedPill(): void {
    if (document.getElementById(TAGGED_PILL_ID)) return;
    const pill = document.createElement("div");
    pill.id = TAGGED_PILL_ID;
    pill.setAttribute("aria-hidden", "true");
    pill.textContent = "Tagged";
    pill.style.cssText = [
      "position:fixed",
      "top:10px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483644",
      "min-height:18px",
      "padding:3px 7px",
      "border-radius:999px",
      "border:1px solid rgba(255,255,255,0.12)",
      "background:rgba(18,18,18,0.24)",
      "color:rgba(255,255,255,0.52)",
      "box-shadow:0 5px 16px rgba(0,0,0,0.10)",
      "font:10px/1.2 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace",
      "font-weight:600",
      "letter-spacing:0",
      "pointer-events:none",
      "user-select:none",
    ].join(";");
    document.documentElement.appendChild(pill);
  }

  function scheduleTaggedIndicatorRender(): void {
    if (taggedIndicatorRenderTimer) window.clearTimeout(taggedIndicatorRenderTimer);
    taggedIndicatorRenderTimer = window.setTimeout(() => {
      taggedIndicatorRenderTimer = 0;
      applyTaggedIndicators(isTaggedIndicatorActive);
    }, TAGGED_INDICATOR_DEBOUNCE_MS);
  }

  function observeFaviconChanges(): void {
    const target = document.head || document.documentElement;
    if (faviconObserver && faviconObserverTarget === target) return;
    faviconObserver?.disconnect();
    faviconObserverTarget = target;
    faviconObserver = new MutationObserver(() => {
      if (!isTaggedIndicatorActive) return;
      observeFaviconChanges();
      scheduleTaggedIndicatorRender();
    });
    faviconObserver.observe(target, target === document.head
      ? { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "rel"] }
      : { childList: true });
  }

  function stopFaviconObserver(): void {
    faviconObserver?.disconnect();
    faviconObserver = null;
    faviconObserverTarget = null;
  }

  function applyTaggedIndicators(isTagged: boolean): void {
    isTaggedIndicatorActive = isTagged;
    if (!isTagged) {
      removeTaggedPill();
      removeTaggedFavicon();
      stopFaviconObserver();
      return;
    }
    ensureTaggedPill();
    observeFaviconChanges();
    ensureTaggedFavicon();
  }

  async function refreshTaggedIndicators(): Promise<void> {
    try {
      const state = await getCurrentTabWheelStateWithRetry();
      applyTaggedIndicators(state.isTagged);
    } catch (_) {
      applyTaggedIndicators(false);
    }
  }

  function scheduleTaggedIndicatorRefresh(): void {
    if (taggedIndicatorRefreshTimer) window.clearTimeout(taggedIndicatorRefreshTimer);
    taggedIndicatorRefreshTimer = window.setTimeout(() => {
      taggedIndicatorRefreshTimer = 0;
      void refreshTaggedIndicators();
    }, TAGGED_INDICATOR_DEBOUNCE_MS);
  }

  function closeClearConfirm(): void {
    if (!clearConfirmCleanup) return;
    const cleanup = clearConfirmCleanup;
    clearConfirmCleanup = null;
    cleanup();
  }

  function openClearConfirm(taggedCount: number): void {
    closeClearConfirm();
    const backdrop = document.createElement("div");
    backdrop.id = "tw-clear-confirm-backdrop";
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483646",
      "background:rgba(0,0,0,0.28)",
    ].join(";");

    const toast = document.createElement("div");
    toast.id = "tw-clear-confirm";
    toast.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "z-index:2147483647",
      "width:min(420px,calc(100vw - 32px))",
      "padding:18px",
      "border-radius:10px",
      "border:1px solid rgba(255,255,255,0.14)",
      "background:#1e1e1e",
      "color:#e0e0e0",
      "box-shadow:0 20px 60px rgba(0,0,0,0.5)",
      "font:13px/1.45 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace",
      "text-align:center",
    ].join(";");
    toast.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Clear all tagged tabs?</div>
      <div style="color:#a0a0a0;margin-bottom:14px;">Remove ${taggedCount} ${taggedCount === 1 ? "tag" : "tags"} in this window. Tabs stay open.</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button data-tw-clear="yes" style="min-width:74px;font:inherit;color:#1a1a1a;background:#32d74b;border:1px solid #32d74b;border-radius:7px;padding:7px 14px;cursor:pointer;">Y</button>
        <button data-tw-clear="no" style="min-width:74px;font:inherit;color:#e0e0e0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:7px;padding:7px 14px;cursor:pointer;">N</button>
      </div>`;
    document.documentElement.appendChild(backdrop);
    document.documentElement.appendChild(toast);

    const confirm = (): void => {
      closeClearConfirm();
      void clearTaggedTabs().then(() => {
        scheduleTaggedIndicatorRefresh();
      }).catch(() => {
        showStatus("Clear failed");
      });
    };
    const cancel = (): void => {
      closeClearConfirm();
      showStatus("Clear cancelled");
    };
    const clickHandler = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      const action = target?.dataset.twClear;
      if (action === "yes") confirm();
      if (action === "no") cancel();
    };
    const keyHandler = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        confirm();
      }
      if (event.key.toLowerCase() === "n" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };

    toast.addEventListener("click", clickHandler);
    backdrop.addEventListener("click", cancel);
    document.addEventListener("keydown", keyHandler, true);
    clearConfirmCleanup = () => {
      toast.removeEventListener("click", clickHandler);
      backdrop.removeEventListener("click", cancel);
      document.removeEventListener("keydown", keyHandler, true);
      toast.remove();
      backdrop.remove();
    };
  }

  async function requestClearTaggedTabs(): Promise<void> {
    const entries = await listTaggedTabs().catch(() => []);
    if (entries.length === 0) {
      showStatus("No currently tagged tabs");
      return;
    }
    openClearConfirm(entries.length);
  }

  function sendScrollSnapshot(): void {
    if (Date.now() < suppressScrollSaveUntil) return;
    const scrollX = Math.max(0, window.scrollX);
    const scrollY = Math.max(0, window.scrollY);
    if (scrollX === lastScrollSaveX && scrollY === lastScrollSaveY) return;
    lastScrollSaveX = scrollX;
    lastScrollSaveY = scrollY;
    void saveTaggedTabScrollPosition(scrollX, scrollY).catch(() => {});
  }

  function flushScrollSnapshot(): void {
    if (scrollSaveTimer) {
      window.clearTimeout(scrollSaveTimer);
      scrollSaveTimer = 0;
    }
    sendScrollSnapshot();
  }

  function scheduleScrollSnapshot(): void {
    if (Date.now() < suppressScrollSaveUntil) return;
    if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(() => {
      scrollSaveTimer = 0;
      sendScrollSnapshot();
    }, SCROLL_SAVE_DEBOUNCE_MS);
  }

  async function restoreWindowScroll(
    scrollX: number,
    scrollY: number,
    smooth?: boolean,
  ): Promise<void> {
    const token = ++scrollRestoreToken;
    const targetX = Math.max(0, Number(scrollX) || 0);
    const targetY = Math.max(0, Number(scrollY) || 0);

    for (const delay of SCROLL_RESTORE_DELAYS_MS) {
      if (token !== scrollRestoreToken) return;
      if (delay > 0) await sleep(delay);
      if (token !== scrollRestoreToken) return;

      suppressScrollSaveUntil = Date.now() + SCROLL_RESTORE_SUPPRESS_SAVE_MS;
      if (scrollSaveTimer) {
        window.clearTimeout(scrollSaveTimer);
        scrollSaveTimer = 0;
      }

      window.scrollTo({
        left: targetX,
        top: clampScrollY(targetY),
        behavior: smooth && delay === 0 ? "smooth" : "auto",
      });

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (Math.abs(window.scrollY - targetY) <= 2) return;
    }
  }

  function wheelHandler(event: WheelEvent): void {
    if (
      !isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      || isEditableTarget(event.target)
    ) return;
    const wheelDelta = getTabCycleWheelDelta(event);
    if (wheelDelta === 0) return;
    suppressPageEvent(event);
    const now = Date.now();
    if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
    lastWheelAt = now;
    const direction = resolveWheelDirection(wheelDelta, settings.invertScroll);
    void cycleTabWheel(direction).then((result) => {
      if (!result.ok && result.reason) showStatus(result.reason);
    });
  }

  function resolveMouseGestureTerminalEvent(button: number): MouseGestureTerminalEvent | null {
    if (button === 0) return "click";
    if (button === 1) return "auxclick";
    if (button === 2) return "contextmenu";
    return null;
  }

  function clearOwnedMouseGesture(button: number): void {
    ownedMouseGesturesByButton.delete(button);
  }

  function clearOwnedMouseGestures(): void {
    ownedMouseGesturesByButton.clear();
  }

  function hasOwnedMouseGesture(button: number): boolean {
    return ownedMouseGesturesByButton.has(button);
  }

  function isSameMousePosition(event: MouseEvent, clientX: number | null, clientY: number | null): boolean {
    return clientX !== null && clientY !== null && event.clientX === clientX && event.clientY === clientY;
  }

  function isOwnedMouseGestureTerminalEvent(
    gesture: OwnedMouseGesture,
    event: MouseEvent,
    terminalEvent: MouseGestureTerminalEvent,
  ): boolean {
    if (!event.isTrusted) return false;
    if (gesture.terminalEvent !== terminalEvent) return false;
    if (terminalEvent === "contextmenu") {
      return event.button === 2
        || isSameMousePosition(event, gesture.startClientX, gesture.startClientY)
        || isSameMousePosition(event, gesture.releaseClientX, gesture.releaseClientY);
    }
    return gesture.hasReleased
      && (event.detail > 0 || isSameMousePosition(event, gesture.releaseClientX, gesture.releaseClientY));
  }

  function ownMouseGesture(button: number, event: MouseEvent): boolean {
    const terminalEvent = resolveMouseGestureTerminalEvent(button);
    if (!terminalEvent) return false;
    clearOwnedMouseGesture(button);
    ownedMouseGesturesByButton.set(button, {
      terminalEvent,
      startClientX: event.clientX,
      startClientY: event.clientY,
      releaseClientX: null,
      releaseClientY: null,
      hasReleased: false,
    });
    return true;
  }

  function markOwnedMouseGestureReleased(button: number, event: MouseEvent): boolean {
    const gesture = ownedMouseGesturesByButton.get(button);
    if (!gesture) return false;
    gesture.releaseClientX = event.clientX;
    gesture.releaseClientY = event.clientY;
    gesture.hasReleased = true;
    return true;
  }

  function completeOwnedMouseGesture(
    button: number,
    terminalEvent: MouseGestureTerminalEvent,
    event: MouseEvent,
  ): boolean {
    const gesture = ownedMouseGesturesByButton.get(button);
    if (!gesture) return false;
    if (!isOwnedMouseGestureTerminalEvent(gesture, event, terminalEvent)) {
      clearOwnedMouseGesture(button);
      return false;
    }
    clearOwnedMouseGesture(button);
    runModifierClickAction(button);
    return true;
  }

  function isHandledModifierMouseEvent(
    event: MouseEvent,
    button = event.button,
  ): boolean {
    return event.isTrusted
      && isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      && !isEditableTarget(event.target)
      && [0, 1, 2].includes(button);
  }

  function runModifierClickAction(button: number): void {
    if (button === 0) {
      void tagCurrentTab().then(() => {
        scheduleTaggedIndicatorRefresh();
      }).catch(() => {
        showStatus("Tag failed");
      });
      return;
    }

    if (button === 2) {
      void removeCurrentTabTag().then(() => {
        scheduleTaggedIndicatorRefresh();
      }).catch(() => {
        showStatus("Remove failed");
      });
      return;
    }

    void requestClearTaggedTabs();
  }

  function claimModifierClickGesture(button: number, event: MouseEvent): void {
    if (hasOwnedMouseGesture(button)) return;
    ownMouseGesture(button, event);
  }

  function pointerDownHandler(event: PointerEvent): void {
    clearOwnedMouseGestures();
    if (!isHandledModifierMouseEvent(event)) return;
    suppressPageEvent(event);
    claimModifierClickGesture(event.button, event);
  }

  function pointerUpHandler(event: PointerEvent): void {
    if (markOwnedMouseGestureReleased(event.button, event)) {
      suppressPageEvent(event);
      return;
    }
    if (isHandledModifierMouseEvent(event)) suppressPageEvent(event);
  }

  function pointerCancelHandler(event: PointerEvent): void {
    if (!hasOwnedMouseGesture(event.button)) return;
    clearOwnedMouseGesture(event.button);
    suppressPageEvent(event);
  }

  function mouseDownHandler(event: MouseEvent): void {
    clearOwnedMouseGestures();
    if (!isHandledModifierMouseEvent(event)) return;
    suppressPageEvent(event);
    claimModifierClickGesture(event.button, event);
  }

  function mouseUpHandler(event: MouseEvent): void {
    if (markOwnedMouseGestureReleased(event.button, event)) {
      suppressPageEvent(event);
      return;
    }
    if (isHandledModifierMouseEvent(event)) suppressPageEvent(event);
  }

  function clickHandler(event: MouseEvent): void {
    if (completeOwnedMouseGesture(0, "click", event)) {
      suppressPageEvent(event);
      return;
    }
    if (isHandledModifierMouseEvent(event)) {
      suppressPageEvent(event);
    }
  }

  function isShortcutEvent(
    event: KeyboardEvent,
    modifier: TabWheelModifierKey,
    withShift: boolean,
    key: string,
  ): boolean {
    return isTabWheelModifier(event, modifier, withShift) && isShortcutKeyEvent(event, key);
  }

  function clearShortcutKeyUpSuppression(): void {
    suppressShortcutKeyUpUntil = 0;
    suppressShortcutKeyUpModifier = null;
    suppressShortcutKeyUpWithShift = false;
    suppressShortcutKeyUpKey = "";
    suppressShortcutKeyUpBaseReleased = false;
    suppressShortcutKeyUpShiftReleased = true;
  }

  function markShortcutKeyUpSuppressed(
    modifier: TabWheelModifierKey,
    withShift: boolean,
    key: string,
  ): void {
    suppressShortcutKeyUpUntil = Date.now() + SHORTCUT_KEYUP_SUPPRESSION_MS;
    suppressShortcutKeyUpModifier = modifier;
    suppressShortcutKeyUpWithShift = withShift;
    suppressShortcutKeyUpKey = key;
    suppressShortcutKeyUpBaseReleased = false;
    suppressShortcutKeyUpShiftReleased = !withShift;
  }

  function keyDownHandler(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    if (isShortcutEvent(event, settings.panelModifier, settings.panelWithShift, settings.panelKey)) {
      markShortcutKeyUpSuppressed(settings.panelModifier, settings.panelWithShift, settings.panelKey);
      suppressPageEvent(event);
      void openTabWheelPanel();
      return;
    }
    if (isShortcutEvent(event, settings.helpModifier, settings.helpWithShift, settings.helpKey)) {
      markShortcutKeyUpSuppressed(settings.helpModifier, settings.helpWithShift, settings.helpKey);
      suppressPageEvent(event);
      void openTabWheelHelpOverlay();
    }
  }

  function keyUpHandler(event: KeyboardEvent): void {
    if (Date.now() > suppressShortcutKeyUpUntil || !suppressShortcutKeyUpModifier) {
      if (suppressShortcutKeyUpModifier) clearShortcutKeyUpSuppression();
      return;
    }
    const isBaseModifierKey = isModifierKeyName(event.key, suppressShortcutKeyUpModifier);
    const isRequiredShiftKey = suppressShortcutKeyUpWithShift && isModifierKeyName(event.key, "shift");
    if (
      isShortcutKeyEvent(event, suppressShortcutKeyUpKey)
      || isBaseModifierKey
      || isRequiredShiftKey
    ) {
      suppressPageEvent(event);
      if (isBaseModifierKey) suppressShortcutKeyUpBaseReleased = true;
      if (isRequiredShiftKey) suppressShortcutKeyUpShiftReleased = true;
      if (suppressShortcutKeyUpBaseReleased && suppressShortcutKeyUpShiftReleased) clearShortcutKeyUpSuppression();
    }
  }

  function auxClickHandler(event: MouseEvent): void {
    if (event.button === 1 && completeOwnedMouseGesture(1, "auxclick", event)) {
      suppressPageEvent(event);
      return;
    }
    if (isHandledModifierMouseEvent(event)) {
      suppressPageEvent(event);
    }
  }

  function contextMenuHandler(event: MouseEvent): void {
    if (completeOwnedMouseGesture(2, "contextmenu", event)) {
      suppressPageEvent(event);
      return;
    }
    if (isHandledModifierMouseEvent(event, 2)) {
      suppressPageEvent(event);
    }
  }

  function storageChangedHandler(
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void {
    if (areaName !== "local") return;
    const settingsChange = changes[TABWHEEL_STORAGE_KEYS.settings];
    if (settingsChange) {
      settings = normalizeTabWheelSettings(settingsChange.newValue);
    }
    if (changes[TABWHEEL_STORAGE_KEYS.taggedTabs]) {
      scheduleTaggedIndicatorRefresh();
    }
  }

  function messageHandler(message: unknown): Promise<unknown> | undefined {
    const receivedMessage = message as ContentRuntimeMessage;
    switch (receivedMessage.type) {
      case "GET_SCROLL":
        return Promise.resolve({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        });
      case "SET_SCROLL":
        void restoreWindowScroll(
          receivedMessage.scrollX,
          receivedMessage.scrollY,
          receivedMessage.smooth,
        );
        return Promise.resolve({ ok: true });
      case "TABWHEEL_STATUS":
        showStatus(receivedMessage.message);
        return Promise.resolve({ ok: true });
      case "TABWHEEL_TAG_STATE_CHANGED":
        applyTaggedIndicators(receivedMessage.isTagged);
        return Promise.resolve({ ok: true });
      case "OPEN_TABWHEEL_HELP":
        void openTabWheelHelpOverlay();
        return Promise.resolve({ ok: true });
    }
  }

  function visibilityHandler(): void {
    if (document.visibilityState === "hidden") {
      flushScrollSnapshot();
      clearOwnedMouseGestures();
      closeClearConfirm();
      dismissPanel();
      return;
    }
    scheduleTaggedIndicatorRefresh();
  }

  function documentReadyHandler(): void {
    if (isTaggedIndicatorActive) scheduleTaggedIndicatorRender();
  }

  function pageShowHandler(): void {
    scheduleTaggedIndicatorRefresh();
  }

  window.addEventListener("pointerdown", pointerDownHandler, true);
  window.addEventListener("pointerup", pointerUpHandler, true);
  window.addEventListener("pointercancel", pointerCancelHandler, true);
  window.addEventListener("mousedown", mouseDownHandler, true);
  window.addEventListener("mouseup", mouseUpHandler, true);
  window.addEventListener("click", clickHandler, true);
  window.addEventListener("auxclick", auxClickHandler, true);
  window.addEventListener("contextmenu", contextMenuHandler, true);
  window.addEventListener("keydown", keyDownHandler, true);
  window.addEventListener("keyup", keyUpHandler, true);
  document.addEventListener("keydown", keyDownHandler, true);
  document.addEventListener("keyup", keyUpHandler, true);
  document.addEventListener("visibilitychange", visibilityHandler);
  document.addEventListener("DOMContentLoaded", documentReadyHandler);
  window.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
  window.addEventListener("scroll", scheduleScrollSnapshot, { passive: true, capture: true });
  window.addEventListener("pageshow", pageShowHandler);
  window.addEventListener("pagehide", flushScrollSnapshot);
  window.addEventListener("beforeunload", flushScrollSnapshot);
  browser.storage.onChanged.addListener(storageChangedHandler);
  browser.runtime.onMessage.addListener(messageHandler);
  scheduleTaggedIndicatorRefresh();

  window.__tabWheelCleanup = () => {
    window.removeEventListener("pointerdown", pointerDownHandler, true);
    window.removeEventListener("pointerup", pointerUpHandler, true);
    window.removeEventListener("pointercancel", pointerCancelHandler, true);
    window.removeEventListener("mousedown", mouseDownHandler, true);
    window.removeEventListener("mouseup", mouseUpHandler, true);
    window.removeEventListener("click", clickHandler, true);
    window.removeEventListener("auxclick", auxClickHandler, true);
    window.removeEventListener("contextmenu", contextMenuHandler, true);
    window.removeEventListener("keydown", keyDownHandler, true);
    window.removeEventListener("keyup", keyUpHandler, true);
    document.removeEventListener("keydown", keyDownHandler, true);
    document.removeEventListener("keyup", keyUpHandler, true);
    document.removeEventListener("visibilitychange", visibilityHandler);
    document.removeEventListener("DOMContentLoaded", documentReadyHandler);
    window.removeEventListener("wheel", wheelHandler, true);
    window.removeEventListener("scroll", scheduleScrollSnapshot, true);
    window.removeEventListener("pageshow", pageShowHandler);
    window.removeEventListener("pagehide", flushScrollSnapshot);
    window.removeEventListener("beforeunload", flushScrollSnapshot);
    browser.storage.onChanged.removeListener(storageChangedHandler);
    browser.runtime.onMessage.removeListener(messageHandler);
    if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
    if (statusTimer) window.clearTimeout(statusTimer);
    clearOwnedMouseGestures();
    if (taggedIndicatorRefreshTimer) window.clearTimeout(taggedIndicatorRefreshTimer);
    if (taggedIndicatorRenderTimer) window.clearTimeout(taggedIndicatorRenderTimer);
    stopFaviconObserver();
    removeTaggedFavicon();
    removeFaviconRestoreLinks();
    removeTaggedPill();
    closeClearConfirm();
    dismissPanel();
    document.getElementById("tw-status-indicator")?.remove();
  };
}
