import { sendRuntimeMessage, sendRuntimeMessageWithRetry, RuntimeRetryPolicy } from "./runtimeClient";

export function getCurrentTabWheelState(): Promise<TabWheelCurrentState> {
  return sendRuntimeMessage<TabWheelCurrentState>({ type: "TABWHEEL_GET_CURRENT_STATE" });
}

export function getCurrentTabWheelStateWithRetry(
  policy: RuntimeRetryPolicy = { retryDelaysMs: [0, 90, 240, 450] },
): Promise<TabWheelCurrentState> {
  return sendRuntimeMessageWithRetry<TabWheelCurrentState>(
    { type: "TABWHEEL_GET_CURRENT_STATE" },
    policy,
  );
}

export function listTaggedTabs(windowId?: number): Promise<TaggedTabEntry[]> {
  return sendRuntimeMessage<TaggedTabEntry[]>({ type: "TABWHEEL_LIST", windowId });
}

export function listTaggedTabsWithRetry(
  windowId?: number,
  policy: RuntimeRetryPolicy = { retryDelaysMs: [0, 90, 240, 450] },
): Promise<TaggedTabEntry[]> {
  return sendRuntimeMessageWithRetry<TaggedTabEntry[]>(
    { type: "TABWHEEL_LIST", windowId },
    policy,
  );
}

export function tagCurrentTab(windowId?: number): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({ type: "TABWHEEL_TAG_CURRENT", windowId });
}

export function removeCurrentTabTag(windowId?: number): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({ type: "TABWHEEL_REMOVE_CURRENT", windowId });
}

export function removeTaggedTab(
  tabId: number,
  windowId?: number,
): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({
    type: "TABWHEEL_REMOVE_TAB",
    tabId,
    windowId,
  });
}

export function clearTaggedTabs(windowId?: number): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({ type: "TABWHEEL_CLEAR_WINDOW", windowId });
}

export function activateTaggedTab(
  tabId: number,
  windowId?: number,
): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({
    type: "TABWHEEL_ACTIVATE",
    tabId,
    windowId,
  });
}

export function cycleTabWheel(
  direction: "prev" | "next",
): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({
    type: "TABWHEEL_CYCLE",
    direction,
  });
}

export function saveTaggedTabScrollPosition(
  scrollX: number,
  scrollY: number,
): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({
    type: "TABWHEEL_SAVE_SCROLL_POSITION",
    scrollX,
    scrollY,
  });
}

export function openTabWheelHelp(): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({ type: "TABWHEEL_OPEN_HELP" });
}

export function openTabWheelOptions(): Promise<TabWheelMutationResult> {
  return sendRuntimeMessage<TabWheelMutationResult>({ type: "TABWHEEL_OPEN_OPTIONS" });
}
