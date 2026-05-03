// Browser-action popup for TabWheel controls.

import browser from "webextension-polyfill";
import {
  applyTabWheelPreset,
  detectTabWheelPreset,
  formatTabWheelModifierCombo,
  formatTabWheelModifierKey,
  loadTabWheelSettings,
  MAX_WHEEL_COOLDOWN_MS,
  MAX_WHEEL_SENSITIVITY,
  MIN_WHEEL_COOLDOWN_MS,
  MIN_WHEEL_SENSITIVITY,
  saveTabWheelSettings,
  TABWHEEL_MODIFIER_KEYS,
  TABWHEEL_PRESETS,
} from "../../lib/common/contracts/tabWheel";
import {
  activateMostRecentTabWheelTab,
  closeCurrentTabWheelTabAndActivateRecent,
  cycleTabWheel,
  getTabWheelOverviewWithRetry,
  openTabWheelHelp,
  openTabWheelSearchTab,
  refreshCurrentTabWheel,
  setTabWheelCycleScope,
} from "../../lib/adapters/runtime/tabWheelApi";

function presetLabel(preset: TabWheelPreset): string {
  if (preset === "precise") return "Precise";
  if (preset === "fast") return "Fast";
  if (preset === "custom") return "Custom";
  return "Balanced";
}

function cycleScopeLabel(scope: TabWheelCycleScope): string {
  return scope === "mru" ? "MRU" : "General";
}

function setSelectOptions(select: HTMLSelectElement, values: readonly string[], selected: string, label: (value: string) => string): void {
  select.innerHTML = values
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label(value)}</option>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const shortcutEl = document.getElementById("shortcutLabel")!;
  const shortcutStatusEl = document.getElementById("shortcutStatus")!;
  const fallbackPanel = document.getElementById("fallbackPanel")!;
  const toastEl = document.getElementById("popupToast")!;
  const titlebarTextEl = document.getElementById("titlebarText")!;
  const refreshTabWheelBtn = document.getElementById("refreshTabWheelBtn") as HTMLButtonElement;
  const scopeLabel = document.getElementById("scopeLabel")!;
  const generalModeBtn = document.getElementById("generalModeBtn") as HTMLButtonElement;
  const mruModeBtn = document.getElementById("mruModeBtn") as HTMLButtonElement;
  const prevTabBtn = document.getElementById("prevTabBtn") as HTMLButtonElement;
  const nextTabBtn = document.getElementById("nextTabBtn") as HTMLButtonElement;
  const searchForm = document.getElementById("searchForm") as HTMLFormElement;
  const searchQueryInput = document.getElementById("searchQueryInput") as HTMLInputElement;
  const recentTabBtn = document.getElementById("recentTabBtn") as HTMLButtonElement;
  const closeRecentBtn = document.getElementById("closeRecentBtn") as HTMLButtonElement;
  const wheelPresetSelect = document.getElementById("wheelPreset") as HTMLSelectElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const skipPinnedTabsInput = document.getElementById("skipPinnedTabs") as HTMLInputElement;
  const skipRestrictedPagesInput = document.getElementById("skipRestrictedPages") as HTMLInputElement;
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

  function clearStatusTimer(): void {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusTimer = 0;
  }

  function hideStatus(): void {
    clearStatusTimer();
    toastEl.classList.remove("is-visible");
    toastEl.textContent = "";
  }

  function showStatus(message: string, sticky = false): void {
    clearStatusTimer();
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    if (sticky) return;
    statusTimer = window.setTimeout(() => {
      hideStatus();
    }, 1800);
  }

  async function refreshOverview(): Promise<void> {
    overview = await getTabWheelOverviewWithRetry().catch(() => null);
  }

  function renderModeButtons(cycleScope: TabWheelCycleScope): void {
    for (const button of [generalModeBtn, mruModeBtn]) {
      const isActive = button.dataset.cycleScope === cycleScope;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function renderState(): void {
    const gesture = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    const cycleScope = overview?.cycleScope || settings.cycleScope;
    shortcutEl.textContent = `Hold ${gesture} and Use Mouse Wheel or Clicks`;
    titlebarTextEl.textContent = overview
      ? `TabWheel (${Math.max(1, overview.activeIndex + 1)}/${overview.tabCount})`
      : "TabWheel";
    scopeLabel.textContent = cycleScopeLabel(cycleScope);
    renderModeButtons(cycleScope);
    const arePageShortcutsReady = overview?.contentScriptStatus === "ready";
    fallbackPanel.hidden = arePageShortcutsReady;
    shortcutStatusEl.hidden = !arePageShortcutsReady;
    shortcutStatusEl.textContent = arePageShortcutsReady
      ? "Wheel switches tabs. Left-click opens search. Middle-click opens recent tab. Right-click closes and returns."
      : "";
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
    skipRestrictedPagesInput.checked = settings.skipRestrictedPages;
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

  async function runPopupAction(
    action: () => Promise<TabWheelActionResult>,
    successMessage: string,
    failureMessage: string,
    shouldClose = false,
  ): Promise<void> {
    const result = await action().catch(() => ({
      ok: false,
      reason: failureMessage,
    }));
    await refreshAll();
    if (!result.ok) {
      showStatus(result.reason || failureMessage);
      return;
    }
    if (shouldClose) {
      window.close();
      return;
    }
    showStatus(successMessage);
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
      refreshTabWheelBtn.disabled = false;
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
      skipRestrictedPages: skipRestrictedPagesInput.checked,
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
    skipRestrictedPagesInput,
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

  generalModeBtn.addEventListener("click", () => {
    void setPopupCycleScope("general");
  });
  mruModeBtn.addEventListener("click", () => {
    void setPopupCycleScope("mru");
  });

  prevTabBtn.addEventListener("click", () => {
    void runPopupAction(
      () => cycleTabWheel("prev"),
      "Previous tab",
      "Unable to switch tabs",
    );
  });
  nextTabBtn.addEventListener("click", () => {
    void runPopupAction(
      () => cycleTabWheel("next"),
      "Next tab",
      "Unable to switch tabs",
    );
  });
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void runPopupAction(
      () => openTabWheelSearchTab(searchQueryInput.value),
      "Opened search",
      "Unable to open search",
      true,
    );
  });
  recentTabBtn.addEventListener("click", () => {
    void runPopupAction(
      () => activateMostRecentTabWheelTab(),
      "Most recent tab",
      "Recent tab unavailable",
      true,
    );
  });
  closeRecentBtn.addEventListener("click", () => {
    void runPopupAction(
      () => closeCurrentTabWheelTabAndActivateRecent(),
      "",
      "Unable to close tab",
      true,
    );
  });

  refreshTabWheelBtn.addEventListener("click", () => {
    void refreshCurrentTabWheelState();
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
