import browser from "webextension-polyfill";

export const MAX_SCROLL_MEMORY_ENTRIES = 300;
export const MAX_WHEEL_LIST_TABS = 15;
export const TABWHEEL_STORAGE_KEYS = {
  settings: "tabWheelSettings",
  scrollMemory: "tabWheelScrollMemory",
  wheelList: "tabWheelWheelList",
} as const;
export const TABWHEEL_MODIFIER_KEYS: readonly TabWheelModifierKey[] = [
  "alt",
  "ctrl",
  "meta",
] as const;
export const TABWHEEL_CYCLE_SCOPES: readonly TabWheelCycleScope[] = ["general", "tagged"];
export const TABWHEEL_PRESETS: readonly TabWheelPreset[] = ["precise", "balanced", "fast", "custom"];
export const MIN_WHEEL_SENSITIVITY = 0.5;
export const MAX_WHEEL_SENSITIVITY = 2;
export const MIN_WHEEL_COOLDOWN_MS = 60;
export const MAX_WHEEL_COOLDOWN_MS = 400;

export const TABWHEEL_PRESET_VALUES: Record<Exclude<TabWheelPreset, "custom">, {
  wheelSensitivity: number;
  wheelCooldownMs: number;
  wheelAcceleration: boolean;
  overshootGuard: boolean;
}> = {
  precise: {
    wheelSensitivity: 0.8,
    wheelCooldownMs: 220,
    wheelAcceleration: false,
    overshootGuard: true,
  },
  balanced: {
    wheelSensitivity: 1,
    wheelCooldownMs: 160,
    wheelAcceleration: false,
    overshootGuard: true,
  },
  fast: {
    wheelSensitivity: 1.35,
    wheelCooldownMs: 90,
    wheelAcceleration: true,
    overshootGuard: true,
  },
};

export const DEFAULT_TABWHEEL_SETTINGS: TabWheelSettings = {
  invertScroll: false,
  gestureModifier: "alt",
  gestureWithShift: false,
  allowGesturesInEditableFields: true,
  cycleScope: "general",
  skipPinnedTabs: false,
  wheelPreset: "balanced",
  wheelSensitivity: 1,
  wheelCooldownMs: 160,
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
  "wheelSensitivity" | "wheelCooldownMs" | "wheelAcceleration" | "overshootGuard"
>): TabWheelPreset {
  for (const preset of ["precise", "balanced", "fast"] as const) {
    const presetValues = TABWHEEL_PRESET_VALUES[preset];
    if (
      settings.wheelSensitivity === presetValues.wheelSensitivity
      && settings.wheelCooldownMs === presetValues.wheelCooldownMs
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
    cycleScope: normalizeTabWheelCycleScope(settings.cycleScope),
    skipPinnedTabs: normalizeEnabledFlag(
      settings.skipPinnedTabs,
      DEFAULT_TABWHEEL_SETTINGS.skipPinnedTabs,
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
