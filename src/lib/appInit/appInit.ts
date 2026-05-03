// App init - wires TabWheel wheel cycling, click gestures, scroll memory, and content messages.

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
import { normalizeWheelDelta, resolveWheelDirection } from "../core/tabWheel/tabWheelCore";
import {
  activateMostRecentTabWheelTab,
  closeCurrentTabWheelTabAndActivateRecent,
  cycleTabWheel,
  saveTabWheelScrollPosition,
} from "../adapters/runtime/tabWheelApi";
import { openTabWheelHelpOverlay } from "../ui/panels/help/help";
import { openTabWheelSearchLauncher } from "../ui/panels/searchLauncher/searchLauncher";

declare global {
  interface Window {
    __tabWheelCleanup?: () => void;
  }
}

const SCROLL_SAVE_DEBOUNCE_MS = 700;
const SCROLL_RESTORE_SUPPRESS_SAVE_MS = 450;
const WHEEL_TRIGGER_THRESHOLD_PX = 80;
const WHEEL_ACCELERATION_WINDOW_MS = 700;
const MIN_ACCELERATED_COOLDOWN_MS = 80;
const OVERSHOOT_GUARD_MS = 260;
const STATUS_TIMEOUT_MS = 1500;
const STATUS_ID = "tw-status-indicator";
const MOUSE_GESTURE_CLAIM_MS = 900;
const SCROLL_RESTORE_DELAYS_MS = [0, 80, 220, 500, 900, 1500, 2400, 3600];
const LAYOUT_STABILITY_TIMEOUT_MS = 1600;
const LAYOUT_STABILITY_REQUIRED_FRAMES = 3;
const LAYOUT_DIMENSION_TOLERANCE_PX = 4;
const LAYOUT_DIMENSION_MATCH_RATIO = 0.08;

type TabWheelEventModifierKey = TabWheelModifierKey | "shift";
type TabWheelMouseGestureAction = "search" | "recentTab" | "closeToRecent";

const EVENT_MODIFIER_KEYS: readonly TabWheelEventModifierKey[] = ["alt", "ctrl", "shift", "meta"];

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
  return Math.max(0, Math.min(scrollY, getMaxScrollY()));
}

function getPageScrollWidth(): number {
  const documentElement = document.documentElement;
  const body = document.body;
  return Math.max(
    documentElement?.scrollWidth || 0,
    body?.scrollWidth || 0,
    documentElement?.offsetWidth || 0,
    body?.offsetWidth || 0,
    documentElement?.clientWidth || 0,
    body?.clientWidth || 0,
  );
}

function getPageScrollHeight(): number {
  const documentElement = document.documentElement;
  const body = document.body;
  return Math.max(
    documentElement?.scrollHeight || 0,
    body?.scrollHeight || 0,
    documentElement?.offsetHeight || 0,
    body?.offsetHeight || 0,
    documentElement?.clientHeight || 0,
    body?.clientHeight || 0,
  );
}

function getMaxScrollX(): number {
  return Math.max(0, getPageScrollWidth() - window.innerWidth);
}

function getMaxScrollY(): number {
  return Math.max(0, getPageScrollHeight() - window.innerHeight);
}

function clampScrollX(scrollX: number): number {
  return Math.max(0, Math.min(scrollX, getMaxScrollX()));
}

function getRootScrollSnapshot(): ScrollData {
  const scrollX = Math.max(0, window.scrollX);
  const scrollY = Math.max(0, window.scrollY);
  const scrollWidth = getPageScrollWidth();
  const scrollHeight = getPageScrollHeight();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxScrollX = Math.max(0, scrollWidth - viewportWidth);
  const maxScrollY = Math.max(0, scrollHeight - viewportHeight);
  return {
    scrollX,
    scrollY,
    scrollRatioX: maxScrollX > 0 ? Math.max(0, Math.min(1, scrollX / maxScrollX)) : 0,
    scrollRatioY: maxScrollY > 0 ? Math.max(0, Math.min(1, scrollY / maxScrollY)) : 0,
    scrollWidth,
    scrollHeight,
    viewportWidth,
    viewportHeight,
  };
}

