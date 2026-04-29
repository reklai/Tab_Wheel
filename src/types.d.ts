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

interface TaggedTabEntry {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  pinned: boolean;
  scrollX: number;
  scrollY: number;
  createdAt: number;
  updatedAt: number;
}

type TabWheelModifierKey = "alt" | "ctrl" | "meta";

interface TabWheelSettings {
  invertScroll: boolean;
  gestureModifier: TabWheelModifierKey;
  gestureWithShift: boolean;
  panelModifier: TabWheelModifierKey;
  panelWithShift: boolean;
  panelKey: string;
  helpModifier: TabWheelModifierKey;
  helpWithShift: boolean;
  helpKey: string;
}

interface TabWheelMutationResult {
  ok: boolean;
  reason?: string;
  entry?: TaggedTabEntry;
  count?: number;
  alreadyTagged?: boolean;
}

interface TabWheelCurrentState {
  isTagged: boolean;
  count: number;
  entry?: TaggedTabEntry;
}
