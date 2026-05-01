// Shared TabWheel popup controller for the toolbar popup and in-page menu.

import { escapeHtml, extractDomain } from "../../common/utils/helpers";
import {
  applyTabWheelPreset,
  detectTabWheelPreset,
  formatTabWheelModifierCombo,
  formatTabWheelModifierKey,
  loadTabWheelSettings,
  MAX_WHEEL_COOLDOWN_MS,
  MAX_WHEEL_LIST_TABS,
  MAX_WHEEL_SENSITIVITY,
  MIN_WHEEL_COOLDOWN_MS,
  MIN_WHEEL_SENSITIVITY,
  saveTabWheelSettings,
  TABWHEEL_MODIFIER_KEYS,
  TABWHEEL_PRESETS,
} from "../../common/contracts/tabWheel";
import {
  activateLastRecentTabWheelTab,
  activateTaggedTabWheelTab,
  clearTaggedTabWheelTabs,
  closeCurrentTabWheelTabAndActivateLastRecent,
  cycleTabWheel,
  getTabWheelOverviewWithRetry,
  openNewTabNextToCurrentTabWheel,
  openTabWheelHelp,
  openTabWheelOptions,
  refreshCurrentTabWheel,
  removeTaggedTabWheelTab,
  setTabWheelCycleScope,
  toggleCurrentTabWheelTag,
} from "../../adapters/runtime/tabWheelApi";
import {
  createPanelHost,
  dismissPanel,
  registerPanelCleanup,
  removePanelHost,
} from "../../common/utils/panelHost";
import popupStyles from "../../../entryPoints/toolbarPopup/toolbarPopup.css";

type PopupRoot = Document | ShadowRoot | HTMLElement;

export interface TabWheelPopupMountOptions {
  onClose?: () => void;
  announceUnavailable?: boolean;
  surface?: "toolbar" | "pagePanel";
}

const UNAVAILABLE_GESTURES_MESSAGE = "Page gestures unavailable here; popup buttons still work.";

