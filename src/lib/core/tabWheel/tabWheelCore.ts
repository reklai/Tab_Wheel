export function resolveWheelDirection(
  wheelDeltaY: number,
  invertScroll: boolean,
): "prev" | "next" {
  const normalDirection = wheelDeltaY > 0 ? "next" : "prev";
  if (!invertScroll) return normalDirection;
  return normalDirection === "next" ? "prev" : "next";
}

export function resolveCycleTargetIndex(
  allTabIndices: number[],
  taggedTabIndices: number[],
  currentTabIndex: number,
  direction: "prev" | "next",
): number {
  const candidates = taggedTabIndices.length > 0
    ? taggedTabIndices.slice().sort((left, right) => left - right)
    : allTabIndices.slice().sort((left, right) => left - right);

  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];

  if (direction === "next") {
    return candidates.find((index) => index > currentTabIndex) ?? candidates[0];
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    if (candidates[i] < currentTabIndex) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
