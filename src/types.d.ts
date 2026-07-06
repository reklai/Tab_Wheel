// Shared project type declarations

// Allow importing .css files as text (esbuild text loader)
declare module "*.css" {
  const content: string;
  export default content;
}

interface ScrollData {
  scrollX: number;
  scrollY: number;
  scrollRatioX: number;
  scrollRatioY: number;
  scrollWidth: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface TabWheelScrollMemoryEntry {
  tabId: number;
  windowId: number;
  url: string;
  scrollX: number;
  scrollY: number;
  scrollRatioX: number;
  scrollRatioY: number;
  scrollWidth: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  updatedAt: number;
}

type TabWheelModifierKey = "alt" | "ctrl" | "meta";
type TabWheelCycleScope = "general" | "mru";
type TabWheelPreset = "precise" | "balanced" | "fast" | "custom";
type TabWheelContentScriptStatus = "ready" | "unavailable";
type TabWheelClickAction = "search" | "nativeNewTab" | "recentTab" | "closeToRecent" | "duplicateTab" | "openSettings" | "none";

type TabWheelMruState = Record<string, number[]>;

// Search palette: which source a suggestion request (and each result) draws on.
// "recent" = the user's own past queries; "tab" = currently open tabs.
type TabWheelSearchMode = "recent" | "tab";

interface TabWheelSuggestionItem {
  source: TabWheelSearchMode;
  primary: string;
  secondary?: string;
  positions: number[];
  tabId?: number;
  windowId?: number;
  favIconUrl?: string;
}

interface TabWheelSuggestionsResult {
  ok: boolean;
  reason?: string;
  mode: TabWheelSearchMode;
  items: TabWheelSuggestionItem[];
}

interface TabWheelSettings {
  invertScroll: boolean;
  gestureModifier: TabWheelModifierKey;
  gestureWithShift: boolean;
  allowGesturesInEditableFields: boolean;
  leftClickAction: TabWheelClickAction;
  middleClickAction: TabWheelClickAction;
  rightClickAction: TabWheelClickAction;
  cycleScope: TabWheelCycleScope;
  skipPinnedTabs: boolean;
  skipRestrictedPages: boolean;
  skipHiddenTabs: boolean;
  wrapAround: boolean;
  wheelPreset: TabWheelPreset;
  wheelSensitivity: number;
  wheelCooldownMs: number;
  pageScrollSpeedMultiplier: number;
  pageScrollViewportCapRatio: number;
  wheelAcceleration: boolean;
  horizontalWheel: boolean;
  overshootGuard: boolean;
}

interface TabWheelActionResult {
  ok: boolean;
  reason?: string;
  count?: number;
  tabId?: number;
  cycleScope?: TabWheelCycleScope;
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
  contentScriptStatus: TabWheelContentScriptStatus;
}
