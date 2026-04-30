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