const TABWHEEL_POPUP_HTML = `
  <div class="tabwheel-popup">
    <div class="titlebar">
      <div class="traffic-lights">
        <span class="dot dot-close"></span>
        <span class="dot dot-minimize"></span>
        <span class="dot dot-maximize"></span>
      </div>
      <span class="titlebar-text" id="titlebarText">TabWheel</span>
      <button class="titlebar-button" id="refreshTabWheelBtn" type="button" title="Refresh TabWheel on this tab">Refresh</button>
    </div>

    <div class="shortcut-panel">
      <strong id="shortcutLabel">Alt + Wheel</strong>
      <span id="shortcutStatus">Hold the modifier and scroll to switch tabs.</span>
    </div>

    <main class="popup-scroll">
      <section class="cycle-mode-panel" aria-label="Cycle mode">
        <div class="mode-heading">
          <span>Current Cycle Mode</span>
          <strong id="scopeLabel">General</strong>
        </div>
        <div class="mode-pill" role="group" aria-label="Change cycle mode">
          <button id="generalModeBtn" data-cycle-scope="general" type="button">General</button>
          <button id="wheelListModeBtn" data-cycle-scope="tagged" type="button">Wheel List</button>
        </div>
      </section>

      <div class="cycle-row" aria-label="Tab cycle fallback controls">
        <button id="prevTabBtn" type="button">Previous tab</button>
        <button id="nextTabBtn" type="button">Next tab</button>
      </div>

      <div class="quick-tab-row" aria-label="Tab action fallback controls">
        <button id="newTabBtn" type="button">New tab</button>
        <button id="lastRecentTabBtn" type="button">Last recent</button>
        <button id="closeCurrentTabBtn" type="button">Close current</button>
      </div>

      <section class="list-section" id="wheelListSection" aria-label="Wheel List tabs">
        <div class="list-header">
          <button class="list-toggle" id="wheelListToggle" type="button" aria-expanded="false" aria-controls="taggedTabsList">
            <span>
              <strong>Wheel List</strong>
              <small id="tagCountLabel">0/15 tagged tabs</small>
            </span>
            <span class="summary-toggle-label">
              <span class="summary-toggle-text"></span>
              <span class="summary-toggle-arrow" aria-hidden="true"></span>
            </span>
          </button>
          <span class="summary-actions">
            <button id="tagCurrentBtn" type="button">Tag current</button>
            <button id="clearTagsBtn" type="button">Remove all</button>
          </span>
        </div>
        <div class="tagged-list" id="taggedTabsList"></div>
      </section>

      <section class="control-grid" aria-label="TabWheel controls">
        <label class="control-row" title="Apply a preset for sensitivity, cooldown, acceleration, and overshoot guard.">
          <span><strong>Preset</strong><small>Choose deliberate, balanced, or fast switching</small></span>
          <select id="wheelPreset"></select>
        </label>
        <label class="control-row" title="Base key for cycling and gestures.">
          <span><strong>Modifier</strong><small>Hold this key while scrolling, holding, or middle-clicking</small></span>
          <select id="gestureModifier"></select>
        </label>
        <label class="control-row" title="Add Shift to the selected modifier before gestures are active.">
          <span><strong>Require Shift</strong><small>Add a second key for safer gestures</small></span>
          <input id="gestureWithShift" type="checkbox" />
        </label>
        <label class="control-row" title="Swap wheel down/right and up/left.">
          <span><strong>Invert wheel</strong><small>Swap next and previous direction</small></span>
          <input id="invertScroll" type="checkbox" />
        </label>
        <label class="control-row" title="Keep pinned utility tabs out of the cycling path.">
          <span><strong>Skip pinned</strong><small>Leave pinned tabs out of cycling</small></span>
          <input id="skipPinnedTabs" type="checkbox" />
        </label>
        <label class="control-row" title="Shortens the cooldown during repeated wheel bursts.">
          <span><strong>Acceleration</strong><small>Speed up intentional wheel bursts</small></span>
          <input id="wheelAcceleration" type="checkbox" />
        </label>
        <label class="control-row" title="Allow horizontal wheel or trackpad motion to switch tabs.">
          <span><strong>Horizontal wheel</strong><small>Use sideways wheel or trackpad motion</small></span>
          <input id="horizontalWheel" type="checkbox" />
        </label>
        <label class="control-row" title="Prevent extra tab jumps from trackpad or wheel momentum.">
          <span><strong>Safe overshoot guard</strong><small>Prevent extra tab jumps from trackpad or wheel momentum</small></span>
          <input id="overshootGuard" type="checkbox" />
        </label>
        <label class="control-row" title="Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs">
          <span><strong>Editable fields</strong><small>Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs</small></span>
          <input id="allowGesturesInEditableFields" type="checkbox" />
        </label>
        <label class="control-row range-row" title="Higher values need less wheel movement before switching tabs.">
          <span><strong>Sensitivity</strong><small id="wheelSensitivityValue">Wheel distance: 1.0x</small></span>
          <input id="wheelSensitivity" type="range" step="0.1" />
        </label>
        <label class="control-row range-row" title="Minimum time between tab switches; lower feels faster but can overshoot.">
          <span><strong>Cooldown</strong><small id="wheelCooldownValue">Switch delay: 160ms</small></span>
          <input id="wheelCooldownMs" type="range" step="10" />
        </label>
      </section>
    </main>

    <div class="action-row">
      <button id="helpBtn">Help</button>
      <button id="settingsBtn">Settings</button>
    </div>

    <div class="popup-toast" id="popupToast" role="status" aria-live="polite" aria-atomic="true"></div>
  </div>
`;

