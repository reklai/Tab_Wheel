// Browser-action popup for TabWheel Wheel List controls.

import browser from "webextension-polyfill";
import { escapeHtml, extractDomain } from "../../lib/common/utils/helpers";
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
} from "../../lib/common/contracts/tabWheel";
import {
  activateTaggedTabWheelTab,
  clearTaggedTabWheelTabs,
  cycleTabWheel,
  getTabWheelOverviewWithRetry,
  openTabWheelHelp,
  refreshCurrentTabWheel,
  removeTaggedTabWheelTab,
  setTabWheelCycleScope,
  toggleCurrentTabWheelTag,
} from "../../lib/adapters/runtime/tabWheelApi";

function presetLabel(preset: TabWheelPreset): string {
  if (preset === "precise") return "Precise";
  if (preset === "fast") return "Fast";
  if (preset === "custom") return "Custom";
  return "Balanced";
}

function cycleScopeLabel(scope: TabWheelCycleScope): string {
  return scope === "tagged" ? "Wheel List" : "General";
}

const UNAVAILABLE_GESTURES_MESSAGE = "Page gestures unavailable here; popup buttons still work.";

function setSelectOptions(select: HTMLSelectElement, values: readonly string[], selected: string, label: (value: string) => string): void {
  select.innerHTML = values
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label(value)}</option>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const shortcutEl = document.getElementById("shortcutLabel")!;
  const shortcutStatusEl = document.getElementById("shortcutStatus")!;
  const toastEl = document.getElementById("popupToast")!;
  const titlebarTextEl = document.getElementById("titlebarText")!;
  const reloadTabBtn = document.getElementById("reloadTabBtn") as HTMLButtonElement;
  const scopeLabel = document.getElementById("scopeLabel")!;
  const tagCountLabel = document.getElementById("tagCountLabel")!;
  const tagCurrentBtn = document.getElementById("tagCurrentBtn") as HTMLButtonElement;
  const generalModeBtn = document.getElementById("generalModeBtn") as HTMLButtonElement;
  const wheelListModeBtn = document.getElementById("wheelListModeBtn") as HTMLButtonElement;
  const prevTabBtn = document.getElementById("prevTabBtn") as HTMLButtonElement;
  const nextTabBtn = document.getElementById("nextTabBtn") as HTMLButtonElement;
  const wheelListSection = document.getElementById("wheelListSection")!;
  const wheelListToggle = document.getElementById("wheelListToggle") as HTMLButtonElement;
  const clearTagsBtn = document.getElementById("clearTagsBtn") as HTMLButtonElement;
  const taggedTabsList = document.getElementById("taggedTabsList")!;
  const wheelPresetSelect = document.getElementById("wheelPreset") as HTMLSelectElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const skipPinnedTabsInput = document.getElementById("skipPinnedTabs") as HTMLInputElement;
  const wrapAroundInput = document.getElementById("wrapAround") as HTMLInputElement;
  const wheelAccelerationInput = document.getElementById("wheelAcceleration") as HTMLInputElement;
  const horizontalWheelInput = document.getElementById("horizontalWheel") as HTMLInputElement;
  const overshootGuardInput = document.getElementById("overshootGuard") as HTMLInputElement;
  const allowEditableInput = document.getElementById("allowGesturesInEditableFields") as HTMLInputElement;
  const wheelSensitivityInput = document.getElementById("wheelSensitivity") as HTMLInputElement;
  const wheelSensitivityValue = document.getElementById("wheelSensitivityValue")!;
  const wheelCooldownInput = document.getElementById("wheelCooldownMs") as HTMLInputElement;
  const wheelCooldownValue = document.getElementById("wheelCooldownValue")!;
  const helpBtn = document.getElementById("helpBtn") as HTMLButtonElement;
  const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;

  let settings = await loadTabWheelSettings();
  let overview: TabWheelOverview | null = null;
  let statusTimer = 0;
  let statusHiddenCallback: (() => void) | null = null;
  let isConfirmingClear = false;
  let isWheelListOpen = false;

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

  function renderTaggedList(): void {
    const taggedTabs = overview?.taggedTabs || [];
    if (taggedTabs.length === 0) {
      taggedTabsList.innerHTML = `
        <div class="tagged-empty">
          <strong>No Wheel List tabs</strong>
          <span>Add tabs here to create a short wheel-cycling list. ${escapeHtml(formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift))} + Left Click also adds the current tab.</span>
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
        window.close();
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
    const gesture = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    const cycleScope = overview?.cycleScope || settings.cycleScope;
    shortcutEl.textContent = `${gesture} + Wheel`;
    titlebarTextEl.textContent = overview
      ? `TabWheel (${Math.max(1, overview.activeIndex + 1)}/${overview.tabCount})`
      : "TabWheel";
    scopeLabel.textContent = cycleScopeLabel(cycleScope);
    tagCountLabel.textContent = `${overview?.taggedCount || 0}/${MAX_WHEEL_LIST_TABS} tagged`;
    tagCurrentBtn.textContent = overview?.isCurrentTagged ? "Remove current" : "Add current";
    renderModeButtons(cycleScope);
    shortcutStatusEl.textContent = overview?.contentScriptStatus === "ready"
      ? "Scroll switches tabs. Left click adds this tab. Right click changes mode."
      : "Use popup buttons when page shortcuts are unavailable";
    if (overview?.contentScriptStatus === "unavailable") {
      showStatus(UNAVAILABLE_GESTURES_MESSAGE, true);
    } else if (toastEl.textContent === UNAVAILABLE_GESTURES_MESSAGE) {
      hideStatus();
    }
    renderWheelListDisclosure();
    renderTaggedList();
  }

  function renderSettings(): void {
    setSelectOptions(
      wheelPresetSelect,
      TABWHEEL_PRESETS,
      settings.wheelPreset,
      (value) => presetLabel(value as TabWheelPreset),
    );
    setSelectOptions(
      gestureModifierSelect,
      TABWHEEL_MODIFIER_KEYS,
      settings.gestureModifier,
      (value) => formatTabWheelModifierKey(value as TabWheelModifierKey),
    );
    gestureWithShiftInput.checked = settings.gestureWithShift;
    invertScrollInput.checked = settings.invertScroll;
    skipPinnedTabsInput.checked = settings.skipPinnedTabs;
    wrapAroundInput.checked = settings.wrapAround;
    wheelAccelerationInput.checked = settings.wheelAcceleration;
    horizontalWheelInput.checked = settings.horizontalWheel;
    overshootGuardInput.checked = settings.overshootGuard;
    allowEditableInput.checked = settings.allowGesturesInEditableFields;
    wheelSensitivityInput.min = String(MIN_WHEEL_SENSITIVITY);
    wheelSensitivityInput.max = String(MAX_WHEEL_SENSITIVITY);
    wheelSensitivityInput.value = String(settings.wheelSensitivity);
    wheelSensitivityValue.textContent = `Wheel distance: ${settings.wheelSensitivity.toFixed(1)}x`;
    wheelCooldownInput.min = String(MIN_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.max = String(MAX_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.value = String(settings.wheelCooldownMs);
    wheelCooldownValue.textContent = `Switch delay: ${Math.round(settings.wheelCooldownMs)}ms`;
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
    reloadTabBtn.disabled = true;
    try {
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
      reloadTabBtn.disabled = false;
    }
  }

  function readSettings(): TabWheelSettings {
    const nextSettings: TabWheelSettings = {
      ...settings,
      wheelPreset: wheelPresetSelect.value as TabWheelPreset,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      invertScroll: invertScrollInput.checked,
      skipPinnedTabs: skipPinnedTabsInput.checked,
      wrapAround: wrapAroundInput.checked,
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
    wrapAroundInput,
    wheelAccelerationInput,
    horizontalWheelInput,
    overshootGuardInput,
    allowEditableInput,
    wheelSensitivityInput,
    wheelCooldownInput,
  ].forEach((control) => {
    control.addEventListener("change", () => void persist(readSettings()));
  });

  wheelPresetSelect.addEventListener("change", () => {
    void persist(applyTabWheelPreset(readSettings(), wheelPresetSelect.value as TabWheelPreset));
  });
  wheelSensitivityInput.addEventListener("input", () => {
    wheelSensitivityValue.textContent = `Wheel distance: ${Number(wheelSensitivityInput.value).toFixed(1)}x`;
    wheelPresetSelect.value = "custom";
  });
  wheelCooldownInput.addEventListener("input", () => {
    wheelCooldownValue.textContent = `Switch delay: ${Math.round(Number(wheelCooldownInput.value))}ms`;
    wheelPresetSelect.value = "custom";
  });

  tagCurrentBtn.addEventListener("click", async () => {
    const result = await toggleCurrentTabWheelTag();
    await refreshAll();
    showStatus(result.ok ? "Wheel List updated" : result.reason || "Could not update Wheel List");
  });

  wheelListToggle.addEventListener("click", () => {
    isWheelListOpen = !isWheelListOpen;
    renderWheelListDisclosure();
  });

  generalModeBtn.addEventListener("click", () => {
    void setPopupCycleScope("general");
  });
  wheelListModeBtn.addEventListener("click", () => {
    void setPopupCycleScope("tagged");
  });

  prevTabBtn.addEventListener("click", () => {
    void runPopupCycle("prev");
  });
  nextTabBtn.addEventListener("click", () => {
    void runPopupCycle("next");
  });

  reloadTabBtn.addEventListener("click", () => {
    void refreshCurrentTabWheelState();
  });

  clearTagsBtn.addEventListener("click", async () => {
    if (!isConfirmingClear) {
      isConfirmingClear = true;
      showStatus("Click Remove all again to empty the Wheel List", false, () => {
        isConfirmingClear = false;
      });
      return;
    }
    isConfirmingClear = false;
    const result = await clearTaggedTabWheelTabs();
    await refreshAll();
    showStatus(result.ok ? "Wheel List emptied" : result.reason || "Could not empty Wheel List");
  });

  helpBtn.addEventListener("click", async () => {
    const result = await openTabWheelHelp();
    if (!result.ok) {
      showStatus(result.reason || "Help unavailable on this page");
      return;
    }
    window.close();
  });

  settingsBtn.addEventListener("click", () => {
    void browser.runtime.openOptionsPage();
    window.close();
  });

  await refreshAll();
});
