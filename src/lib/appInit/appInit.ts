// App init - wires TabWheel wheel cycling, Wheel List gestures, scroll memory, and content messages.

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
  cycleTabWheel,
  fetchTabWheelFaviconData,
  getTabWheelOverviewWithRetry,
  saveTabWheelScrollPosition,
  toggleCurrentTabWheelTag,
  toggleTabWheelCycleScope,
} from "../adapters/runtime/tabWheelApi";
import { openTabWheelHelpOverlay } from "../ui/panels/help/help";

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
const TAGGED_PILL_ID = "tw-tagged-pill";
const TAGGED_FAVICON_ATTR = "data-tabwheel-tagged-favicon";
const TAGGED_FAVICON_RESTORE_ATTR = "data-tabwheel-favicon-restore";
const TAGGED_INDICATOR_DEBOUNCE_MS = 90;
const TAGGED_FAVICON_SIZE_PX = 64;
const TAGGED_FAVICON_LOAD_TIMEOUT_MS = 1200;
const MAX_ORIGINAL_FAVICON_CACHE_ENTRIES = 20;
const STATUS_ID = "tw-status-indicator";
const MOUSE_GESTURE_CLAIM_MS = 900;
type TabWheelEventModifierKey = TabWheelModifierKey | "shift";
type TabWheelMouseGestureAction = "tag" | "scope";
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

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch (_) {
    return false;
  }
}

