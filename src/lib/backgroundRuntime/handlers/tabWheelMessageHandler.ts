import browser from "webextension-polyfill";
import { TabWheelDomain } from "../domains/tabWheelDomain";
import { RuntimeMessageHandler, UNHANDLED } from "./runtimeRouter";

const MAX_FAVICON_BYTES = 512 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchFaviconData(href: string): Promise<TabWheelFaviconFetchResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(href);
  } catch (_) {
    return { ok: false, reason: "Invalid favicon URL" };
  }

  if (parsedUrl.protocol === "data:") {
    return parsedUrl.href.startsWith("data:image/")
      ? { ok: true, dataUrl: parsedUrl.href }
      : { ok: false, reason: "Unsupported favicon data URL" };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, reason: "Unsupported favicon URL" };
  }

  try {
    const response = await fetch(parsedUrl.href, {
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok) return { ok: false, reason: "Favicon fetch failed" };

    const blob = await response.blob();
    if (blob.size <= 0 || blob.size > MAX_FAVICON_BYTES) {
      return { ok: false, reason: "Favicon size unsupported" };
    }

    const mimeType = blob.type || response.headers.get("content-type") || "image/x-icon";
    if (!mimeType.toLowerCase().startsWith("image/")) {
      return { ok: false, reason: "Favicon type unsupported" };
    }

    const base64 = arrayBufferToBase64(await blob.arrayBuffer());
    return { ok: true, dataUrl: `data:${mimeType};base64,${base64}` };
  } catch (_) {
    return { ok: false, reason: "Favicon fetch failed" };
  }
}

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
      case "TABWHEEL_CONTENT_READY":
        return domain.markContentScriptReady(sender.tab);

      case "TABWHEEL_CYCLE":
        return await domain.cycle(message.direction, sender.tab);

      case "TABWHEEL_REFRESH_CURRENT_TAB":
        return await domain.refreshCurrentTab(sender.tab, message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_GET_OVERVIEW":
        return await domain.getOverview(sender.tab, message.windowId ?? sender.tab?.windowId);

      case "TABWHEEL_TOGGLE_CURRENT_TAG":
        return await domain.toggleCurrentTag(sender.tab, message.windowId);

      case "TABWHEEL_REMOVE_TAGGED_TAB":
        return await domain.removeTaggedTab(message.tabId, message.windowId);

      case "TABWHEEL_CLEAR_TAGGED_TABS":
        return await domain.clearTaggedTabs(message.windowId);

      case "TABWHEEL_LIST_TAGGED_TABS":
        return await domain.listTaggedTabs(message.windowId);

      case "TABWHEEL_ACTIVATE_TAGGED_TAB":
        return await domain.activateTaggedTab(message.tabId, message.windowId);

      case "TABWHEEL_TOGGLE_CYCLE_SCOPE":
        return await domain.toggleCycleScope(sender.tab, message.windowId);

      case "TABWHEEL_SET_CYCLE_SCOPE":
        return await domain.setCycleScope(message.cycleScope, sender.tab, message.windowId, {
          suppressPageStatus: message.suppressPageStatus,
        });

      case "TABWHEEL_OPEN_NEW_TAB_NEXT_TO_CURRENT":
        return await domain.openNewTabNextToCurrent(sender.tab, message.windowId);

      case "TABWHEEL_ACTIVATE_LAST_RECENT_TAB":
        return await domain.activateLastRecentTab(sender.tab, message.windowId);

      case "TABWHEEL_CLOSE_CURRENT_TAB_AND_ACTIVATE_LAST_RECENT":
        return await domain.closeCurrentTabAndActivateLastRecent(sender.tab, message.windowId);

      case "TABWHEEL_FETCH_FAVICON":
        return await fetchFaviconData(message.href);

      case "TABWHEEL_SAVE_SCROLL_POSITION": {
        const tabId = sender.tab?.id;
        const windowId = sender.tab?.windowId;
        if (tabId == null || windowId == null) return { ok: false, reason: "No sender tab" };
        return await domain.saveScrollPosition(
          tabId,
          windowId,
          sender.tab?.url,
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
