// Options page for TabWheel settings.

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
  TABWHEEL_CYCLE_SCOPES,
  TABWHEEL_MODIFIER_KEYS,
  TABWHEEL_PRESETS,
} from "../../lib/common/contracts/tabWheel";

function presetLabel(preset: TabWheelPreset): string {
  if (preset === "precise") return "Precise";
  if (preset === "fast") return "Fast";
  if (preset === "custom") return "Custom";
  return "Balanced";
}

function cycleScopeLabel(scope: TabWheelCycleScope): string {
  return scope === "mru" ? "Most Recently Used" : "Left-To-Right";
}

document.addEventListener("DOMContentLoaded", async () => {
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const allowGesturesInEditableFieldsInput = document.getElementById("allowGesturesInEditableFields") as HTMLInputElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const openNativeNewTabOnLeftClickSelect = document.getElementById("openNativeNewTabOnLeftClick") as HTMLSelectElement;
  const cycleScopeSelect = document.getElementById("cycleScope") as HTMLSelectElement;
  const skipPinnedTabsInput = document.getElementById("skipPinnedTabs") as HTMLInputElement;
  const skipRestrictedPagesInput = document.getElementById("skipRestrictedPages") as HTMLInputElement;
  const wrapAroundInput = document.getElementById("wrapAround") as HTMLInputElement;
  const wheelPresetSelect = document.getElementById("wheelPreset") as HTMLSelectElement;
  const wheelAccelerationInput = document.getElementById("wheelAcceleration") as HTMLInputElement;
  const horizontalWheelInput = document.getElementById("horizontalWheel") as HTMLInputElement;
  const overshootGuardInput = document.getElementById("overshootGuard") as HTMLInputElement;
  const wheelSensitivityInput = document.getElementById("wheelSensitivity") as HTMLInputElement;
  const wheelSensitivityValue = document.getElementById("wheelSensitivityValue")!;
  const wheelCooldownInput = document.getElementById("wheelCooldownMs") as HTMLInputElement;
  const wheelCooldownValue = document.getElementById("wheelCooldownValue")!;
  const invertScrollHelp = document.getElementById("invertScrollHelp")!;
  const wheelShortcut = document.getElementById("wheelShortcut")!;
  const searchShortcut = document.getElementById("searchShortcut")!;
  const leftClickShortcutDescription = document.getElementById("leftClickShortcutDescription")!;
  const recentShortcut = document.getElementById("recentShortcut")!;
  const closeShortcut = document.getElementById("closeShortcut")!;
  const statusBar = document.getElementById("statusBar")!;

  let settings = await loadTabWheelSettings();
  let statusTimeout: ReturnType<typeof setTimeout> | null = null;

  function showStatus(message: string): void {
    if (statusTimeout) clearTimeout(statusTimeout);
    statusBar.textContent = message;
    statusBar.className = "status-bar visible";
    statusTimeout = setTimeout(() => {
      statusBar.classList.remove("visible");
    }, 2500);
  }

  function populateModifierSelect(select: HTMLSelectElement): void {
    select.innerHTML = TABWHEEL_MODIFIER_KEYS
      .map((modifier) => `<option value="${modifier}">${formatTabWheelModifierKey(modifier)}</option>`)
      .join("");
  }

  function populatePresetSelect(select: HTMLSelectElement): void {
    select.innerHTML = TABWHEEL_PRESETS
      .map((preset) => `<option value="${preset}">${presetLabel(preset)}</option>`)
      .join("");
  }

  function populateCycleScopeSelect(select: HTMLSelectElement): void {
    select.innerHTML = TABWHEEL_CYCLE_SCOPES
      .map((cycleScope) => `<option value="${cycleScope}">${cycleScopeLabel(cycleScope)}</option>`)
      .join("");
  }

  function readSettings(): TabWheelSettings {
    const nextSettings: TabWheelSettings = {
      ...settings,
      invertScroll: invertScrollInput.checked,
      allowGesturesInEditableFields: allowGesturesInEditableFieldsInput.checked,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      openNativeNewTabOnLeftClick: openNativeNewTabOnLeftClickSelect.value === "true",
      cycleScope: cycleScopeSelect.value as TabWheelCycleScope,
      skipPinnedTabs: skipPinnedTabsInput.checked,
      skipRestrictedPages: skipRestrictedPagesInput.checked,
      wrapAround: wrapAroundInput.checked,
      wheelPreset: wheelPresetSelect.value as TabWheelPreset,
      wheelAcceleration: wheelAccelerationInput.checked,
      horizontalWheel: horizontalWheelInput.checked,
      overshootGuard: overshootGuardInput.checked,
      wheelSensitivity: Number(wheelSensitivityInput.value),
      wheelCooldownMs: Number(wheelCooldownInput.value),
    };
    return {
      ...nextSettings,
      wheelPreset: detectTabWheelPreset(nextSettings),
    };
  }

  function renderSettings(nextSettings: TabWheelSettings): void {
    settings = nextSettings;
    const gestureModifier = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    invertScrollInput.checked = settings.invertScroll;
    allowGesturesInEditableFieldsInput.checked = settings.allowGesturesInEditableFields;
    gestureModifierSelect.value = settings.gestureModifier;
    gestureWithShiftInput.checked = settings.gestureWithShift;
    openNativeNewTabOnLeftClickSelect.value = settings.openNativeNewTabOnLeftClick ? "true" : "false";
    cycleScopeSelect.value = settings.cycleScope;
    skipPinnedTabsInput.checked = settings.skipPinnedTabs;
    skipRestrictedPagesInput.checked = settings.skipRestrictedPages;
    wrapAroundInput.checked = settings.wrapAround;
    wheelPresetSelect.value = settings.wheelPreset;
    wheelAccelerationInput.checked = settings.wheelAcceleration;
    horizontalWheelInput.checked = settings.horizontalWheel;
    overshootGuardInput.checked = settings.overshootGuard;
    wheelSensitivityInput.min = String(MIN_WHEEL_SENSITIVITY);
    wheelSensitivityInput.max = String(MAX_WHEEL_SENSITIVITY);
    wheelSensitivityInput.value = String(settings.wheelSensitivity);
    wheelSensitivityValue.textContent = `${settings.wheelSensitivity.toFixed(1)}x`;
    wheelCooldownInput.min = String(MIN_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.max = String(MAX_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.value = String(settings.wheelCooldownMs);
    wheelCooldownValue.textContent = `${Math.round(settings.wheelCooldownMs)}ms`;
    invertScrollHelp.textContent = `${gestureModifier} + wheel down/right becomes previous, and ${gestureModifier} + wheel up/left becomes next.`;
    wheelShortcut.textContent = `${gestureModifier} + Wheel`;
    searchShortcut.textContent = `${gestureModifier} + Left Click`;
    leftClickShortcutDescription.textContent = settings.openNativeNewTabOnLeftClick
      ? "Open the browser's normal new tab page."
      : "Open the in-page search launcher.";
    recentShortcut.textContent = `${gestureModifier} + Middle Click`;
    closeShortcut.textContent = `${gestureModifier} + Right Click`;
  }

  async function persist(nextSettings: TabWheelSettings): Promise<void> {
    settings = nextSettings;
    await saveTabWheelSettings(settings);
    renderSettings(settings);
    showStatus("Saved");
  }

  async function saveSettings(): Promise<void> {
    await persist(readSettings());
  }

  populateModifierSelect(gestureModifierSelect);
  populatePresetSelect(wheelPresetSelect);
  populateCycleScopeSelect(cycleScopeSelect);
  renderSettings(settings);

  wheelPresetSelect.addEventListener("change", () => {
    void persist(applyTabWheelPreset(readSettings(), wheelPresetSelect.value as TabWheelPreset));
  });
  invertScrollInput.addEventListener("change", () => void saveSettings());
  allowGesturesInEditableFieldsInput.addEventListener("change", () => void saveSettings());
  gestureModifierSelect.addEventListener("change", () => void saveSettings());
  gestureWithShiftInput.addEventListener("change", () => void saveSettings());
  openNativeNewTabOnLeftClickSelect.addEventListener("change", () => void saveSettings());
  cycleScopeSelect.addEventListener("change", () => void saveSettings());
  skipPinnedTabsInput.addEventListener("change", () => void saveSettings());
  skipRestrictedPagesInput.addEventListener("change", () => void saveSettings());
  wrapAroundInput.addEventListener("change", () => void saveSettings());
  wheelAccelerationInput.addEventListener("change", () => void saveSettings());
  horizontalWheelInput.addEventListener("change", () => void saveSettings());
  overshootGuardInput.addEventListener("change", () => void saveSettings());
  wheelSensitivityInput.addEventListener("change", () => void saveSettings());
  wheelSensitivityInput.addEventListener("input", () => {
    wheelSensitivityValue.textContent = `${Number(wheelSensitivityInput.value).toFixed(1)}x`;
    wheelPresetSelect.value = "custom";
  });
  wheelCooldownInput.addEventListener("change", () => void saveSettings());
  wheelCooldownInput.addEventListener("input", () => {
    wheelCooldownValue.textContent = `${Math.round(Number(wheelCooldownInput.value))}ms`;
    wheelPresetSelect.value = "custom";
  });
});