function hasSimilarDimension(current: number, stored: number): boolean {
  if (!Number.isFinite(stored) || stored <= 0) return false;
  return Math.abs(current - stored) <= Math.max(LAYOUT_DIMENSION_TOLERANCE_PX, stored * LAYOUT_DIMENSION_MATCH_RATIO);
}

function resolveRootScrollTarget(snapshot: ScrollData): { left: number; top: number } {
  const current = getRootScrollSnapshot();
  const hasStoredWidth = snapshot.scrollWidth > 0 && snapshot.viewportWidth > 0;
  const hasStoredHeight = snapshot.scrollHeight > 0 && snapshot.viewportHeight > 0;
  const hasSimilarWidth = hasSimilarDimension(current.scrollWidth, snapshot.scrollWidth)
    && hasSimilarDimension(current.viewportWidth, snapshot.viewportWidth);
  const hasSimilarHeight = hasSimilarDimension(current.scrollHeight, snapshot.scrollHeight)
    && hasSimilarDimension(current.viewportHeight, snapshot.viewportHeight);
  const maxScrollX = Math.max(0, current.scrollWidth - current.viewportWidth);
  const maxScrollY = Math.max(0, current.scrollHeight - current.viewportHeight);
  const ratioX = Number.isFinite(snapshot.scrollRatioX) ? Math.max(0, Math.min(1, snapshot.scrollRatioX)) : 0;
  const ratioY = Number.isFinite(snapshot.scrollRatioY) ? Math.max(0, Math.min(1, snapshot.scrollRatioY)) : 0;
  return {
    left: !hasStoredWidth || hasSimilarWidth ? clampScrollX(snapshot.scrollX) : Math.round(maxScrollX * ratioX),
    top: !hasStoredHeight || hasSimilarHeight ? clampScrollY(snapshot.scrollY) : Math.round(maxScrollY * ratioY),
  };
}

