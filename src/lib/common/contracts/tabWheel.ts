import browser from "webextension-polyfill";

export const MAX_SCROLL_MEMORY_ENTRIES = 300;
export const MAX_MRU_TABS = 100;
export const TABWHEEL_STORAGE_KEYS = {
  settings: "tabWheelSettings",
  scrollMemory: "tabWheelScrollMemory",
  mruState: "tabWheelMruState",
} as const;
export const TABWHEEL_MODIFIER_KEYS: readonly TabWheelModifierKey[] = [
  "alt",
  "ctrl",
  "meta",
] as const;
export const TABWHEEL_CYCLE_SCOPES: readonly TabWheelCycleScope[] = ["general", "mru"];
export const TABWHEEL_PRESETS: readonly TabWheelPreset[] = ["precise", "balanced", "fast", "custom"];
export const MIN_WHEEL_SENSITIVITY = 0.5;
export const MAX_WHEEL_SENSITIVITY = 2;
export const MIN_WHEEL_COOLDOWN_MS = 60;
export const MAX_WHEEL_COOLDOWN_MS = 400;
export const MIN_PAGE_SCROLL_SPEED_MULTIPLIER = 0.5;
export const MAX_PAGE_SCROLL_SPEED_MULTIPLIER = 3;
export const MIN_PAGE_SCROLL_VIEWPORT_CAP_RATIO = 0.1;
export const MAX_PAGE_SCROLL_VIEWPORT_CAP_RATIO = 1;
export const GOOGLE_SEARCH_URL_TEMPLATE = "https://www.google.com/search?q=%s";
export const MAX_SEARCH_QUERY_LENGTH = 512;

export const TABWHEEL_PRESET_VALUES: Record<Exclude<TabWheelPreset, "custom">, {
  wheelSensitivity: number;
  wheelCooldownMs: number;
  pageScrollSpeedMultiplier: number;
  pageScrollViewportCapRatio: number;
  wheelAcceleration: boolean;
  overshootGuard: boolean;
}> = {
  precise: {
    wheelSensitivity: 0.8,
    wheelCooldownMs: 220,
    pageScrollSpeedMultiplier: 0.8,
    pageScrollViewportCapRatio: 0.35,
    wheelAcceleration: false,
    overshootGuard: true,
  },
  balanced: {
    wheelSensitivity: 1,
    wheelCooldownMs: 160,
    pageScrollSpeedMultiplier: 1,
    pageScrollViewportCapRatio: 1,
    wheelAcceleration: false,
    overshootGuard: true,
  },
  fast: {
    wheelSensitivity: 1.35,
    wheelCooldownMs: 90,
    pageScrollSpeedMultiplier: 1.4,
    pageScrollViewportCapRatio: 1,
    wheelAcceleration: true,
    overshootGuard: true,
  },
};

export const DEFAULT_TABWHEEL_SETTINGS: TabWheelSettings = {
  invertScroll: false,
  gestureModifier: "alt",
  gestureWithShift: false,
  allowGesturesInEditableFields: true,
  openNativeNewTabOnLeftClick: false,
  cycleScope: "general",
  skipPinnedTabs: false,
  skipRestrictedPages: true,
  wrapAround: true,
  wheelPreset: "balanced",
  wheelSensitivity: 1,
  wheelCooldownMs: 160,
  pageScrollSpeedMultiplier: 1,
  pageScrollViewportCapRatio: 1,
  wheelAcceleration: false,
  horizontalWheel: true,
  overshootGuard: true,
};

function normalizeModifierKey(
  value: unknown,
  fallback: TabWheelModifierKey,
): TabWheelModifierKey {
  return TABWHEEL_MODIFIER_KEYS.includes(value as TabWheelModifierKey)
    ? value as TabWheelModifierKey
    : fallback;
}

function normalizeShiftRequirement(value: unknown): boolean {
  return value === true;
}

function normalizeEnabledFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function buildSearchUrl(query: string): string {
  return GOOGLE_SEARCH_URL_TEMPLATE.replaceAll("%s", encodeURIComponent(normalizeSearchQuery(query)));
}

export function normalizeTabWheelCycleScope(value: unknown): TabWheelCycleScope {
  return TABWHEEL_CYCLE_SCOPES.includes(value as TabWheelCycleScope)
    ? value as TabWheelCycleScope
    : DEFAULT_TABWHEEL_SETTINGS.cycleScope;
}

function normalizeWheelPreset(value: unknown): TabWheelPreset {
  return TABWHEEL_PRESETS.includes(value as TabWheelPreset)
    ? value as TabWheelPreset
    : DEFAULT_TABWHEEL_SETTINGS.wheelPreset;
}

