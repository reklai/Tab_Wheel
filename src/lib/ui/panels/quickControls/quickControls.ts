// Quick controls overlay - in-page settings surface for wheel tab switching.

import { escapeHtml } from "../../../common/utils/helpers";
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
} from "../../../common/contracts/tabWheel";
import {
  getTabWheelOverviewWithRetry,
  openTabWheelOptions,
} from "../../../adapters/runtime/tabWheelApi";
import {
  createPanelHost,
  dismissPanel,
  footerRowHtml,
  getBaseStyles,
  registerPanelCleanup,
  removePanelHost,
} from "../../../common/utils/panelHost";
import { openTabWheelHelpOverlay } from "../help/help";
import styles from "./quickControls.css";

function cycleOrderLabel(order: TabWheelCycleOrder): string {
  return order === "mru" ? "Recent" : "Left-right";
}

function boolAttr(value: boolean): string {
  return value ? "checked" : "";
}

function modifierOptions(selected: TabWheelModifierKey): string {
  return TABWHEEL_MODIFIER_KEYS
    .map((modifier) => `<option value="${modifier}" ${modifier === selected ? "selected" : ""}>${formatTabWheelModifierKey(modifier)}</option>`)
    .join("");
}

function cycleOrderOptions(selected: TabWheelCycleOrder): string {
  return TABWHEEL_CYCLE_ORDERS
    .map((order) => `<option value="${order}" ${order === selected ? "selected" : ""}>${cycleOrderLabel(order)}</option>`)
    .join("");
}

function shortcutLabel(settings: TabWheelSettings): string {
  return `${formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift)} + Wheel`;
}

function buildControlRow(label: string, html: string, note = ""): string {
  const title = note ? ` title="${escapeHtml(note)}"` : "";
  return `
    <label class="ht-quick-row"${title}>
      <span class="ht-quick-row-text">
        <strong>${escapeHtml(label)}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </span>
      ${html}
    </label>
  `;
}

function buildToggle(name: keyof TabWheelSettings, checked: boolean): string {
  return `<input data-setting="${String(name)}" type="checkbox" ${boolAttr(checked)} />`;
}

function buildQuickControlsHtml(settings: TabWheelSettings, overview: TabWheelOverview | null): string {
  const tabMeta = overview
    ? `Tab ${Math.max(1, overview.activeIndex + 1)}/${overview.tabCount}`
    : "Page unavailable";
  return `
    <div class="ht-titlebar ht-quick-titlebar">
      <div class="ht-traffic-lights">
        <button class="ht-dot ht-dot-close" title="Close"></button>
      </div>
      <span class="ht-titlebar-text">TabWheel Controls</span>
      <span class="ht-quick-meta">${escapeHtml(tabMeta)}</span>
    </div>
    <div class="ht-quick-hero">
      <span class="ht-quick-shortcut">${escapeHtml(shortcutLabel(settings))}</span>
      <span class="ht-quick-subtitle">${escapeHtml(cycleOrderLabel(settings.cycleOrder))} cycling</span>
    </div>
    <div class="ht-quick-grid">
      ${buildControlRow("Cycle order", `
        <select data-setting="cycleOrder">${cycleOrderOptions(settings.cycleOrder)}</select>
      `, "Left-right follows the visible browser tab order. Recent follows most-recently-used tabs.")}
      ${buildControlRow("Wheel modifier", `
        <select data-setting="gestureModifier">${modifierOptions(settings.gestureModifier)}</select>
      `, "Base key for cycling and for opening this menu.")}
      ${buildControlRow("Require Shift", buildToggle("gestureWithShift", settings.gestureWithShift), "Add Shift to the selected modifier before wheel cycling is active.")}
      ${buildControlRow("Invert wheel", buildToggle("invertScroll", settings.invertScroll), "Swap wheel down/up so down goes previous and up goes next.")}
      ${buildControlRow("Skip pinned tabs", buildToggle("skipPinnedTabs", settings.skipPinnedTabs), "Keep pinned utility tabs out of the cycling path.")}
      ${buildControlRow("Wrap around", buildToggle("wrapAround", settings.wrapAround), "At the first or last tab, continue from the opposite edge.")}
      ${buildControlRow("Acceleration", buildToggle("wheelAcceleration", settings.wheelAcceleration), "Shortens the cooldown during repeated wheel bursts.")}
      ${buildControlRow("Editable fields", buildToggle("allowGesturesInEditableFields", settings.allowGesturesInEditableFields), "Allow the wheel shortcut inside text boxes and rich editors.")}
      ${buildControlRow("Sensitivity", `
        <span class="ht-quick-range">
          <input data-setting="wheelSensitivity" type="range" min="${MIN_WHEEL_SENSITIVITY}" max="${MAX_WHEEL_SENSITIVITY}" step="0.1" value="${settings.wheelSensitivity}" />
          <span>${settings.wheelSensitivity.toFixed(1)}x</span>
        </span>
      `, "Higher values need less wheel movement before switching tabs.")}
      ${buildControlRow("Cooldown", `
        <span class="ht-quick-range">
          <input data-setting="wheelCooldownMs" type="range" min="${MIN_WHEEL_COOLDOWN_MS}" max="${MAX_WHEEL_COOLDOWN_MS}" step="10" value="${settings.wheelCooldownMs}" />
          <span>${Math.round(settings.wheelCooldownMs)}ms</span>
        </span>
      `, "Minimum time between tab switches; lower feels faster but can overshoot.")}
    </div>
    <div class="ht-quick-actions">
      <button data-action="help">Help</button>
      <button data-action="settings">Settings</button>
    </div>
    <div class="ht-footer">
      ${footerRowHtml([
        { key: "Esc", desc: "close" },
        { key: "Click", desc: "change" },
      ])}
    </div>
  `;
}