function cycleScopeLabel(cycleScope: TabWheelCycleScope): string {
  return cycleScope === "tagged" ? "Wheel List" : "General";
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
  let taggedIndicatorRenderTimer = 0;
  let isTaggedIndicatorActive = false;
  let activeTaggedCycleScope: TabWheelCycleScope = settings.cycleScope;
  const originalFaviconHrefByPageUrl = new Map<string, string>();
  let lastTaggedFaviconHref = "";
  let lastTaggedFaviconSourceHref = "";
  let taggedFaviconRenderId = 0;
  let faviconObserver: MutationObserver | null = null;
  let faviconObserverTarget: Node | null = null;
  let claimedMouseGesture: {
    button: number;
    startedAt: number;
  } | null = null;

  void loadTabWheelSettings()
    .then((loadedSettings) => {
      settings = loadedSettings;
      activeTaggedCycleScope = loadedSettings.cycleScope;
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
    const iconLinks = getIconLinks(false);
    for (let index = iconLinks.length - 1; index >= 0; index -= 1) {
      const rawHref = iconLinks[index]?.getAttribute("href");
      if (rawHref) return resolveFaviconHref(rawHref);
    }
    return "";
  }

  function getDefaultFaviconHref(): string {
    try {
      return new URL("/favicon.ico", window.location.origin).href;
    } catch (_) {
      return "";
    }
  }

  function getFaviconCacheKey(): string {
    return window.location.href;
  }

  function cacheOriginalFaviconHref(pageUrl: string, originalHref: string): void {
    if (!pageUrl || !originalHref) return;
    if (originalFaviconHrefByPageUrl.has(pageUrl)) {
      originalFaviconHrefByPageUrl.delete(pageUrl);
    }
    originalFaviconHrefByPageUrl.set(pageUrl, originalHref);
    while (originalFaviconHrefByPageUrl.size > MAX_ORIGINAL_FAVICON_CACHE_ENTRIES) {
      const oldestPageUrl = originalFaviconHrefByPageUrl.keys().next().value;
      if (!oldestPageUrl) break;
      originalFaviconHrefByPageUrl.delete(oldestPageUrl);
    }
  }

  function getCachedOriginalFaviconHref(pageUrl: string): string {
    return originalFaviconHrefByPageUrl.get(pageUrl) || "";
  }

  function removeCachedOriginalFaviconHref(pageUrl: string): void {
    originalFaviconHrefByPageUrl.delete(pageUrl);
  }

  function loadTaggedFaviconImage(originalHref: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const image = new Image();
      let hasSettled = false;
      const timeout = window.setTimeout(() => settle(null), TAGGED_FAVICON_LOAD_TIMEOUT_MS);

      function settle(result: HTMLImageElement | null): void {
        if (hasSettled) return;
        hasSettled = true;
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(result);
      }

      image.onload = () => settle(image);
      image.onerror = () => settle(null);
      if (originalHref.startsWith("http://") || originalHref.startsWith("https://")) {
        image.crossOrigin = "anonymous";
      }
      image.decoding = "async";
      image.src = originalHref;
    });
  }

  async function buildTaggedFaviconHref(originalHref: string): Promise<string | null> {
    if (!originalHref) return null;
    const fetchedFavicon = await fetchTabWheelFaviconData(originalHref).catch(() => null);
    const sourceHref = fetchedFavicon?.ok && fetchedFavicon.dataUrl
      ? fetchedFavicon.dataUrl
      : originalHref;
    const image = await loadTaggedFaviconImage(sourceHref);
    if (!image) return null;

    const canvas = document.createElement("canvas");
    canvas.width = TAGGED_FAVICON_SIZE_PX;
    canvas.height = TAGGED_FAVICON_SIZE_PX;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const sourceWidth = image.naturalWidth || image.width || TAGGED_FAVICON_SIZE_PX;
    const sourceHeight = image.naturalHeight || image.height || TAGGED_FAVICON_SIZE_PX;
    const scale = Math.min(TAGGED_FAVICON_SIZE_PX / sourceWidth, TAGGED_FAVICON_SIZE_PX / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (TAGGED_FAVICON_SIZE_PX - width) / 2;
    const y = (TAGGED_FAVICON_SIZE_PX - height) / 2;

    context.clearRect(0, 0, TAGGED_FAVICON_SIZE_PX, TAGGED_FAVICON_SIZE_PX);
    context.drawImage(image, x, y, width, height);
    context.beginPath();
    context.fillStyle = "rgba(16, 18, 20, 0.88)";
    context.arc(50, 14, 11, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = "#32d74b";
    context.arc(50, 14, 6.25, 0, Math.PI * 2);
    context.fill();

    try {
      return canvas.toDataURL("image/png");
    } catch (_) {
      return null;
    }
  }

  function removeFaviconRestoreLinks(): void {
    document
      .querySelectorAll<HTMLLinkElement>(`link[${TAGGED_FAVICON_RESTORE_ATTR}="true"]`)
      .forEach((link) => link.remove());
  }

  function restoreOriginalFavicon(originalHref: string): void {
    const head = document.head;
    if (!head || !originalHref) return;
    removeFaviconRestoreLinks();
    const link = document.createElement("link");
    link.setAttribute(TAGGED_FAVICON_RESTORE_ATTR, "true");
    link.rel = "icon";
    link.href = originalHref;
    head.appendChild(link);
  }

  function removeTaggedFavicon(): void {
    taggedFaviconRenderId += 1;
    const pageUrl = getFaviconCacheKey();
    const originalHref = getCachedOriginalFaviconHref(pageUrl)
      || lastTaggedFaviconSourceHref
      || getCurrentFaviconHref()
      || getDefaultFaviconHref();
    document
      .querySelectorAll<HTMLLinkElement>(`link[${TAGGED_FAVICON_ATTR}="true"]`)
      .forEach((link) => link.remove());
    removeCachedOriginalFaviconHref(pageUrl);
    lastTaggedFaviconHref = "";
    lastTaggedFaviconSourceHref = "";
    restoreOriginalFavicon(originalHref);
  }

  function ensureTaggedFavicon(): void {
    const head = document.head;
    if (!head) return;
    const pageUrl = getFaviconCacheKey();
    const originalHref = getCurrentFaviconHref() || getDefaultFaviconHref();
    if (!originalHref) return;
    cacheOriginalFaviconHref(pageUrl, originalHref);
    removeFaviconRestoreLinks();
    const existingLink = document.querySelector<HTMLLinkElement>(`link[${TAGGED_FAVICON_ATTR}="true"]`);
    if (existingLink && lastTaggedFaviconSourceHref === originalHref && lastTaggedFaviconHref) {
      if (existingLink.parentElement !== head) head.appendChild(existingLink);
      const iconLinks = getIconLinks(true);
      if (iconLinks[iconLinks.length - 1] !== existingLink) head.appendChild(existingLink);
      return;
    }

    const renderId = ++taggedFaviconRenderId;
    void buildTaggedFaviconHref(originalHref).then((faviconHref) => {
      if (renderId !== taggedFaviconRenderId || !isTaggedIndicatorActive) return;
      if (!faviconHref) {
        removeTaggedFavicon();
        return;
      }

      const nextHead = document.head;
      if (!nextHead) return;
      let link = document.querySelector<HTMLLinkElement>(`link[${TAGGED_FAVICON_ATTR}="true"]`);
      if (!link) {
        link = document.createElement("link");
        link.setAttribute(TAGGED_FAVICON_ATTR, "true");
        link.rel = "icon";
        link.type = "image/png";
        link.setAttribute("sizes", `${TAGGED_FAVICON_SIZE_PX}x${TAGGED_FAVICON_SIZE_PX}`);
      }
      if (lastTaggedFaviconHref !== faviconHref || link.getAttribute("href") !== faviconHref) {
        link.href = faviconHref;
        lastTaggedFaviconHref = faviconHref;
        lastTaggedFaviconSourceHref = originalHref;
      }
      if (link.parentElement !== nextHead) nextHead.appendChild(link);
      const iconLinks = getIconLinks(true);
      if (iconLinks[iconLinks.length - 1] !== link) nextHead.appendChild(link);
    });
  }

  function removeTaggedPill(): void {
    document.getElementById(TAGGED_PILL_ID)?.remove();
  }

  function updateTaggedPillLabel(pill: HTMLElement, cycleScope: TabWheelCycleScope): void {
    const label = pill.querySelector<HTMLElement>(".tw-tagged-label");
    if (label) label.textContent = `In-Wheel List (Cycle Mode: ${cycleScopeLabel(cycleScope)})`;
  }

  function ensureTaggedPill(cycleScope: TabWheelCycleScope): void {
    const existingPill = document.getElementById(TAGGED_PILL_ID);
    if (existingPill) {
      updateTaggedPillLabel(existingPill, cycleScope);
      return;
    }
    const pill = document.createElement("div");
    pill.id = TAGGED_PILL_ID;
    pill.setAttribute("aria-hidden", "true");
    pill.innerHTML = '<span class="tw-tagged-dot"></span><span class="tw-tagged-label"></span>';
    pill.style.cssText = [
      "position:fixed",
      "top:clamp(8px,1.5vh,14px)",
      "left:50vw",
      "transform:translateX(-50%)",
      "z-index:2147483644",
      "min-height:22px",
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "padding:3px 8px",
      "max-width:calc(100vw - 24px)",
      "border-radius:999px",
      "border:1px solid rgba(50,215,75,0.22)",
      "background:rgba(18,18,18,0.18)",
      "backdrop-filter:blur(6px)",
      "color:rgba(255,255,255,0.54)",
      "box-shadow:0 6px 18px rgba(0,0,0,0.12)",
      "font:10px/1.2 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace",
      "font-weight:600",
      "letter-spacing:0",
      "opacity:0.82",
      "pointer-events:none",
      "user-select:none",
    ].join(";");
    const dot = pill.querySelector<HTMLElement>(".tw-tagged-dot");
    if (dot) {
      dot.style.cssText = [
        "width:6px",
        "height:6px",
        "border-radius:999px",
        "background:#32d74b",
        "box-shadow:0 0 0 3px rgba(50,215,75,0.12)",
        "flex:0 0 auto",
      ].join(";");
    }
    updateTaggedPillLabel(pill, cycleScope);
    document.documentElement.appendChild(pill);
  }

  function scheduleTaggedIndicatorRender(): void {
    if (taggedIndicatorRenderTimer) window.clearTimeout(taggedIndicatorRenderTimer);
    taggedIndicatorRenderTimer = window.setTimeout(() => {
      taggedIndicatorRenderTimer = 0;
      applyTaggedIndicators(isTaggedIndicatorActive, activeTaggedCycleScope);
    }, TAGGED_INDICATOR_DEBOUNCE_MS);
  }

  function observeFaviconChanges(): void {
    const target = document.head || document.documentElement;
    if (!target || faviconObserverTarget === target) return;
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

  function applyTaggedIndicators(isTagged: boolean, cycleScope: TabWheelCycleScope = settings.cycleScope): void {
    isTaggedIndicatorActive = isTagged;
    activeTaggedCycleScope = cycleScope;
    if (!isTagged) {
      removeTaggedPill();
      removeTaggedFavicon();
      stopFaviconObserver();
      return;
    }
    ensureTaggedPill(cycleScope);
    observeFaviconChanges();
    ensureTaggedFavicon();
  }

  async function refreshTaggedIndicators(): Promise<void> {
    try {
      const overview = await getTabWheelOverviewWithRetry();
      applyTaggedIndicators(overview.isCurrentTagged, overview.cycleScope);
    } catch (_) {
      applyTaggedIndicators(false);
    }
  }

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
    return areSettingsLoaded
      && event.isTrusted
      && isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)
      && !isGestureBlockedTarget(event.target);
  }

  function resolveMouseGestureAction(event: MouseEvent): TabWheelMouseGestureAction | null {
    if (!areSettingsLoaded) return null;
    if (!event.isTrusted) return null;
    if (!isTabWheelModifier(event, settings.gestureModifier, settings.gestureWithShift)) return null;
    if (isGestureBlockedTarget(event.target)) return null;
    if (event.button === 0) return "tag";
    if (event.button === 2) return "scope";
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
    if (action === "tag") {
      void toggleCurrentTabWheelTag()
        .then((result) => {
          if (!result.ok || typeof result.isCurrentTagged !== "boolean") return;
          applyTaggedIndicators(result.isCurrentTagged, result.cycleScope || settings.cycleScope);
        })
        .catch(() => showStatus("Tag failed"));
      return;
    }
    void toggleTabWheelCycleScope().catch(() => showStatus("Mode switch failed"));
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
      if (event.type === "click" || event.type === "contextmenu" || event.type === "auxclick") {
        claimedMouseGesture = null;
      }
      return;
    }

    const action = resolveMouseGestureAction(event);
    if (!action) return;
    suppressPageEvent(event);

    if (isMouseGestureStartEvent(event) || event.type === "click" || event.type === "contextmenu") {
      claimedMouseGesture = {
        button: event.button,
        startedAt: Date.now(),
      };
      runMouseGestureAction(action);
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
      activeTaggedCycleScope = settings.cycleScope;
      wheelAccumulator = 0;
      wheelBurstCount = 0;
      overshootGuardDirection = null;
      overshootGuardUntil = 0;
      claimedMouseGesture = null;
      if (isTaggedIndicatorActive) applyTaggedIndicators(true, settings.cycleScope);
    }
  }

  function messageHandler(message: unknown): Promise<unknown> | undefined {
    const receivedMessage = message as ContentRuntimeMessage;
    switch (receivedMessage.type) {
      case "TABWHEEL_PING":
        return Promise.resolve({ ok: true });
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
        applyTaggedIndicators(receivedMessage.isTagged, receivedMessage.cycleScope);
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
    if (taggedIndicatorRenderTimer) window.clearTimeout(taggedIndicatorRenderTimer);
    document.getElementById(STATUS_ID)?.remove();
    applyTaggedIndicators(false);
    dismissPanel();
  };

  if (isTopFrameContext) {
    void browser.runtime.sendMessage({ type: "TABWHEEL_CONTENT_READY" }).catch(() => {});
    void refreshTaggedIndicators();
  }
}
