// The overlay modules import CSS as raw text so the content script can inject it
// into a shadow root instead of depending on page-level stylesheets.
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

// "recent" is the blended default source. The other modes are explicit palette
// filters and must stay in sync with searchLauncher.ts command parsing.
type TabWheelSearchMode = "recent" | "tab" | "hist" | "book";

interface TabWheelSuggestionItem {
  source: TabWheelSearchMode;
  primary: string;
  secondary?: string;
  positions: number[];
  tabId?: number;
  windowId?: number;
  favIconUrl?: string;
  url?: string;
}

interface TabWheelSuggestionsResult {
  ok: boolean;
  reason?: string;
  mode: TabWheelSearchMode;
  items: TabWheelSuggestionItem[];
}

interface TabWheelContentScriptActivationResult {
  attempted: number;
  injected: number;
  skipped: number;
  failed: number;
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