export function detectTabWheelPreset(settings: Pick<
  TabWheelSettings,
  | "wheelSensitivity"
  | "wheelCooldownMs"
  | "pageScrollSpeedMultiplier"
  | "pageScrollViewportCapRatio"
  | "wheelAcceleration"
  | "overshootGuard"
>): TabWheelPreset {
  for (const preset of ["precise", "balanced", "fast"] as const) {
    const presetValues = TABWHEEL_PRESET_VALUES[preset];
    if (
      settings.wheelSensitivity === presetValues.wheelSensitivity
      && settings.wheelCooldownMs === presetValues.wheelCooldownMs
      && settings.pageScrollSpeedMultiplier === presetValues.pageScrollSpeedMultiplier
      && settings.pageScrollViewportCapRatio === presetValues.pageScrollViewportCapRatio
      && settings.wheelAcceleration === presetValues.wheelAcceleration
      && settings.overshootGuard === presetValues.overshootGuard
    ) {
      return preset;
    }
  }
  return "custom";
}

export function applyTabWheelPreset(
  settings: TabWheelSettings,
  preset: TabWheelPreset,
): TabWheelSettings {
  if (preset === "custom") return { ...settings, wheelPreset: "custom" };
  return {
    ...settings,
    ...TABWHEEL_PRESET_VALUES[preset],
    wheelPreset: preset,
  };
}

export function normalizeTabWheelSettings(
  value: unknown,
): TabWheelSettings {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_TABWHEEL_SETTINGS };
  }
  const settings = value as Partial<TabWheelSettings>;
  const normalizedSettings = {
    invertScroll: settings.invertScroll === true,
    gestureModifier: normalizeModifierKey(
      settings.gestureModifier,
      DEFAULT_TABWHEEL_SETTINGS.gestureModifier,
    ),
    gestureWithShift: normalizeShiftRequirement(settings.gestureWithShift),
    allowGesturesInEditableFields: normalizeEnabledFlag(
      settings.allowGesturesInEditableFields,
      DEFAULT_TABWHEEL_SETTINGS.allowGesturesInEditableFields,
    ),
    openNativeNewTabOnLeftClick: normalizeEnabledFlag(
      settings.openNativeNewTabOnLeftClick,
      DEFAULT_TABWHEEL_SETTINGS.openNativeNewTabOnLeftClick,
    ),
    cycleScope: normalizeTabWheelCycleScope(settings.cycleScope),
    skipPinnedTabs: normalizeEnabledFlag(
      settings.skipPinnedTabs,
      DEFAULT_TABWHEEL_SETTINGS.skipPinnedTabs,
    ),
    skipRestrictedPages: normalizeEnabledFlag(
      settings.skipRestrictedPages,
      DEFAULT_TABWHEEL_SETTINGS.skipRestrictedPages,
    ),
    wrapAround: normalizeEnabledFlag(
      settings.wrapAround,
      DEFAULT_TABWHEEL_SETTINGS.wrapAround,
    ),
    wheelPreset: normalizeWheelPreset(settings.wheelPreset),
    wheelSensitivity: normalizeNumberInRange(
      settings.wheelSensitivity,
      DEFAULT_TABWHEEL_SETTINGS.wheelSensitivity,
      MIN_WHEEL_SENSITIVITY,
      MAX_WHEEL_SENSITIVITY,
    ),
    wheelCooldownMs: normalizeNumberInRange(
      settings.wheelCooldownMs,
      DEFAULT_TABWHEEL_SETTINGS.wheelCooldownMs,
      MIN_WHEEL_COOLDOWN_MS,
      MAX_WHEEL_COOLDOWN_MS,
    ),
    pageScrollSpeedMultiplier: normalizeNumberInRange(
      settings.pageScrollSpeedMultiplier,
      DEFAULT_TABWHEEL_SETTINGS.pageScrollSpeedMultiplier,
      MIN_PAGE_SCROLL_SPEED_MULTIPLIER,
      MAX_PAGE_SCROLL_SPEED_MULTIPLIER,
    ),
    pageScrollViewportCapRatio: normalizeNumberInRange(
      settings.pageScrollViewportCapRatio,
      DEFAULT_TABWHEEL_SETTINGS.pageScrollViewportCapRatio,
      MIN_PAGE_SCROLL_VIEWPORT_CAP_RATIO,
      MAX_PAGE_SCROLL_VIEWPORT_CAP_RATIO,
    ),
    wheelAcceleration: normalizeEnabledFlag(
      settings.wheelAcceleration,
      DEFAULT_TABWHEEL_SETTINGS.wheelAcceleration,
    ),
    horizontalWheel: normalizeEnabledFlag(
      settings.horizontalWheel,
      DEFAULT_TABWHEEL_SETTINGS.horizontalWheel,
    ),
    overshootGuard: normalizeEnabledFlag(
      settings.overshootGuard,
      DEFAULT_TABWHEEL_SETTINGS.overshootGuard,
    ),
  };
  normalizedSettings.wheelPreset = settings.wheelPreset == null
    ? detectTabWheelPreset(normalizedSettings)
    : normalizedSettings.wheelPreset;
  return normalizedSettings;
}

export function formatTabWheelModifierKey(modifier: TabWheelModifierKey): string {
  if (modifier === "ctrl") return "Ctrl / Control";
  if (modifier === "meta") return "Meta / Command";
  return "Alt / Option";
}

export function formatTabWheelModifierCombo(
  modifier: TabWheelModifierKey,
  withShift: boolean,
): string {
  const baseModifier = formatTabWheelModifierKey(modifier);
  return withShift ? `${baseModifier} + Shift` : baseModifier;
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
