import { sendRuntimeMessage, sendRuntimeMessageWithRetry, RuntimeRetryPolicy } from "./runtimeClient";

export function getTabWheelOverview(windowId?: number): Promise<TabWheelOverview> {
  return sendRuntimeMessage<TabWheelOverview>({ type: "TABWHEEL_GET_OVERVIEW", windowId });
}

export function getTabWheelOverviewWithRetry(
  windowId?: number,
  policy: RuntimeRetryPolicy = { retryDelaysMs: [0, 90, 240, 450] },
): Promise<TabWheelOverview> {
  return sendRuntimeMessageWithRetry<TabWheelOverview>(
    { type: "TABWHEEL_GET_OVERVIEW", windowId },
    policy,
  );
}

export function cycleTabWheel(
  direction: "prev" | "next",
): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_CYCLE",
    direction,
  });
}

export function refreshCurrentTabWheel(windowId?: number): Promise<TabWheelRefreshResult> {
  return sendRuntimeMessage<TabWheelRefreshResult>({
    type: "TABWHEEL_REFRESH_CURRENT_TAB",
    windowId,
  });
}

export function toggleCurrentTabWheelTag(windowId?: number): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_TOGGLE_CURRENT_TAG",
    windowId,
  });
}

export function removeTaggedTabWheelTab(
  tabId: number,
  windowId?: number,
): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_REMOVE_TAGGED_TAB",
    tabId,
    windowId,
  });
}

export function clearTaggedTabWheelTabs(windowId?: number): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_CLEAR_TAGGED_TABS",
    windowId,
  });
}

export function listTaggedTabWheelTabs(windowId?: number): Promise<TabWheelTaggedTabEntry[]> {
  return sendRuntimeMessage<TabWheelTaggedTabEntry[]>({
    type: "TABWHEEL_LIST_TAGGED_TABS",
    windowId,
  });
}

export function activateTaggedTabWheelTab(
  tabId: number,
  windowId?: number,
): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_ACTIVATE_TAGGED_TAB",
    tabId,
    windowId,
  });
}

export function toggleTabWheelCycleScope(windowId?: number): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_TOGGLE_CYCLE_SCOPE",
    windowId,
  });
}

export function setTabWheelCycleScope(
  cycleScope: TabWheelCycleScope,
  windowId?: number,
  options: TabWheelStatusOptions = {},
): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_SET_CYCLE_SCOPE",
    cycleScope,
    windowId,
    suppressPageStatus: options.suppressPageStatus,
  });
}

export function fetchTabWheelFaviconData(href: string): Promise<TabWheelFaviconFetchResult> {
  return sendRuntimeMessage<TabWheelFaviconFetchResult>({
    type: "TABWHEEL_FETCH_FAVICON",
    href,
  });
}

export function saveTabWheelScrollPosition(
  scrollX: number,
  scrollY: number,
): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({
    type: "TABWHEEL_SAVE_SCROLL_POSITION",
    scrollX,
    scrollY,
  });
}

export function openTabWheelHelp(): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({ type: "TABWHEEL_OPEN_HELP" });
}

export function openTabWheelOptions(): Promise<TabWheelActionResult> {
  return sendRuntimeMessage<TabWheelActionResult>({ type: "TABWHEEL_OPEN_OPTIONS" });
}
