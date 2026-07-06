// This handler owns TabWheel messages only; unrelated runtime messages must
// keep flowing to later handlers through UNHANDLED.

import browser from "webextension-polyfill";
import { TabWheelDomain } from "../domains/tabWheelDomain";
import { RuntimeMessageHandler, UNHANDLED } from "./runtimeRouter";

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
      case "TABWHEEL_CONTENT_READY":
        return domain.markContentScriptReady(sender.tab);

      case "TABWHEEL_CYCLE":
        return await domain.cycle(message.direction, sender.tab);

      case "TABWHEEL_REFRESH_CURRENT_TAB":
        return await domain.refreshCurrentTab(sender.tab, message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_GET_OVERVIEW":
        return await domain.getOverview(sender.tab, message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_TOGGLE_CYCLE_SCOPE":
        return await domain.toggleCycleScope(sender.tab, message.windowId);

      case "TABWHEEL_SET_CYCLE_SCOPE":
        return await domain.setCycleScope(message.cycleScope, sender.tab, message.windowId, {
          suppressPageStatus: message.suppressPageStatus,
        });

      case "TABWHEEL_OPEN_SEARCH_TAB":
        return await domain.openSearchTab(message.query, sender.tab, message.windowId);

      case "TABWHEEL_GET_SEARCH_SUGGESTIONS":
        return await domain.getSearchSuggestions(message.query, message.mode, sender.tab);

      case "TABWHEEL_ACTIVATE_TAB":
        return await domain.activateExistingTab(message.tabId);

      case "TABWHEEL_OPEN_URL_TAB":
        return await domain.openUrlTab(message.url, sender.tab, message.windowId);

      case "TABWHEEL_OPEN_NATIVE_NEW_TAB":
        return await domain.openNativeNewTab(sender.tab, message.windowId);

      case "TABWHEEL_ACTIVATE_MOST_RECENT_TAB":
        return await domain.activateMostRecentTab(sender.tab, message.windowId);

      case "TABWHEEL_CLOSE_CURRENT_TAB_AND_ACTIVATE_RECENT":
        return await domain.closeCurrentTabAndActivateRecent(sender.tab, message.windowId);

      case "TABWHEEL_DUPLICATE_TAB":
        return await domain.duplicateTab(sender.tab, message.windowId);

      case "TABWHEEL_SAVE_SCROLL_POSITION": {
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        if (tabId == null || windowId == null) return { ok: false, reason: "No sender tab" };
        return await domain.saveScrollPosition(
          tabId,
          windowId,
          sender.tab?.url,
          message,
        );
      }

      case "TABWHEEL_OPEN_OPTIONS":
        return await openOptionsPage();

      case "TABWHEEL_RESET_STATE":
        return await domain.resetState();

      case "TABWHEEL_ACTIVATE_CONTENT_SCRIPTS":
        return await domain.activateExistingContentScripts();

      default:
        return UNHANDLED;
    }
  };
}
