// Options page for TabWheel settings.

import {
  formatTabWheelHelpShortcut,
  formatTabWheelModifierCombo,
  formatTabWheelModifierKey,
  formatTabWheelPanelShortcut,
  loadTabWheelSettings,
  saveTabWheelSettings,
  TABWHEEL_MODIFIER_KEYS,
  TABWHEEL_PANEL_KEY_OPTIONS,
} from "../../lib/common/contracts/tabWheel";

document.addEventListener("DOMContentLoaded", async () => {
  const invertScrollInput = document.getElementById("invertScroll") as HTMLInputElement;
  const gestureModifierSelect = document.getElementById("gestureModifier") as HTMLSelectElement;
  const gestureWithShiftInput = document.getElementById("gestureWithShift") as HTMLInputElement;
  const panelModifierSelect = document.getElementById("panelModifier") as HTMLSelectElement;
  const panelWithShiftInput = document.getElementById("panelWithShift") as HTMLInputElement;
  const panelKeySelect = document.getElementById("panelKey") as HTMLSelectElement;
  const helpModifierSelect = document.getElementById("helpModifier") as HTMLSelectElement;
  const helpWithShiftInput = document.getElementById("helpWithShift") as HTMLInputElement;
  const helpKeySelect = document.getElementById("helpKey") as HTMLSelectElement;
  const invertScrollHelp = document.getElementById("invertScrollHelp")!;
  const wheelShortcut = document.getElementById("wheelShortcut")!;
  const panelShortcut = document.getElementById("panelShortcut")!;
  const helpShortcut = document.getElementById("helpShortcut")!;
  const tagShortcut = document.getElementById("tagShortcut")!;
  const removeShortcut = document.getElementById("removeShortcut")!;
  const clearShortcut = document.getElementById("clearShortcut")!;
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

  function populateKeySelect(select: HTMLSelectElement): void {
    select.innerHTML = TABWHEEL_PANEL_KEY_OPTIONS
      .map((key) => `<option value="${key}">${key.toUpperCase()}</option>`)
      .join("");
  }

  function readSettings(): TabWheelSettings {
    return {
      invertScroll: invertScrollInput.checked,
      gestureModifier: gestureModifierSelect.value as TabWheelModifierKey,
      gestureWithShift: gestureWithShiftInput.checked,
      panelModifier: panelModifierSelect.value as TabWheelModifierKey,
      panelWithShift: panelWithShiftInput.checked,
      panelKey: panelKeySelect.value,
      helpModifier: helpModifierSelect.value as TabWheelModifierKey,
      helpWithShift: helpWithShiftInput.checked,
      helpKey: helpKeySelect.value,
    };
  }

  function renderSettings(settings: TabWheelSettings): void {
    const gestureModifier = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
    invertScrollInput.checked = settings.invertScroll;
    gestureModifierSelect.value = settings.gestureModifier;
    gestureWithShiftInput.checked = settings.gestureWithShift;
    panelModifierSelect.value = settings.panelModifier;
    panelWithShiftInput.checked = settings.panelWithShift;
    panelKeySelect.value = settings.panelKey;
    helpModifierSelect.value = settings.helpModifier;
    helpWithShiftInput.checked = settings.helpWithShift;
    helpKeySelect.value = settings.helpKey;
    invertScrollHelp.textContent = `${gestureModifier} + wheel down becomes previous, and ${gestureModifier} + wheel up becomes next.`;
    wheelShortcut.textContent = `${gestureModifier} + Wheel`;
    panelShortcut.textContent = formatTabWheelPanelShortcut(settings);
    helpShortcut.textContent = formatTabWheelHelpShortcut(settings);
    tagShortcut.textContent = `${gestureModifier} + Left Click`;
    removeShortcut.textContent = `${gestureModifier} + Right Click`;
    clearShortcut.textContent = `${gestureModifier} + Middle Click`;
  }

  async function saveSettings(): Promise<void> {
    const settings = readSettings();
    await saveTabWheelSettings(settings);
    renderSettings(settings);
    showStatus("Saved");
  }

  populateModifierSelect(gestureModifierSelect);
  populateModifierSelect(panelModifierSelect);
  populateModifierSelect(helpModifierSelect);
  populateKeySelect(panelKeySelect);
  populateKeySelect(helpKeySelect);

  const settings = await loadTabWheelSettings();
  renderSettings(settings);

  invertScrollInput.addEventListener("change", () => void saveSettings());
  gestureModifierSelect.addEventListener("change", () => void saveSettings());
  gestureWithShiftInput.addEventListener("change", () => void saveSettings());
  panelModifierSelect.addEventListener("change", () => void saveSettings());
  panelWithShiftInput.addEventListener("change", () => void saveSettings());
  panelKeySelect.addEventListener("change", () => void saveSettings());
  helpModifierSelect.addEventListener("change", () => void saveSettings());
  helpWithShiftInput.addEventListener("change", () => void saveSettings());
  helpKeySelect.addEventListener("change", () => void saveSettings());
});