const TABWHEEL_PAGE_PANEL_HTML = `
  <div class="tabwheel-popup tabwheel-command-panel">
    <header class="command-header">
      <strong class="command-title" id="titlebarText">Command Panel</strong>
      <div class="command-header-actions">
        <button id="refreshTabWheelBtn" type="button" title="Refresh TabWheel on this tab">Refresh</button>
        <button id="helpBtn" type="button">Help</button>
        <button id="settingsBtn" type="button">Settings</button>
        <button class="command-close-button" id="closePanelBtn" type="button" title="Close panel">Close</button>
      </div>
    </header>

    <main class="popup-scroll">
      <section class="command-status-grid" aria-label="Current TabWheel status">
        <div class="command-status-card">
          <span>Gesture</span>
          <strong id="shortcutLabel">Alt + Wheel</strong>
          <small id="shortcutStatus">Hold the modifier and scroll to switch tabs.</small>
        </div>
        <div class="command-status-card command-mode-card">
          <span>Cycle Mode</span>
          <div class="mode-pill command-status-mode-pill" role="group" aria-label="Change cycle mode">
            <button id="generalModeBtn" data-cycle-scope="general" type="button">General</button>
            <button id="wheelListModeBtn" data-cycle-scope="tagged" type="button">Wheel List</button>
          </div>
        </div>
        <div class="command-status-card command-wheel-list-status-card">
          <span>Wheel List</span>
          <strong id="tagCountLabel">0/15 tagged tabs</strong>
        </div>
      </section>

      <section class="command-section" aria-label="Switch tabs">
        <div class="command-section-heading">
          <strong>Switch Tabs</strong>
        </div>
        <div class="cycle-row command-nav-row" aria-label="Tab cycle fallback controls">
          <button id="prevTabBtn" type="button">Previous tab</button>
          <button id="nextTabBtn" type="button">Next tab</button>
          <button id="lastRecentTabBtn" type="button">Last recent</button>
        </div>
      </section>

      <section class="command-section" aria-label="Tab actions">
        <div class="command-section-heading">
          <strong>Tab Actions</strong>
        </div>
        <div class="quick-tab-row command-tab-row" aria-label="Tab action fallback controls">
          <button class="danger-action" id="closeCurrentTabBtn" type="button">Close current</button>
          <button id="newTabBtn" type="button">New tab</button>
        </div>
      </section>

      <section class="list-section command-list-section" id="wheelListSection" aria-label="Wheel List tabs">
        <div class="list-header command-list-header">
          <div class="command-list-copy">
            <strong>Wheel List</strong>
            <small>Short tab set for focused cycling</small>
          </div>
          <span class="summary-actions command-list-actions">
            <button id="tagCurrentBtn" type="button">Tag current</button>
            <button id="clearTagsBtn" type="button">Clear list</button>
          </span>
          <button class="list-toggle command-list-toggle" id="wheelListToggle" type="button" aria-expanded="false" aria-controls="taggedTabsList">
            <span class="summary-toggle-label">
              <span class="summary-toggle-text"></span>
            </span>
          </button>
        </div>
        <div class="tagged-list" id="taggedTabsList"></div>
      </section>

      <section class="control-grid command-control-grid" aria-label="TabWheel controls">
        <label class="control-row" title="Apply a preset for sensitivity, cooldown, acceleration, and overshoot guard.">
          <span><strong>Preset</strong><small>Choose deliberate, balanced, or fast switching</small></span>
          <select id="wheelPreset"></select>
        </label>
        <label class="control-row" title="Base key for cycling and gestures.">
          <span><strong>Modifier</strong><small>Hold this key while scrolling, holding, or middle-clicking</small></span>
          <select id="gestureModifier"></select>
        </label>
        <label class="control-row" title="Add Shift to the selected modifier before gestures are active.">
          <span><strong>Require Shift</strong><small>Add a second key for safer gestures</small></span>
          <input id="gestureWithShift" type="checkbox" />
        </label>
        <label class="control-row" title="Swap wheel down/right and up/left.">
          <span><strong>Invert wheel</strong><small>Swap next and previous direction</small></span>
          <input id="invertScroll" type="checkbox" />
        </label>
        <label class="control-row" title="Keep pinned utility tabs out of the cycling path.">
          <span><strong>Skip pinned</strong><small>Leave pinned tabs out of cycling</small></span>
          <input id="skipPinnedTabs" type="checkbox" />
        </label>
        <label class="control-row" title="Shortens the cooldown during repeated wheel bursts.">
          <span><strong>Acceleration</strong><small>Speed up intentional wheel bursts</small></span>
          <input id="wheelAcceleration" type="checkbox" />
        </label>
        <label class="control-row" title="Allow horizontal wheel or trackpad motion to switch tabs.">
          <span><strong>Horizontal wheel</strong><small>Use sideways wheel or trackpad motion</small></span>
          <input id="horizontalWheel" type="checkbox" />
        </label>
        <label class="control-row" title="Prevent extra tab jumps from trackpad or wheel momentum.">
          <span><strong>Safe overshoot guard</strong><small>Prevent extra tab jumps from trackpad or wheel momentum</small></span>
          <input id="overshootGuard" type="checkbox" />
        </label>
        <label class="control-row" title="Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs">
          <span><strong>Editable fields</strong><small>Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs</small></span>
          <input id="allowGesturesInEditableFields" type="checkbox" />
        </label>
        <label class="control-row range-row" title="Higher values need less wheel movement before switching tabs.">
          <span><strong>Sensitivity</strong><small id="wheelSensitivityValue">Wheel distance: 1.0x</small></span>
          <input id="wheelSensitivity" type="range" step="0.1" />
        </label>
        <label class="control-row range-row" title="Minimum time between tab switches; lower feels faster but can overshoot.">
          <span><strong>Cooldown</strong><small id="wheelCooldownValue">Switch delay: 160ms</small></span>
          <input id="wheelCooldownMs" type="range" step="10" />
        </label>
      </section>
    </main>

    <div class="popup-toast" id="popupToast" role="status" aria-live="polite" aria-atomic="true"></div>
  </div>
`;