async function waitForLayoutStability(): Promise<void> {
  const startedAt = performance.now();
  let stableFrames = 0;
  let previousWidth = getPageScrollWidth();
  let previousHeight = getPageScrollHeight();

  while (performance.now() - startedAt < LAYOUT_STABILITY_TIMEOUT_MS) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const width = getPageScrollWidth();
    const height = getPageScrollHeight();
    if (
      Math.abs(width - previousWidth) <= LAYOUT_DIMENSION_TOLERANCE_PX
      && Math.abs(height - previousHeight) <= LAYOUT_DIMENSION_TOLERANCE_PX
    ) {
      stableFrames += 1;
      if (stableFrames >= LAYOUT_STABILITY_REQUIRED_FRAMES) return;
    } else {
      stableFrames = 0;
      previousWidth = width;
      previousHeight = height;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function suppressPageEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch (_) {
    return false;
  }
}

export function initApp(): void {
  if (window.__tabWheelCleanup) {
    window.__tabWheelCleanup();
  }

  const isTopFrameContext = isTopFrame();
  let settings: TabWheelSettings = { ...DEFAULT_TABWHEEL_SETTINGS };
  let statusTimer = 0;
  let scrollSaveTimer = 0;
  let lastScrollSaveX = Number.NaN;
  let lastScrollSaveY = Number.NaN;
  let suppressScrollSaveUntil = 0;
  let scrollRestoreToken = 0;
  let wheelAccumulator = 0;
  let lastWheelCycleAt = 0;
  let wheelBurstCount = 0;
  let overshootGuardDirection: "prev" | "next" | null = null;
  let overshootGuardUntil = 0;
  let areSettingsLoaded = false;
  let claimedMouseGesture: {
    action: TabWheelMouseGestureAction;
    button: number;
    hasRun: boolean;
    startedAt: number;
  } | null = null;

  void loadTabWheelSettings()
    .then((loadedSettings) => {
      settings = loadedSettings;
    })
    .finally(() => {
      areSettingsLoaded = true;
    });

  function showStatus(message: string): void {
    let status = document.getElementById(STATUS_ID);
    if (!status) {
      status = document.createElement("div");
      status.id = STATUS_ID;
      status.setAttribute("role", "status");
      status.style.cssText = [
        "position:fixed",
        "left:50%",
        "top:50%",
        "transform:translate(-50%,-50%)",
        "z-index:2147483646",
        "width:min(360px,calc(100vw - 32px))",
        "min-height:42px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "text-align:center",
        "padding:10px 14px",
        "border-radius:8px",
        "border:1px solid rgba(255,255,255,0.14)",
        "background:#1e1e1e",
        "color:#e0e0e0",
        "box-shadow:0 18px 54px rgba(0,0,0,0.44)",
        "font:12px/1.35 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace",
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

  function sendScrollSnapshot(): void {
    if (Date.now() < suppressScrollSaveUntil) return;
    const snapshot = getRootScrollSnapshot();
    if (snapshot.scrollX === lastScrollSaveX && snapshot.scrollY === lastScrollSaveY) return;
    lastScrollSaveX = snapshot.scrollX;
    lastScrollSaveY = snapshot.scrollY;
    void saveTabWheelScrollPosition(snapshot).catch(() => {});
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
    snapshot: ScrollData,
    smooth?: boolean,
  ): Promise<void> {
    const token = ++scrollRestoreToken;
    await waitForLayoutStability();

    for (const delay of SCROLL_RESTORE_DELAYS_MS) {
      if (token !== scrollRestoreToken) return;
      if (delay > 0) await sleep(delay);
      if (token !== scrollRestoreToken) return;

      suppressScrollSaveUntil = Date.now() + SCROLL_RESTORE_SUPPRESS_SAVE_MS;
      if (scrollSaveTimer) {
        window.clearTimeout(scrollSaveTimer);
        scrollSaveTimer = 0;
      }

      const target = resolveRootScrollTarget(snapshot);
      window.scrollTo({
        left: target.left,
        top: target.top,
        behavior: smooth && delay === 0 ? "smooth" : "auto",
      });

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (Math.abs(window.scrollX - target.left) <= 2 && Math.abs(window.scrollY - target.top) <= 2) return;
    }
  }

  function isWheelGestureBlockedTarget(target: EventTarget | null): boolean {
    return !settings.allowGesturesInEditableFields && isEditableTarget(target);
  }

  function isKeyboardWheelEvent(event: WheelEvent): boolean {
    return areSettingsLoaded
      && event.isTrusted
      && isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      && !isWheelGestureBlockedTarget(event.target);
  }

  function resolveMouseGestureAction(event: MouseEvent): TabWheelMouseGestureAction | null {
    if (!areSettingsLoaded) return null;
    if (!event.isTrusted) return null;
    if (!isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)) return null;
    if (isWheelGestureBlockedTarget(event.target)) return null;
    if (event.button === 0) return "search";
    if (event.button === 1) return "recentTab";
    if (event.button === 2) return "closeToRecent";
    return null;
  }

  function isMouseGestureStartEvent(event: MouseEvent): boolean {
    return event.type === "pointerdown" || event.type === "mousedown";
  }

  function getActiveMouseGestureClaim(event: MouseEvent): typeof claimedMouseGesture {
    if (!claimedMouseGesture) return null;
    if (Date.now() - claimedMouseGesture.startedAt > MOUSE_GESTURE_CLAIM_MS) {
      claimedMouseGesture = null;
      return null;
    }
    if (event.type === "contextmenu" && claimedMouseGesture.button === 2) return claimedMouseGesture;
    return event.button === claimedMouseGesture.button ? claimedMouseGesture : null;
  }

  function runMouseGestureAction(action: TabWheelMouseGestureAction): void {
    if (action === "search") {
      void openTabWheelSearchLauncher().catch(() => showStatus("Search unavailable"));
      return;
    }
    if (action === "recentTab") {
      void activateMostRecentTabWheelTab().catch(() => showStatus("Recent tab unavailable"));
      return;
    }
    void closeCurrentTabWheelTabAndActivateRecent()
      .then((result) => {
        if (!result.ok) showStatus(result.reason || "Close tab failed");
      })
      .catch(() => showStatus("Close tab failed"));
  }

  function getTabCycleWheelDelta(event: WheelEvent): number {
    return normalizeWheelDelta(event, window.innerHeight, window.innerWidth, settings.horizontalWheel);
  }

  function getEffectiveCooldown(now: number): number {
    if (!settings.wheelAcceleration) return settings.wheelCooldownMs;
    const gap = now - lastWheelCycleAt;
    const nextBurstCount = gap <= WHEEL_ACCELERATION_WINDOW_MS
      ? Math.min(wheelBurstCount + 1, 6)
      : 0;
    const acceleratedCooldown = settings.wheelCooldownMs - nextBurstCount * 18;
    return Math.max(MIN_ACCELERATED_COOLDOWN_MS, acceleratedCooldown);
  }

  function runWheelCycle(direction: "prev" | "next"): void {
    const now = Date.now();
    if (settings.overshootGuard && direction === overshootGuardDirection && now < overshootGuardUntil) {
      return;
    }
    const effectiveCooldown = getEffectiveCooldown(now);
    if (now - lastWheelCycleAt < effectiveCooldown) return;
    wheelBurstCount = now - lastWheelCycleAt <= WHEEL_ACCELERATION_WINDOW_MS
      ? Math.min(wheelBurstCount + 1, 6)
      : 0;
    lastWheelCycleAt = now;
    overshootGuardDirection = direction;
    overshootGuardUntil = settings.overshootGuard ? now + OVERSHOOT_GUARD_MS : 0;
    void cycleTabWheel(direction).catch(() => {});
  }

  function wheelHandler(event: WheelEvent): void {
    if (!isKeyboardWheelEvent(event)) return;
    const wheelDelta = getTabCycleWheelDelta(event);
    if (wheelDelta === 0) return;
    suppressPageEvent(event);
    wheelAccumulator += wheelDelta * settings.wheelSensitivity;
    if (Math.abs(wheelAccumulator) < WHEEL_TRIGGER_THRESHOLD_PX) return;
    const direction = resolveWheelDirection(wheelAccumulator, settings.invertScroll);
    wheelAccumulator = 0;
    runWheelCycle(direction);
  }

  function mouseGestureHandler(event: MouseEvent): void {
    const activeClaim = getActiveMouseGestureClaim(event);
    if (activeClaim) {
      suppressPageEvent(event);
      if (event.type === "contextmenu" && activeClaim.action === "closeToRecent" && !activeClaim.hasRun) {
        activeClaim.hasRun = true;
        runMouseGestureAction(activeClaim.action);
      }
      if (event.type === "click" || event.type === "contextmenu" || event.type === "auxclick") {
        claimedMouseGesture = null;
      }
      return;
    }

    const action = resolveMouseGestureAction(event);
    if (!action) return;
    suppressPageEvent(event);

    if (isMouseGestureStartEvent(event) || event.type === "click" || event.type === "contextmenu" || event.type === "auxclick") {
      claimedMouseGesture = {
        action,
        button: event.button,
        hasRun: false,
        startedAt: Date.now(),
      };
      if (action !== "closeToRecent" || event.type === "contextmenu") {
        claimedMouseGesture.hasRun = true;
        runMouseGestureAction(action);
      }
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
      wheelAccumulator = 0;
      wheelBurstCount = 0;
      overshootGuardDirection = null;
      overshootGuardUntil = 0;
      claimedMouseGesture = null;
    }
  }

  function messageHandler(message: unknown): Promise<unknown> | undefined {
    const receivedMessage = message as ContentRuntimeMessage;
    switch (receivedMessage.type) {
      case "TABWHEEL_PING":
        return Promise.resolve({ ok: true });
      case "GET_SCROLL":
        return Promise.resolve(getRootScrollSnapshot());
      case "SET_SCROLL":
        void restoreWindowScroll(receivedMessage, receivedMessage.smooth);
        return Promise.resolve({ ok: true });
      case "TABWHEEL_STATUS":
        showStatus(receivedMessage.message);
        return Promise.resolve({ ok: true });
      case "OPEN_TABWHEEL_HELP":
        void openTabWheelHelpOverlay();
        return Promise.resolve({ ok: true });
    }
  }

  function visibilityHandler(): void {
    if (document.visibilityState === "hidden") {
      flushScrollSnapshot();
      dismissPanel();
    }
  }

  window.addEventListener("pointerdown", mouseGestureHandler, true);
  window.addEventListener("mousedown", mouseGestureHandler, true);
  window.addEventListener("pointerup", mouseGestureHandler, true);
  window.addEventListener("mouseup", mouseGestureHandler, true);
  window.addEventListener("click", mouseGestureHandler, true);
  window.addEventListener("auxclick", mouseGestureHandler, true);
  window.addEventListener("contextmenu", mouseGestureHandler, true);
  document.addEventListener("pointerdown", mouseGestureHandler, true);
  document.addEventListener("mousedown", mouseGestureHandler, true);
  document.addEventListener("pointerup", mouseGestureHandler, true);
  document.addEventListener("mouseup", mouseGestureHandler, true);
  document.addEventListener("click", mouseGestureHandler, true);
  document.addEventListener("auxclick", mouseGestureHandler, true);
  document.addEventListener("contextmenu", mouseGestureHandler, true);
  window.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
  document.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
  browser.storage.onChanged.addListener(storageChangedHandler);

  if (isTopFrameContext) {
    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("scroll", scheduleScrollSnapshot, { passive: true, capture: true });
    window.addEventListener("pagehide", flushScrollSnapshot);
    window.addEventListener("beforeunload", flushScrollSnapshot);
    browser.runtime.onMessage.addListener(messageHandler);
  }

  window.__tabWheelCleanup = () => {
    window.removeEventListener("pointerdown", mouseGestureHandler, true);
    window.removeEventListener("mousedown", mouseGestureHandler, true);
    window.removeEventListener("pointerup", mouseGestureHandler, true);
    window.removeEventListener("mouseup", mouseGestureHandler, true);
    window.removeEventListener("click", mouseGestureHandler, true);
    window.removeEventListener("auxclick", mouseGestureHandler, true);
    window.removeEventListener("contextmenu", mouseGestureHandler, true);
    document.removeEventListener("pointerdown", mouseGestureHandler, true);
    document.removeEventListener("mousedown", mouseGestureHandler, true);
    document.removeEventListener("pointerup", mouseGestureHandler, true);
    document.removeEventListener("mouseup", mouseGestureHandler, true);
    document.removeEventListener("click", mouseGestureHandler, true);
    document.removeEventListener("auxclick", mouseGestureHandler, true);
    document.removeEventListener("contextmenu", mouseGestureHandler, true);
    window.removeEventListener("wheel", wheelHandler, true);
    document.removeEventListener("wheel", wheelHandler, true);
    browser.storage.onChanged.removeListener(storageChangedHandler);
    if (isTopFrameContext) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("scroll", scheduleScrollSnapshot, true);
      window.removeEventListener("pagehide", flushScrollSnapshot);
      window.removeEventListener("beforeunload", flushScrollSnapshot);
      browser.runtime.onMessage.removeListener(messageHandler);
    }
    if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
    if (statusTimer) window.clearTimeout(statusTimer);
    document.getElementById(STATUS_ID)?.remove();
    dismissPanel();
  };

  if (isTopFrameContext) {
    void browser.runtime.sendMessage({ type: "TABWHEEL_CONTENT_READY" }).catch(() => {});
  }
}
