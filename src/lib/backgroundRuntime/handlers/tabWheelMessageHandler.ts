import browser from "webextension-polyfill";
import { TabWheelDomain } from "../domains/tabWheelDomain";
import { RuntimeMessageHandler, UNHANDLED } from "./runtimeRouter";

async function openHelpInActiveTab(): Promise<TabWheelActionResult> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) {
    return { ok: false, reason: "No active tab" };
  }
  try {
    await browser.tabs.sendMessage(tab.id, { type: "OPEN_TABWHEEL_HELP" });
    return { ok: true };
  } catch (_) {
    return { ok: false, reason: "Help is unavailable on this page" };
  }
}

async function openOptionsPage(): Promise<TabWheelActionResult> {
  try {
    await browser.runtime.openOptionsPage();
    return { ok: true };
  } catch (_) {
    return { ok: false, reason: "Settings unavailable" };
  }
}

export function createTabWheelMessageHandler(
  domain: TabWheelDomain,
): RuntimeMessageHandler {
  return async (message, sender) => {
    switch (message.type) {
      case "TABWHEEL_CYCLE":
        return await domain.cycle(message.direction, sender.tab);

      case "TABWHEEL_GET_OVERVIEW":
        return await domain.getOverview(sender.tab, message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_SAVE_SCROLL_POSITION": {
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        if (tabId == null || windowId == null) return { ok: false, reason: "No sender tab" };
        return await domain.saveScrollPosition(
          tabId,
          windowId,
          message.scrollX,
          message.scrollY,
        );
      }

      case "TABWHEEL_OPEN_HELP":
        return await openHelpInActiveTab();

      case "TABWHEEL_OPEN_OPTIONS":
        return await openOptionsPage();

      default:
        return UNHANDLED;
    }
  };
}
