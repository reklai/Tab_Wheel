import browser from "webextension-polyfill";

export const MAX_TAGGED_TABS = 15;
export const TABWHEEL_STORAGE_KEYS = {
  taggedTabs: "tabWheelTaggedTabs",
  settings: "tabWheelSettings",
} as const;
export const TABWHEEL_MODIFIER_KEYS: readonly TabWheelModifierKey[] = [
  "alt",
  "ctrl",
  "meta",
] as const;
export const TABWHEEL_PANEL_KEY_OPTIONS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

export const DEFAULT_TABWHEEL_SETTINGS: TabWheelSettings = {
  invertScroll: false,
  gestureModifier: "alt",
  gestureWithShift: false,
  panelModifier: "alt",
  panelWithShift: false,
  panelKey: "t",
  helpModifier: "alt",
  helpWithShift: false,
  helpKey: "m",
};

function normalizeModifierKey(
  value: unknown,
  fallback: TabWheelModifierKey,
): TabWheelModifierKey {
  return TABWHEEL_MODIFIER_KEYS.includes(value as TabWheelModifierKey)
    ? value as TabWheelModifierKey
    : fallback;
}

function normalizeShortcutKey(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const key = value.trim().toLowerCase();
  return /^[a-z0-9]$/.test(key) ? key : fallback;
}

function normalizeShiftRequirement(value: unknown): boolean {
  return value === true;
}

export function normalizeTabWheelSettings(
  value: unknown,
): TabWheelSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_TABWHEEL_SETTINGS };
  }
  const settings = value as Partial<TabWheelSettings>;
  return {
    invertScroll: settings.invertScroll === true,
    gestureModifier: normalizeModifierKey(
      settings.gestureModifier,
      DEFAULT_TABWHEEL_SETTINGS.gestureModifier,
    ),
    gestureWithShift: normalizeShiftRequirement(settings.gestureWithShift),
    panelModifier: normalizeModifierKey(
      settings.panelModifier,
      DEFAULT_TABWHEEL_SETTINGS.panelModifier,
    ),
    panelWithShift: normalizeShiftRequirement(settings.panelWithShift),
    panelKey: normalizeShortcutKey(
      settings.panelKey,
      DEFAULT_TABWHEEL_SETTINGS.panelKey,
    ),
    helpModifier: normalizeModifierKey(
      settings.helpModifier,
      DEFAULT_TABWHEEL_SETTINGS.helpModifier,
    ),
    helpWithShift: normalizeShiftRequirement(settings.helpWithShift),
    helpKey: normalizeShortcutKey(
      settings.helpKey,
      DEFAULT_TABWHEEL_SETTINGS.helpKey,
    ),
  };
}

export function formatTabWheelModifierKey(modifier: TabWheelModifierKey): string {
  if (modifier === "ctrl") return "Ctrl";
  if (modifier === "meta") return "Meta";
  return "Alt";
}

export function formatTabWheelModifierCombo(
  modifier: TabWheelModifierKey,
  withShift: boolean,
): string {
  const baseModifier = formatTabWheelModifierKey(modifier);
  return withShift ? `${baseModifier} + Shift` : baseModifier;
}

export function formatTabWheelPanelKey(key: string): string {
  return normalizeShortcutKey(key, DEFAULT_TABWHEEL_SETTINGS.panelKey).toUpperCase();
}

export function formatTabWheelPanelShortcut(settings: TabWheelSettings): string {
  return `${formatTabWheelModifierCombo(settings.panelModifier, settings.panelWithShift)} + ${formatTabWheelPanelKey(settings.panelKey)}`;
}

export function formatTabWheelHelpKey(key: string): string {
  return normalizeShortcutKey(key, DEFAULT_TABWHEEL_SETTINGS.helpKey).toUpperCase();
}

export function formatTabWheelHelpShortcut(settings: TabWheelSettings): string {
  return `${formatTabWheelModifierCombo(settings.helpModifier, settings.helpWithShift)} + ${formatTabWheelHelpKey(settings.helpKey)}`;
}

export async function loadTabWheelSettings(): Promise<TabWheelSettings> {
  try {
    const data = await browser.storage.local.get(TABWHEEL_STORAGE_KEYS.settings);
    return normalizeTabWheelSettings(data[TABWHEEL_STORAGE_KEYS.settings]);
  } catch (_) {
    return { ...DEFAULT_TABWHEEL_SETTINGS };
  }
}

export async function saveTabWheelSettings(
  settings: TabWheelSettings,
): Promise<void> {
  await browser.storage.local.set({
    [TABWHEEL_STORAGE_KEYS.settings]: normalizeTabWheelSettings(settings),
  });
}
