// TabWheel help overlay - read-only reference for wheel tab switching.

import { escapeHtml } from "../../../common/utils/helpers";
import {
  formatTabWheelModifierCombo,
  loadTabWheelSettings,
} from "../../../common/contracts/tabWheel";
import { openTabWheelOptions } from "../../../adapters/runtime/tabWheelApi";
import {
  createPanelHost,
  dismissPanel,
  footerRowHtml,
  getBaseStyles,
  registerPanelCleanup,
  removePanelHost,
} from "../../../common/utils/panelHost";
import styles from "./help.css";

interface HelpSection {
  title: string;
  layout?: "rows" | "centered";
  items: { label?: string; value: string }[];
}

const SCROLL_STEP = 80;

function buildHelpSections(settings: TabWheelSettings): HelpSection[] {
  const gestureModifier = formatTabWheelModifierCombo(settings.gestureModifier, settings.gestureWithShift);
  const editableFields = settings.allowGesturesInEditableFields ? "allowed" : "blocked";
  return [
    {
      title: "How To Use",
      layout: "centered",
      items: [
        { value: `${gestureModifier} + Wheel cycles tabs in the current panel mode` },
        { value: `${gestureModifier} + Left Click opens quick controls` },
        { value: `Use quick controls to switch between left-right and recent cycling` },
        { value: `The toolbar popup shows the same controls when page shortcuts are unavailable` },
      ],
    },
    {
      title: "Wheel Shortcut",
      items: [
        { label: "Cycle tabs", value: `${gestureModifier} + Wheel` },
        { label: "Quick controls", value: `${gestureModifier} + Left Click` },
        { label: "Editable fields", value: editableFields },
        { label: "Wheel down", value: settings.invertScroll ? "previous tab" : "next tab" },
        { label: "Wheel up", value: settings.invertScroll ? "next tab" : "previous tab" },
      ],
    },
    {
      title: "Cycling Rules",
      items: [
        { label: "Left-right", value: "cycle by visible browser tab order" },
        { label: "Recent", value: "cycle by most recently used tabs" },
        { label: "Pinned tabs", value: settings.skipPinnedTabs ? "skipped" : "included" },
        { label: "Wrap around", value: settings.wrapAround ? "on" : "off" },
        { label: "Sensitivity", value: `${settings.wheelSensitivity.toFixed(1)}x` },
        { label: "Cooldown", value: `${Math.round(settings.wheelCooldownMs)}ms` },
      ],
    },
    {
      title: "Scroll Memory",
      items: [
        { label: "Tracked data", value: "scroll X / Y for recent tabs" },
        { label: "Saved when", value: "a page scrolls" },
        { label: "Restored when", value: "a remembered tab is activated" },
        { label: "Restricted pages", value: "browser pages may block content scripts" },
      ],
    },
  ];
}

function buildSectionsHtml(sections: HelpSection[]): string {
  return sections.map((section) => {
    const isCentered = section.layout === "centered";
    const itemsHtml = isCentered
      ? section.items.map((item) => `
          <div class="ht-help-step">${escapeHtml(item.value)}</div>
        `).join("")
      : section.items.map((item) => `
          <div class="ht-help-row">
            <span class="ht-help-label">${escapeHtml(item.label || "")}</span>
            <span class="ht-help-key">${escapeHtml(item.value)}</span>
          </div>
        `).join("");

    return `
      <section class="ht-help-section${isCentered ? " ht-help-section-centered" : ""}">
        <div class="ht-help-header">${escapeHtml(section.title)}</div>
        <div class="${isCentered ? "ht-help-steps" : "ht-help-items"}">
          ${itemsHtml}
        </div>
      </section>
    `;
  }).join("");
}

export async function openTabWheelHelpOverlay(): Promise<void> {
  try {
    const settings = await loadTabWheelSettings();
    const { host, shadow } = createPanelHost();

    const style = document.createElement("style");
    style.textContent = getBaseStyles() + styles;
    shadow.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.className = "ht-backdrop";
    shadow.appendChild(backdrop);

    const panel = document.createElement("div");
    panel.className = "ht-help-container";
    shadow.appendChild(panel);

    panel.innerHTML = `
      <div class="ht-titlebar">
        <div class="ht-traffic-lights">
          <button class="ht-dot ht-dot-close" title="Close"></button>
        </div>
        <span class="ht-help-titlebar-text">
          <span class="ht-help-title-label">TabWheel Help</span>
        </span>
        <button class="ht-help-settings" data-action="settings" title="Settings" aria-label="Open settings">&#9881;</button>
      </div>
      <div class="ht-help-body">
        ${buildSectionsHtml(buildHelpSections(settings))}
        <div class="ht-help-tip">Browser-reserved pages may not allow content scripts; use the toolbar popup when page shortcuts are unavailable.</div>
      </div>
      <div class="ht-footer">
        ${footerRowHtml([
          { key: "j/k", desc: "scroll" },
          { key: "ArrowUp/ArrowDown", desc: "scroll" },
        ])}
        ${footerRowHtml([
          { key: "Wheel", desc: "scroll" },
          { key: "Esc", desc: "close" },
        ])}
      </div>
    `;

    const body = panel.querySelector(".ht-help-body") as HTMLDivElement;
    const closeButton = panel.querySelector(".ht-dot-close") as HTMLButtonElement;
    const settingsButton = panel.querySelector('[data-action="settings"]') as HTMLButtonElement;

    function close(): void {
      document.removeEventListener("keydown", keyHandler, true);
      removePanelHost();
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

      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        event.stopPropagation();
        body.scrollTop += SCROLL_STEP;
        return;
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        body.scrollTop -= SCROLL_STEP;
        return;
      }

      event.stopPropagation();
    }

    backdrop.addEventListener("click", close);
    backdrop.addEventListener("mousedown", (event) => event.preventDefault());
    closeButton.addEventListener("click", close);
    settingsButton.addEventListener("click", async () => {
      const result = await openTabWheelOptions();
      if (!result.ok) {
        console.warn("[TabWheel] Failed to open options:", result.reason);
        return;
      }
      close();
    });
    document.addEventListener("keydown", keyHandler, true);
    registerPanelCleanup(close);
    host.focus();
  } catch (error) {
    console.error("[TabWheel] Failed to open help overlay:", error);
    dismissPanel();
  }
}
