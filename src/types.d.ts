// Shared project type declarations

// Allow importing .css files as text (esbuild text loader)
declare module "*.css" {
  const content: string;
  export default content;
}

interface ScrollData {
  scrollX: number;
  scrollY: number;
}

interface TabWheelScrollMemoryEntry {
  tabId: number;
  windowId: number;
  scrollX: number;
  scrollY: number;
  updatedAt: number;
}

type TabWheelModifierKey = "alt" | "ctrl" | "meta";
type TabWheelCycleOrder = "strip" | "mru";

interface TabWheelSettings {
  invertScroll: boolean;
  gestureModifier: TabWheelModifierKey;
  gestureWithShift: boolean;
  allowGesturesInEditableFields: boolean;
  cycleOrder: TabWheelCycleOrder;
  skipPinnedTabs: boolean;
  wrapAround: boolean;
  wheelSensitivity: number;
  wheelCooldownMs: number;
  wheelAcceleration: boolean;
}

interface TabWheelActionResult {
  ok: boolean;
  reason?: string;
}

interface TabWheelOverview {
  activeIndex: number;
  tabCount: number;
  cycleOrder: TabWheelCycleOrder;
}
