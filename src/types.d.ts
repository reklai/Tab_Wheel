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
  url: string;
  scrollX: number;
  scrollY: number;
  updatedAt: number;
}

interface TabWheelTaggedTabEntry {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

type TabWheelModifierKey = "alt" | "ctrl" | "meta";
type TabWheelCycleScope = "general" | "tagged";
type TabWheelPreset = "precise" | "balanced" | "fast" | "custom";
type TabWheelContentScriptStatus = "ready" | "unavailable";

interface TabWheelSettings {
  invertScroll: boolean;
  gestureModifier: TabWheelModifierKey;
  gestureWithShift: boolean;
  allowGesturesInEditableFields: boolean;
  cycleScope: TabWheelCycleScope;
  skipPinnedTabs: boolean;
  wrapAround: boolean;
  wheelPreset: TabWheelPreset;
  wheelSensitivity: number;
  wheelCooldownMs: number;
  wheelAcceleration: boolean;
  horizontalWheel: boolean;
  overshootGuard: boolean;
}

interface TabWheelActionResult {
  ok: boolean;
  reason?: string;
  entry?: TabWheelTaggedTabEntry;
  count?: number;
  alreadyTagged?: boolean;
  isCurrentTagged?: boolean;
  cycleScope?: TabWheelCycleScope;
}

interface TabWheelFaviconFetchResult extends TabWheelActionResult {
  dataUrl?: string;
}

interface TabWheelRefreshResult extends TabWheelActionResult {
  overview?: TabWheelOverview;
  contentScriptStatus: TabWheelContentScriptStatus;
  injected?: boolean;
}

interface TabWheelStatusOptions {
  suppressPageStatus?: boolean;
}

interface TabWheelOverview {
  activeIndex: number;
  activeTabId?: number;
  tabCount: number;
  cycleScope: TabWheelCycleScope;
  taggedCount: number;
  isCurrentTagged: boolean;
  taggedTabs: TabWheelTaggedTabEntry[];
  contentScriptStatus: TabWheelContentScriptStatus;
}
