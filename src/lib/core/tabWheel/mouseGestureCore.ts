export type TabWheelMouseGestureAction = "search" | "recentTab" | "closeToRecent";
export type TabWheelMouseGestureRunPhase = "sessionStart" | "auxclick" | "contextmenu";
export type TabWheelMouseGestureEventType = "click" | "auxclick" | "contextmenu";

export interface TabWheelMouseGesturePolicy {
  action: TabWheelMouseGestureAction;
  button: number;
  runPhase: TabWheelMouseGestureRunPhase;
  finishEvents: readonly TabWheelMouseGestureEventType[];
}

export interface TabWheelMouseGestureSession {
  policy: TabWheelMouseGesturePolicy;
  hasRun: boolean;
  startedAt: number;
}

export interface TabWheelMouseGestureEvent {
  type: string;
  button: number;
}

export const MOUSE_GESTURE_CLAIM_MS = 900;

export const MOUSE_GESTURE_POLICIES: readonly TabWheelMouseGesturePolicy[] = [
  {
    action: "search",
    button: 0,
    runPhase: "sessionStart",
    finishEvents: ["click"],
  },
  {
    action: "recentTab",
    button: 1,
    runPhase: "auxclick",
    finishEvents: ["auxclick"],
  },
  {
    action: "closeToRecent",
    button: 2,
    runPhase: "contextmenu",
    finishEvents: ["click", "auxclick", "contextmenu"],
  },
];

export function resolveMouseGesturePolicy(
  button: number,
  policies: readonly TabWheelMouseGesturePolicy[] = MOUSE_GESTURE_POLICIES,
): TabWheelMouseGesturePolicy | null {
  return policies.find((policy) => policy.button === button) || null;
}

export function isMouseGestureStartEventType(eventType: string): boolean {
  return eventType === "pointerdown" || eventType === "mousedown";
}

export function isMouseGestureSessionStartEventType(eventType: string): boolean {
  return isMouseGestureStartEventType(eventType)
    || eventType === "click"
    || eventType === "contextmenu"
    || eventType === "auxclick";
}

export function createMouseGestureSession(
  policy: TabWheelMouseGesturePolicy,
  startedAt: number,
): TabWheelMouseGestureSession {
  return {
    policy,
    hasRun: false,
    startedAt,
  };
}

export function isMouseGestureSessionExpired(
  session: TabWheelMouseGestureSession,
  now: number,
  claimMs = MOUSE_GESTURE_CLAIM_MS,
): boolean {
  return now - session.startedAt > claimMs;
}

export function isMouseGestureEventForSession(
  session: TabWheelMouseGestureSession,
  event: TabWheelMouseGestureEvent,
): boolean {
  if (event.type === "contextmenu" && session.policy.button === 2) return true;
  return event.button === session.policy.button;
}

export function shouldRunMouseGestureSession(
  session: TabWheelMouseGestureSession,
  eventType: string,
): boolean {
  if (session.hasRun) return false;
  return session.policy.runPhase === "sessionStart" || eventType === session.policy.runPhase;
}

export function isMouseGestureFinishEventType(eventType: string): eventType is TabWheelMouseGestureEventType {
  return eventType === "click" || eventType === "auxclick" || eventType === "contextmenu";
}

export function shouldFinishMouseGestureSession(
  session: TabWheelMouseGestureSession,
  eventType: string,
): boolean {
  return isMouseGestureFinishEventType(eventType)
    && session.policy.finishEvents.includes(eventType);
}
