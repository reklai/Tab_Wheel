import browser from "webextension-polyfill";
import { TabWheelDomain } from "../domains/tabWheelDomain";
import { RuntimeMessageHandler, UNHANDLED } from "./runtimeRouter";

async function openHelpInActiveTab(): Promise<TabWheelMutationResult> {
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

async function openOptionsPage(): Promise<TabWheelMutationResult> {
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
      case "TABWHEEL_GET_CURRENT_STATE":
        return await domain.getCurrentState(sender.tab);

      case "TABWHEEL_TAG_CURRENT":
        return await domain.tagCurrent(sender.tab, message.windowId);

      case "TABWHEEL_REMOVE_CURRENT":
        return await domain.removeCurrent(sender.tab, message.windowId);

      case "TABWHEEL_REMOVE_TAB":
        return await domain.removeTab(
          message.tabId,
          message.windowId ?? sender.tab?.windowId,
        );

      case "TABWHEEL_CLEAR_WINDOW":
        return await domain.clearWindow(message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_LIST":
        return await domain.list(message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_ACTIVATE":
        return await domain.activate(
          message.tabId,
          message.windowId ?? sender.tab?.windowId,
        );

      case "TABWHEEL_CYCLE":
        return await domain.cycle(message.direction, sender.tab);

      case "TABWHEEL_SAVE_SCROLL_POSITION": {
        const tabId = sender.tab?.id;
        if (tabId == null) return { ok: false, reason: "No sender tab" };
        return await domain.saveScrollPosition(
          tabId,
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
