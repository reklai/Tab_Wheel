// TabWheel help overlay — read-only reference for the new gesture model.

import { escapeHtml } from "../../../common/utils/helpers";
import {
  formatTabWheelHelpShortcut,
  formatTabWheelModifierCombo,
  formatTabWheelPanelShortcut,
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
  const panelShortcut = formatTabWheelPanelShortcut(settings);
  const helpShortcut = formatTabWheelHelpShortcut(settings);
  return [
    {
      title: "How To Use",
      layout: "centered",
      items: [
        { value: `${gestureModifier} + Left Click tags the active tab` },
        { value: `${gestureModifier} + Wheel cycles tagged tabs only` },
        { value: `${panelShortcut} opens search, delete, and tag controls` },
        { value: `${helpShortcut} opens this reference again` },
      ],
    },
    {
      title: "Gestures",
      items: [
        { label: "Cycle tabs", value: `${gestureModifier} + Wheel` },
        { label: "Open tagged tabs panel", value: panelShortcut },
        { label: "Open help", value: helpShortcut },
        { label: "Wheel down", value: settings.invertScroll ? "previous tab" : "next tab" },
        { label: "Wheel up", value: settings.invertScroll ? "next tab" : "previous tab" },
        { label: "Tag current tab", value: `${gestureModifier} + Left Click` },
        { label: "Remove current tag", value: `${gestureModifier} + Right Click` },
        { label: "Clear all tags", value: `${gestureModifier} + Middle Click, then Y` },
      ],
    },
    {
      title: "Cycling Rules",
      items: [
        { label: "No tagged tabs", value: "cycle all tabs left to right" },
        { label: "Tagged tabs exist", value: "cycle tagged tabs only" },
        { label: "Maximum tags", value: "15 per window" },
        { label: "Pinned tabs", value: "included" },
        { label: "Shortcuts", value: "change in extension settings" },
        { label: "Reserved shortcuts", value: "browser or OS shortcuts may not reach the page" },
      ],
    },
    {
      title: "Scroll Memory",
      items: [
        { label: "Tracked data", value: "scroll X / Y per tagged tab" },
        { label: "Saved when", value: "tagged page scrolls" },
        { label: "Restored when", value: "a tagged tab is activated" },
        { label: "Restricted pages", value: "can be tagged, but page scroll cannot be read" },
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
        <div class="ht-help-tip">Tab bar clicks cannot be intercepted by browser content scripts; use the toolbar popup for pages where in-page gestures are unavailable.</div>
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