export async function openQuickControlsPanel(): Promise<void> {
  try {
    const { host, shadow } = createPanelHost();

    const style = document.createElement("style");
    style.textContent = getBaseStyles() + styles;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "ht-backdrop";
    shadow.appendChild(backdrop);

    const panel = document.createElement("div");
    panel.className = "ht-quick-controls-container";
    shadow.appendChild(panel);

    let settings = await loadTabWheelSettings();
    let overview = await getTabWheelOverviewWithRetry().catch(() => null);

    function close(): void {
      document.removeEventListener("keydown", keyHandler, true);
      removePanelHost();
    }

    async function persist(nextSettings: TabWheelSettings): Promise<void> {
      settings = nextSettings;
      await saveTabWheelSettings(settings);
      overview = await getTabWheelOverviewWithRetry().catch(() => overview);
      render();
    }

    function readNextSettings(target: HTMLElement): TabWheelSettings {
      const key = target.dataset.setting as keyof TabWheelSettings | undefined;
      if (!key) return settings;
      const nextSettings: TabWheelSettings = { ...settings };
      if (target instanceof HTMLInputElement && target.type === "checkbox") {
        Object.assign(nextSettings, { [key]: target.checked });
        return nextSettings;
      }
      if (target instanceof HTMLInputElement && target.type === "range") {
        Object.assign(nextSettings, { [key]: Number(target.value) });
        return nextSettings;
      }
      if (target instanceof HTMLSelectElement) {
        Object.assign(nextSettings, { [key]: target.value });
      }
      return nextSettings;
    }

    function bindHandlers(): void {
      panel.querySelector(".ht-dot-close")?.addEventListener("click", close);
      panel.querySelectorAll<HTMLElement>("[data-setting]").forEach((control) => {
        control.addEventListener("change", () => {
          void persist(readNextSettings(control));
        });
        control.addEventListener("input", () => {
          if (!(control instanceof HTMLInputElement) || control.type !== "range") return;
          void persist(readNextSettings(control));
        });
      });
      panel.querySelector('[data-action="help"]')?.addEventListener("click", () => {
        void openTabWheelHelpOverlay();
      });
      panel.querySelector('[data-action="settings"]')?.addEventListener("click", async () => {
        const result = await openTabWheelOptions();
        if (!result.ok) return;
        close();
      });
    }

    function render(): void {
      panel.innerHTML = buildQuickControlsHtml(settings, overview);
      bindHandlers();
    }

    function keyHandler(event: KeyboardEvent): void {
      if (!document.getElementById("ht-panel-host")) {
        document.removeEventListener("keydown", keyHandler, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      event.stopPropagation();
    }

    backdrop.addEventListener("click", close);
    backdrop.addEventListener("mousedown", (event) => event.preventDefault());
    document.addEventListener("keydown", keyHandler, true);
    registerPanelCleanup(close);
    render();
    host.focus();
  } catch (error) {
    console.error("[TabWheel] Failed to open quick controls:", error);
    dismissPanel();
  }
}