function presetLabel(preset: TabWheelPreset): string {
  if (preset === "precise") return "Precise";
  if (preset === "fast") return "Fast";
  if (preset === "custom") return "Custom";
  return "Balanced";
}

function cycleScopeLabel(scope: TabWheelCycleScope): string {
  return scope === "tagged" ? "Wheel List" : "General";
}

function setSelectOptions(select: HTMLSelectElement, values: readonly string[], selected: string, label: (value: string) => string): void {
  select.innerHTML = values
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label(value)}</option>`)
    .join("");
}

function getElement<T extends HTMLElement>(root: PopupRoot, id: string): T {
  const element = root instanceof Document
    ? root.getElementById(id)
    : root.querySelector(`#${id}`);
  if (!element) throw new Error(`Missing TabWheel popup element: ${id}`);
  return element as T;
}

function getOptionalElement<T extends HTMLElement>(root: PopupRoot, id: string): T | null {
  const element = root instanceof Document
    ? root.getElementById(id)
    : root.querySelector(`#${id}`);
  return element as T | null;
}

function ensurePopupMarkup(root: PopupRoot, surface: TabWheelPopupMountOptions["surface"]): void {
  if (root instanceof Document) return;
  if (!root.querySelector(".tabwheel-popup")) {
    root.innerHTML = surface === "pagePanel" ? TABWHEEL_PAGE_PANEL_HTML : TABWHEEL_POPUP_HTML;
  }
}

