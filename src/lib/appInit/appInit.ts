// App init - wires TabWheel wheel cycling, quick controls, scroll memory, and content messages.

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
import { normalizeWheelDeltaY, resolveWheelDirection } from "../core/tabWheel/tabWheelCore";
import {
  cycleTabWheel,
  saveTabWheelScrollPosition,
} from "../adapters/runtime/tabWheelApi";
import { openTabWheelHelpOverlay } from "../ui/panels/help/help";
import { openQuickControlsPanel } from "../ui/panels/quickControls/quickControls";

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
type TabWheelEventModifierKey = TabWheelModifierKey | "shift";
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

export function initApp(): void {
  if (window.__tabWheelCleanup) {
    window.__tabWheelCleanup();
  }

  let settings: TabWheelSettings = { ...DEFAULT_TABWHEEL_SETTINGS };
  let scrollSaveTimer = 0;
  let lastScrollSaveX = Number.NaN;
  let lastScrollSaveY = Number.NaN;
  let suppressScrollSaveUntil = 0;
  let scrollRestoreToken = 0;
  let wheelAccumulator = 0;
  let lastWheelCycleAt = 0;
  let wheelBurstCount = 0;

  void loadTabWheelSettings().then((loadedSettings) => {
    settings = loadedSettings;
  });

  function sendScrollSnapshot(): void {
    if (Date.now() < suppressScrollSaveUntil) return;
    const scrollX = Math.max(0, window.scrollX);
    const scrollY = Math.max(0, window.scrollY);
    if (scrollX === lastScrollSaveX && scrollY === lastScrollSaveY) return;
    lastScrollSaveX = scrollX;
    lastScrollSaveY = scrollY;
    void saveTabWheelScrollPosition(scrollX, scrollY).catch(() => {});
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

  function isGestureBlockedTarget(target: EventTarget | null): boolean {
    return !settings.allowGesturesInEditableFields && isEditableTarget(target);
  }

  function isKeyboardWheelEvent(event: WheelEvent): boolean {
    return event.isTrusted
      && isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      && !isGestureBlockedTarget(event.target);
  }

  function isQuickMenuClickEvent(event: MouseEvent): boolean {
    return event.isTrusted
      && event.button === 0
      && isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      && !isGestureBlockedTarget(event.target);
  }

  function getTabCycleWheelDelta(event: WheelEvent): number {
    if (event.deltaY !== 0) return normalizeWheelDeltaY(event, window.innerHeight);
    return event.deltaX;
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
    const effectiveCooldown = getEffectiveCooldown(now);
    if (now - lastWheelCycleAt < effectiveCooldown) return;
    wheelBurstCount = now - lastWheelCycleAt <= WHEEL_ACCELERATION_WINDOW_MS
      ? Math.min(wheelBurstCount + 1, 6)
      : 0;
    lastWheelCycleAt = now;
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

  function clickHandler(event: MouseEvent): void {
    if (!isQuickMenuClickEvent(event)) return;
    suppressPageEvent(event);
    void openQuickControlsPanel();
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

  window.addEventListener("click", clickHandler, true);
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
  window.addEventListener("scroll", scheduleScrollSnapshot, { passive: true, capture: true });
  window.addEventListener("pagehide", flushScrollSnapshot);
  window.addEventListener("beforeunload", flushScrollSnapshot);
  browser.storage.onChanged.addListener(storageChangedHandler);
  browser.runtime.onMessage.addListener(messageHandler);

  window.__tabWheelCleanup = () => {
    window.removeEventListener("click", clickHandler, true);
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.removeEventListener("wheel", wheelHandler, true);
    window.removeEventListener("scroll", scheduleScrollSnapshot, true);
    window.removeEventListener("pagehide", flushScrollSnapshot);
    window.removeEventListener("beforeunload", flushScrollSnapshot);
    browser.storage.onChanged.removeListener(storageChangedHandler);
    browser.runtime.onMessage.removeListener(messageHandler);
    if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
    dismissPanel();
  };
}
