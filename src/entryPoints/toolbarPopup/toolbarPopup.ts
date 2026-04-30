// Browser-action popup for TabWheel quick controls.

import browser from "webextension-polyfill";
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
import {
  getTabWheelOverviewWithRetry,
  openTabWheelHelp,
} from "../../lib/adapters/runtime/tabWheelApi";

function cycleOrderLabel(order: TabWheelCycleOrder): string {
  return order === "mru" ? "Recent" : "Left-right";
}

function setSelectOptions(select: HTMLSelectElement, values: readonly string[], selected: string, label: (value: string) => string): void {
  select.innerHTML = values
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label(value)}</option>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const shortcutEl = document.getElementById("shortcutLabel")!;
  const statusEl = document.getElementById("statusLine")!;
  const tabMetaEl = document.getElementById("tabMeta")!;
  const cycleOrderSelect = document.getElementById("cycleOrder") as HTMLSelectElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const skipPinnedTabsInput = document.getElementById("skipPinnedTabs") as HTMLInputElement;
  const wrapAroundInput = document.getElementById("wrapAround") as HTMLInputElement;
  const wheelAccelerationInput = document.getElementById("wheelAcceleration") as HTMLInputElement;
  const allowEditableInput = document.getElementById("allowGesturesInEditableFields") as HTMLInputElement;
  const wheelSensitivityInput = document.getElementById("wheelSensitivity") as HTMLInputElement;
  const wheelSensitivityValue = document.getElementById("wheelSensitivityValue")!;
  const wheelCooldownInput = document.getElementById("wheelCooldownMs") as HTMLInputElement;
  const wheelCooldownValue = document.getElementById("wheelCooldownValue")!;
  const helpBtn = document.getElementById("helpBtn") as HTMLButtonElement;
  const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;

  let settings = await loadTabWheelSettings();
  let statusTimer = 0;

  function showStatus(message: string): void {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusEl.textContent = message;
    statusTimer = window.setTimeout(() => {
      statusEl.textContent = "";
      statusTimer = 0;
    }, 1800);
  }

  async function refreshOverview(): Promise<void> {
    const overview = await getTabWheelOverviewWithRetry().catch(() => null);
    tabMetaEl.textContent = overview
      ? `Tab ${Math.max(1, overview.activeIndex + 1)}/${overview.tabCount}`
      : "Current page unavailable";
  }

  function renderSettings(): void {
    setSelectOptions(
      cycleOrderSelect,
      TABWHEEL_CYCLE_ORDERS,
      settings.cycleOrder,
      (value) => cycleOrderLabel(value as TabWheelCycleOrder),
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
    allowEditableInput.checked = settings.allowGesturesInEditableFields;
    wheelSensitivityInput.min = String(MIN_WHEEL_SENSITIVITY);
    wheelSensitivityInput.max = String(MAX_WHEEL_SENSITIVITY);
    wheelSensitivityInput.value = String(settings.wheelSensitivity);
    wheelSensitivityValue.textContent = `${settings.wheelSensitivity.toFixed(1)}x`;
    wheelCooldownInput.min = String(MIN_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.max = String(MAX_WHEEL_COOLDOWN_MS);
    wheelCooldownInput.value = String(settings.wheelCooldownMs);
    wheelCooldownValue.textContent = `${Math.round(settings.wheelCooldownMs)}ms`;
    shortcutEl.textContent = `${formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift)} + Wheel`;
  }

  async function persist(nextSettings: TabWheelSettings): Promise<void> {
    settings = nextSettings;
    await saveTabWheelSettings(settings);
    renderSettings();
    await refreshOverview();
    showStatus("Saved");
  }

  function readSettings(): TabWheelSettings {
    return {
      ...settings,
      cycleOrder: cycleOrderSelect.value as TabWheelCycleOrder,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      invertScroll: invertScrollInput.checked,
      skipPinnedTabs: skipPinnedTabsInput.checked,
      wrapAround: wrapAroundInput.checked,
      wheelAcceleration: wheelAccelerationInput.checked,
      allowGesturesInEditableFields: allowEditableInput.checked,
      wheelSensitivity: Number(wheelSensitivityInput.value),
      wheelCooldownMs: Number(wheelCooldownInput.value),
    };
  }

  [
    cycleOrderSelect,
    gestureModifierSelect,
    gestureWithShiftInput,
    invertScrollInput,
    skipPinnedTabsInput,
    wrapAroundInput,
    wheelAccelerationInput,
    allowEditableInput,
    wheelSensitivityInput,
    wheelCooldownInput,
  ].forEach((control) => {
    control.addEventListener("change", () => void persist(readSettings()));
  });

  wheelSensitivityInput.addEventListener("input", () => {
    wheelSensitivityValue.textContent = `${Number(wheelSensitivityInput.value).toFixed(1)}x`;
  });
  wheelCooldownInput.addEventListener("input", () => {
    wheelCooldownValue.textContent = `${Math.round(Number(wheelCooldownInput.value))}ms`;
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

  renderSettings();
  await refreshOverview();
});
