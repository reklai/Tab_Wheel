export function resolveWheelDirection(
  wheelDeltaY: number,
  invertScroll: boolean,
): "prev" | "next" {
  const normalDirection = wheelDeltaY > 0 ? "next" : "prev";
  if (!invertScroll) return normalDirection;
  return normalDirection === "next" ? "prev" : "next";
}

export function resolveCycleTargetIndex(
  tabIndices: number[],
  currentTabIndex: number,
  direction: "prev" | "next",
  wrapAround: boolean,
): number {
  const candidates = tabIndices.slice().sort((left, right) => left - right);

  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];

  if (direction === "next") {
    const nextIndex = candidates.find((index) => index > currentTabIndex);
    if (nextIndex != null) return nextIndex;
    return wrapAround ? candidates[0] : currentTabIndex;
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i] < currentTabIndex) return candidates[i];
  }
  return wrapAround ? candidates[candidates.length - 1] : currentTabIndex;
}

export function normalizeWheelDeltaY(event: Pick<WheelEvent, "deltaMode" | "deltaY">, pageHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * pageHeight;
  return event.deltaY;
}

export function normalizeWheelDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
  pageHeight: number,
  pageWidth: number,
  horizontalWheel: boolean,
): number {
  const normalizedY = normalizeWheelDeltaY(event, pageHeight);
  if (!horizontalWheel) return normalizedY;
  const normalizedX = event.deltaMode === 1
    ? event.deltaX * 16
    : event.deltaMode === 2
      ? event.deltaX * pageWidth
      : event.deltaX;
  return Math.abs(normalizedX) > Math.abs(normalizedY) ? normalizedX : normalizedY;
}