export function mountTabWheelPopup(
  root: PopupRoot,
  options: TabWheelPopupMountOptions = {},
): () => void {
  const surface = options.surface || "toolbar";
  ensurePopupMarkup(root, surface);

  const cleanupFns: Array<() => void> = [];
  const shortcutEl = getElement(root, "shortcutLabel");
  const shortcutStatusEl = getElement(root, "shortcutStatus");
  const toastEl = getElement(root, "popupToast");
  const titlebarTextEl = getElement(root, "titlebarText");
  const refreshTabWheelBtn = getElement<HTMLButtonElement>(root, "refreshTabWheelBtn");
  const scopeLabel = getOptionalElement(root, "scopeLabel");
  const tagCountLabel = getElement(root, "tagCountLabel");
  const tagCurrentBtn = getElement<HTMLButtonElement>(root, "tagCurrentBtn");
  const generalModeBtn = getElement<HTMLButtonElement>(root, "generalModeBtn");
  const wheelListModeBtn = getElement<HTMLButtonElement>(root, "wheelListModeBtn");
  const prevTabBtn = getElement<HTMLButtonElement>(root, "prevTabBtn");
  const nextTabBtn = getElement<HTMLButtonElement>(root, "nextTabBtn");
  const newTabBtn = getElement<HTMLButtonElement>(root, "newTabBtn");
  const lastRecentTabBtn = getElement<HTMLButtonElement>(root, "lastRecentTabBtn");
  const closeCurrentTabBtn = getElement<HTMLButtonElement>(root, "closeCurrentTabBtn");
  const wheelListSection = getElement(root, "wheelListSection");
  const wheelListToggle = getElement<HTMLButtonElement>(root, "wheelListToggle");
  const clearTagsBtn = getElement<HTMLButtonElement>(root, "clearTagsBtn");
  const taggedTabsList = getElement(root, "taggedTabsList");
  const wheelPresetSelect = getElement<HTMLSelectElement>(root, "wheelPreset");
  const gestureModifierSelect = getElement<HTMLSelectElement>(root, "gestureModifier");
  const gestureWithShiftInput = getElement<HTMLInputElement>(root, "gestureWithShift");
  const invertScrollInput = getElement<HTMLInputElement>(root, "invertScroll");
  const skipPinnedTabsInput = getElement<HTMLInputElement>(root, "skipPinnedTabs");
  const wheelAccelerationInput = getElement<HTMLInputElement>(root, "wheelAcceleration");
  const horizontalWheelInput = getElement<HTMLInputElement>(root, "horizontalWheel");
  const overshootGuardInput = getElement<HTMLInputElement>(root, "overshootGuard");
  const allowEditableInput = getElement<HTMLInputElement>(root, "allowGesturesInEditableFields");
  const wheelSensitivityInput = getElement<HTMLInputElement>(root, "wheelSensitivity");
  const wheelSensitivityValue = getElement(root, "wheelSensitivityValue");
  const wheelCooldownInput = getElement<HTMLInputElement>(root, "wheelCooldownMs");
  const wheelCooldownValue = getElement(root, "wheelCooldownValue");
  const helpBtn = getElement<HTMLButtonElement>(root, "helpBtn");
  const settingsBtn = getElement<HTMLButtonElement>(root, "settingsBtn");
  const closePanelBtn = getOptionalElement<HTMLButtonElement>(root, "closePanelBtn");

  let settings: TabWheelSettings | null = null;
  let overview: TabWheelOverview | null = null;
  let statusTimer = 0;
  let statusHiddenCallback: (() => void) | null = null;
  let isConfirmingClear = false;
  let isWheelListOpen = false;

  function on<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    element.addEventListener(type, listener as EventListener);
    cleanupFns.push(() => element.removeEventListener(type, listener as EventListener));
  }

  function closePopup(): void {
    options.onClose?.();
  }

  function clearStatusTimer(): void {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = 0;
  }

  function runStatusHiddenCallback(): void {
    const callback = statusHiddenCallback;
    statusHiddenCallback = null;
    callback?.();
  }

  function hideStatus(runHiddenCallback = true): void {
    clearStatusTimer();
    toastEl.classList.remove("is-visible");
    toastEl.textContent = "";
    if (runHiddenCallback) runStatusHiddenCallback();
    else statusHiddenCallback = null;
  }

  function showStatus(message: string, sticky = false, onHidden?: () => void): void {
    clearStatusTimer();
    runStatusHiddenCallback();
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    statusHiddenCallback = onHidden || null;
    if (sticky) {
      statusHiddenCallback = null;
      return;
    }
    statusTimer = window.setTimeout(() => {
      hideStatus();
    }, 1800);
  }

  async function refreshOverview(): Promise<void> {
    overview = await getTabWheelOverviewWithRetry().catch(() => null);
  }

  function requireSettings(): TabWheelSettings {
    if (!settings) throw new Error("TabWheel popup settings are not loaded.");
    return settings;
  }

  function renderTaggedList(): void {
    const activeSettings = requireSettings();
    const taggedTabs = overview?.taggedTabs || [];
    if (taggedTabs.length === 0) {
      taggedTabsList.innerHTML = `
        <div class="tagged-empty">
          <strong>No Wheel List tabs</strong>
          <span>Add tabs here to create a short wheel-cycling list. ${escapeHtml(formatTabWheelModifierCombo(activeSettings.gestureModifier, activeSettings.gestureWithShift))} + left hold also adds the current tab.</span>
        </div>
      `;
      clearTagsBtn.disabled = true;
      return;
    }

    clearTagsBtn.disabled = false;
    taggedTabsList.innerHTML = taggedTabs.map((entry) => {
      const isActive = overview?.activeTabId === entry.tabId;
      return `
        <div class="tagged-row${isActive ? " is-active" : ""}">
          <button class="tagged-main" data-action="activate" data-tab-id="${entry.tabId}" type="button">
            <span class="tagged-title">${escapeHtml(entry.title || "Untitled")}</span>
            <span class="tagged-url">${escapeHtml(extractDomain(entry.url) || entry.url || "Restricted page")}</span>
          </button>
          <span class="tagged-actions">
            <button data-action="remove" data-tab-id="${entry.tabId}" type="button">Remove</button>
          </span>
        </div>
      `;
    }).join("");

    taggedTabsList.querySelectorAll<HTMLButtonElement>('[data-action="activate"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const tabId = Number(button.dataset.tabId);
        const result = await activateTaggedTabWheelTab(tabId);
        if (!result.ok) {
          showStatus(result.reason || "Unable to activate tab");
          return;
        }
        closePopup();
      });
    });
    taggedTabsList.querySelectorAll<HTMLButtonElement>('[data-action="remove"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const tabId = Number(button.dataset.tabId);
        const result = await removeTaggedTabWheelTab(tabId);
        if (!result.ok) {
          showStatus(result.reason || "Remove failed");
          return;
        }
        await refreshAll();
        showStatus("Removed from Wheel List");
      });
    });
  }

  function renderWheelListDisclosure(): void {
    wheelListSection.classList.toggle("is-open", isWheelListOpen);
    wheelListToggle.setAttribute("aria-expanded", String(isWheelListOpen));
  }

  function renderModeButtons(cycleScope: TabWheelCycleScope): void {
    for (const button of [generalModeBtn, wheelListModeBtn]) {
      const isActive = button.dataset.cycleScope === cycleScope;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function renderState(): void {
    const activeSettings = requireSettings();
    const gesture = formatTabWheelModifierCombo(activeSettings.gestureModifier, activeSettings.gestureWithShift);
    const cycleScope = overview?.cycleScope || activeSettings.cycleScope;
    shortcutEl.textContent = `${gesture} + Wheel`;
    titlebarTextEl.textContent = surface === "pagePanel"
      ? "Command Panel"
      : overview
      ? `TabWheel (${Math.max(1, overview.activeIndex + 1)}/${overview.tabCount})`
      : "TabWheel";
    if (scopeLabel) scopeLabel.textContent = cycleScopeLabel(cycleScope);
    tagCountLabel.textContent = `${overview?.taggedCount || 0}/${MAX_WHEEL_LIST_TABS} tagged tabs`;
    tagCurrentBtn.textContent = overview?.isCurrentTagged ? "Remove current" : "Add current";
    clearTagsBtn.textContent = surface === "pagePanel" ? "Clear list" : "Remove all";
    renderModeButtons(cycleScope);
    shortcutStatusEl.textContent = overview?.contentScriptStatus === "ready"
      ? "Wheel switches tabs. Left/right hold opens choice wheels. Middle click opens the command panel."
      : "Use popup buttons when page shortcuts are unavailable";
    if (overview?.contentScriptStatus === "unavailable") {
      if (options.announceUnavailable) showStatus(UNAVAILABLE_GESTURES_MESSAGE, true);
    } else if (toastEl.textContent === UNAVAILABLE_GESTURES_MESSAGE) {
      hideStatus();
    }
    renderWheelListDisclosure();
    renderTaggedList();
  }

  function renderSettings(): void {
    const activeSettings = requireSettings();
    setSelectOptions(
      wheelPresetSelect,
      TABWHEEL_PRESETS,
      activeSettings.wheelPreset,
      (value) => presetLabel(value as TabWheelPreset),
    );
    setSelectOptions(
      gestureModifierSelect,
      TABWHEEL_MODIFIER_KEYS,
      activeSettings.gestureModifier,
      (value) => formatTabWheelModifierKey(value as TabWheelModifierKey),
    );
    gestureWithShiftInput.checked = activeSettings.gestureWithShift;
    invertScrollInput.checked = activeSettings.invertScroll;
    skipPinnedTabsInput.checked = activeSettings.skipPinnedTabs;
    wheelAccelerationInput.checked = activeSettings.wheelAcceleration;
    horizontalWheelInput.checked = activeSettings.horizontalWheel;
    overshootGuardInput.checked = activeSettings.overshootGuard;
    allowEditableInput.checked = activeSettings.allowGesturesInEditableFields;
    wheelSensitivityInput.min = String(MIN_WHEEL_SENSITIVITY);
    wheelSensitivityInput.max = String(MAX_WHEEL_SENSITIVITY);
    wheelSensitivityInput.value = String(activeSettings.wheelSensitivity);
    wheelSensitivityValue.textContent = `Wheel distance: ${activeSettings.wheelSensitivity.toFixed(1)}x`;
    wheelCooldownInput.min = String(MIN_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.max = String(MAX_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.value = String(activeSettings.wheelCooldownMs);
    wheelCooldownValue.textContent = `Switch delay: ${Math.round(activeSettings.wheelCooldownMs)}ms`;
  }

  async function refreshAll(): Promise<void> {
    settings = await loadTabWheelSettings();
    await refreshOverview();
    renderSettings();
    renderState();
  }

  async function persist(nextSettings: TabWheelSettings): Promise<void> {
    settings = nextSettings;
    await saveTabWheelSettings(settings);
    await refreshAll();
    showStatus("Saved");
  }

  async function runPopupCycle(direction: "prev" | "next"): Promise<void> {
    const result = await cycleTabWheel(direction).catch(() => ({
      ok: false,
      reason: "Unable to switch tabs",
    }));
    await refreshAll();
    if (!result.ok) {
      showStatus(result.reason || "Unable to switch tabs");
      return;
    }
    closePopup();
  }

  async function runTabAction(action: () => Promise<TabWheelActionResult>, fallbackReason: string): Promise<void> {
    const result = await action().catch(() => ({
      ok: false,
      reason: fallbackReason,
    }));
    if (!result.ok) {
      await refreshAll();
      showStatus(result.reason || fallbackReason);
      return;
    }
    closePopup();
  }

  async function setPopupCycleScope(cycleScope: TabWheelCycleScope): Promise<void> {
    const result: TabWheelActionResult = await setTabWheelCycleScope(cycleScope, undefined, {
      suppressPageStatus: true,
    }).catch(() => ({
      ok: false,
      reason: "Mode switch failed",
    }));
    await refreshAll();
    showStatus(result.ok ? `Mode: ${cycleScopeLabel(result.cycleScope || cycleScope)}` : result.reason || "Mode switch failed");
  }

  async function refreshCurrentTabWheelState(): Promise<void> {
    refreshTabWheelBtn.disabled = true;
    try {
      if (surface === "pagePanel") {
        window.__tabWheelPreservePanelOnNextCleanup = true;
      }
      const result = await refreshCurrentTabWheel();
      settings = await loadTabWheelSettings();
      overview = result.overview || await getTabWheelOverviewWithRetry().catch(() => null);
      renderSettings();
      renderState();
      showStatus(result.ok ? "TabWheel refreshed" : result.reason || "TabWheel cannot run on this page.");
    } catch (_) {
      await refreshAll();
      showStatus("TabWheel refresh failed");
    } finally {
      if (surface === "pagePanel") {
        window.__tabWheelPreservePanelOnNextCleanup = false;
      }
      refreshTabWheelBtn.disabled = false;
    }
  }

  function readSettings(): TabWheelSettings {
    const activeSettings = requireSettings();
    const nextSettings: TabWheelSettings = {
      ...activeSettings,
      wheelPreset: wheelPresetSelect.value as TabWheelPreset,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      invertScroll: invertScrollInput.checked,
      skipPinnedTabs: skipPinnedTabsInput.checked,
      wheelAcceleration: wheelAccelerationInput.checked,
      horizontalWheel: horizontalWheelInput.checked,
      overshootGuard: overshootGuardInput.checked,
      allowGesturesInEditableFields: allowEditableInput.checked,
      wheelSensitivity: Number(wheelSensitivityInput.value),
      wheelCooldownMs: Number(wheelCooldownInput.value),
    };
    return {
      ...nextSettings,
      wheelPreset: detectTabWheelPreset(nextSettings),
    };
  }

  [
    gestureModifierSelect,
    gestureWithShiftInput,
    invertScrollInput,
    skipPinnedTabsInput,
    wheelAccelerationInput,
    horizontalWheelInput,
    overshootGuardInput,
    allowEditableInput,
    wheelSensitivityInput,
    wheelCooldownInput,
  ].forEach((control) => {
    on(control, "change", () => void persist(readSettings()));
  });

  on(wheelPresetSelect, "change", () => {
    void persist(applyTabWheelPreset(readSettings(), wheelPresetSelect.value as TabWheelPreset));
  });
  on(wheelSensitivityInput, "input", () => {
    wheelSensitivityValue.textContent = `Wheel distance: ${Number(wheelSensitivityInput.value).toFixed(1)}x`;
    wheelPresetSelect.value = "custom";
  });
  on(wheelCooldownInput, "input", () => {
    wheelCooldownValue.textContent = `Switch delay: ${Math.round(Number(wheelCooldownInput.value))}ms`;
    wheelPresetSelect.value = "custom";
  });

  on(tagCurrentBtn, "click", async () => {
    const result = await toggleCurrentTabWheelTag();
    await refreshAll();
    showStatus(result.ok ? "Wheel List updated" : result.reason || "Could not update Wheel List");
  });

  on(wheelListToggle, "click", () => {
    isWheelListOpen = !isWheelListOpen;
    renderWheelListDisclosure();
  });

  on(generalModeBtn, "click", () => {
    void setPopupCycleScope("general");
  });
  on(wheelListModeBtn, "click", () => {
    void setPopupCycleScope("tagged");
  });

  on(prevTabBtn, "click", () => {
    void runPopupCycle("prev");
  });
  on(nextTabBtn, "click", () => {
    void runPopupCycle("next");
  });
  on(newTabBtn, "click", () => {
    void runTabAction(openNewTabNextToCurrentTabWheel, "Unable to open tab");
  });
  on(lastRecentTabBtn, "click", () => {
    void runTabAction(activateLastRecentTabWheelTab, "No recent tab");
  });
  on(closeCurrentTabBtn, "click", () => {
    void runTabAction(closeCurrentTabWheelTabAndActivateLastRecent, "Unable to close tab");
  });

  on(refreshTabWheelBtn, "click", () => {
    void refreshCurrentTabWheelState();
  });

  on(clearTagsBtn, "click", async () => {
    if (!isConfirmingClear) {
      isConfirmingClear = true;
      showStatus(`Click ${surface === "pagePanel" ? "Clear list" : "Remove all"} again to empty the Wheel List`, false, () => {
        isConfirmingClear = false;
      });
      return;
    }
    isConfirmingClear = false;
    const result = await clearTaggedTabWheelTabs();
    await refreshAll();
    showStatus(result.ok ? "Wheel List emptied" : result.reason || "Could not empty Wheel List");
  });

  on(helpBtn, "click", async () => {
    const result = await openTabWheelHelp();
    if (!result.ok) {
      showStatus(result.reason || "Help unavailable on this page");
      return;
    }
    closePopup();
  });

  on(settingsBtn, "click", async () => {
    const result = await openTabWheelOptions();
    if (!result.ok) {
      showStatus(result.reason || "Settings unavailable");
      return;
    }
    closePopup();
  });

  if (closePanelBtn) {
    on(closePanelBtn, "click", closePopup);
  }

  void refreshAll().then(() => {
    if (options.announceUnavailable && overview?.contentScriptStatus === "unavailable") {
      showStatus(UNAVAILABLE_GESTURES_MESSAGE, true);
    }
  });

  return () => {
    clearStatusTimer();
    runStatusHiddenCallback();
    cleanupFns.splice(0).forEach((cleanup) => cleanup());
  };
}

export function openTabWheelPopupOverlay(): void {
  try {
    const { host, shadow } = createPanelHost();

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; font-family: 'SF Mono','JetBrains Mono','Fira Code','Consolas',monospace; }
      .tw-popup-overlay-backdrop {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        width: 100dvw;
        height: 100dvh;
        background: rgba(0,0,0,0.42);
      }
      .tw-popup-overlay-shell {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: calc(100vw - 24px);
        max-width: calc(100dvw - 24px);
        max-height: calc(100vh - 24px);
        max-height: calc(100dvh - 24px);
        overflow: hidden;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
      }
      .tw-popup-overlay-shell .tabwheel-popup {
        max-width: calc(100vw - 24px);
        max-width: calc(100dvw - 24px);
        max-height: calc(100vh - 24px);
        max-height: calc(100dvh - 24px);
      }
      ${popupStyles}
    `;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "tw-popup-overlay-backdrop";
    shadow.appendChild(backdrop);

    const shell = document.createElement("div");
    shell.className = "tw-popup-overlay-shell";
    shadow.appendChild(shell);

    let cleanupPopup: (() => void) | null = null;
    function close(): void {
      document.removeEventListener("keydown", keyHandler, true);
      cleanupPopup?.();
      cleanupPopup = null;
      removePanelHost();
    }

    function keyHandler(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    backdrop.addEventListener("click", close);
    backdrop.addEventListener("mousedown", (event) => event.preventDefault());
    document.addEventListener("keydown", keyHandler, true);
    cleanupPopup = mountTabWheelPopup(shell, {
      onClose: close,
      surface: "pagePanel",
    });
    registerPanelCleanup(close);
    host.focus();
  } catch (error) {
    console.error("[TabWheel] Failed to open popup overlay:", error);
    dismissPanel();
  }
}
