// Options page for TabWheel settings.

import {
  formatTabWheelModifierCombo,
  formatTabWheelModifierKey,
  loadTabWheelSettings,
  MAX_WHEEL_COOLDOWN_MS,
  MAX_WHEEL_SENSITIVITY,
  MIN_WHEEL_COOLDOWN_MS,
  MIN_WHEEL_SENSITIVITY,
  saveTabWheelSettings,
  TABWHEEL_CYCLE_ORDERS,
  TABWHEEL_MODIFIER_KEYS,
} from "../../lib/common/contracts/tabWheel";

document.addEventListener("DOMContentLoaded", async () => {
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const allowGesturesInEditableFieldsInput = document.getElementById("allowGesturesInEditableFields") as HTMLInputElement;
  const cycleOrderSelect = document.getElementById("cycleOrder") as HTMLSelectElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const skipPinnedTabsInput = document.getElementById("skipPinnedTabs") as HTMLInputElement;
  const wrapAroundInput = document.getElementById("wrapAround") as HTMLInputElement;
  const wheelAccelerationInput = document.getElementById("wheelAcceleration") as HTMLInputElement;
  const wheelSensitivityInput = document.getElementById("wheelSensitivity") as HTMLInputElement;
  const wheelSensitivityValue = document.getElementById("wheelSensitivityValue")!;
  const wheelCooldownInput = document.getElementById("wheelCooldownMs") as HTMLInputElement;
  const wheelCooldownValue = document.getElementById("wheelCooldownValue")!;
  const invertScrollHelp = document.getElementById("invertScrollHelp")!;
  const wheelShortcut = document.getElementById("wheelShortcut")!;
  const statusBar = document.getElementById("statusBar")!;

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

  function populateCycleOrderSelect(select: HTMLSelectElement): void {
    select.innerHTML = TABWHEEL_CYCLE_ORDERS
      .map((order) => `<option value="${order}">${order === "mru" ? "Recent" : "Left-right"}</option>`)
      .join("");
  }

  function readSettings(): TabWheelSettings {
    return {
      invertScroll: invertScrollInput.checked,
      allowGesturesInEditableFields: allowGesturesInEditableFieldsInput.checked,
      cycleOrder: cycleOrderSelect.value as TabWheelCycleOrder,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      skipPinnedTabs: skipPinnedTabsInput.checked,
      wrapAround: wrapAroundInput.checked,
      wheelAcceleration: wheelAccelerationInput.checked,
      wheelSensitivity: Number(wheelSensitivityInput.value),
      wheelCooldownMs: Number(wheelCooldownInput.value),
    };
  }

  function renderSettings(settings: TabWheelSettings): void {
    const gestureModifier = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    invertScrollInput.checked = settings.invertScroll;
    allowGesturesInEditableFieldsInput.checked = settings.allowGesturesInEditableFields;
    cycleOrderSelect.value = settings.cycleOrder;
    gestureModifierSelect.value = settings.gestureModifier;
    gestureWithShiftInput.checked = settings.gestureWithShift;
    skipPinnedTabsInput.checked = settings.skipPinnedTabs;
    wrapAroundInput.checked = settings.wrapAround;
    wheelAccelerationInput.checked = settings.wheelAcceleration;
    wheelSensitivityInput.min = String(MIN_WHEEL_SENSITIVITY);
    wheelSensitivityInput.max = String(MAX_WHEEL_SENSITIVITY);
    wheelSensitivityInput.value = String(settings.wheelSensitivity);
    wheelSensitivityValue.textContent = `${settings.wheelSensitivity.toFixed(1)}x`;
    wheelCooldownInput.min = String(MIN_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.max = String(MAX_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.value = String(settings.wheelCooldownMs);
    wheelCooldownValue.textContent = `${Math.round(settings.wheelCooldownMs)}ms`;
    invertScrollHelp.textContent = `${gestureModifier} + wheel down becomes previous, and ${gestureModifier} + wheel up becomes next.`;
    wheelShortcut.textContent = `${gestureModifier} + Wheel`;
  }

  async function saveSettings(): Promise<void> {
    const settings = readSettings();
    await saveTabWheelSettings(settings);
    renderSettings(settings);
    showStatus("Saved");
  }

  populateModifierSelect(gestureModifierSelect);
  populateCycleOrderSelect(cycleOrderSelect);

  const settings = await loadTabWheelSettings();
  renderSettings(settings);

  invertScrollInput.addEventListener("change", () => void saveSettings());
  allowGesturesInEditableFieldsInput.addEventListener("change", () => void saveSettings());
  cycleOrderSelect.addEventListener("change", () => void saveSettings());
  gestureModifierSelect.addEventListener("change", () => void saveSettings());
  gestureWithShiftInput.addEventListener("change", () => void saveSettings());
  skipPinnedTabsInput.addEventListener("change", () => void saveSettings());
  wrapAroundInput.addEventListener("change", () => void saveSettings());
  wheelAccelerationInput.addEventListener("change", () => void saveSettings());
  wheelSensitivityInput.addEventListener("change", () => void saveSettings());
  wheelSensitivityInput.addEventListener("input", () => {
    wheelSensitivityValue.textContent = `${Number(wheelSensitivityInput.value).toFixed(1)}x`;
  });
  wheelCooldownInput.addEventListener("change", () => void saveSettings());
  wheelCooldownInput.addEventListener("input", () => {
    wheelCooldownValue.textContent = `${Math.round(Number(wheelCooldownInput.value))}ms`;
  });
});
