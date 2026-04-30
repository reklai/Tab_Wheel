import browser from "webextension-polyfill";

export const MAX_SCROLL_MEMORY_ENTRIES = 300;
export const TABWHEEL_STORAGE_KEYS = {
  settings: "tabWheelSettings",
  scrollMemory: "tabWheelScrollMemory",
} as const;
export const TABWHEEL_MODIFIER_KEYS: readonly TabWheelModifierKey[] = [
  "alt",
  "ctrl",
  "meta",
] as const;
export const TABWHEEL_CYCLE_ORDERS: readonly TabWheelCycleOrder[] = ["strip", "mru"];
export const MIN_WHEEL_SENSITIVITY = 0.5;
export const MAX_WHEEL_SENSITIVITY = 2;
export const MIN_WHEEL_COOLDOWN_MS = 60;
export const MAX_WHEEL_COOLDOWN_MS = 400;

export const DEFAULT_TABWHEEL_SETTINGS: TabWheelSettings = {
  invertScroll: false,
  gestureModifier: "alt",
  gestureWithShift: false,
  allowGesturesInEditableFields: true,
  cycleOrder: "strip",
  skipPinnedTabs: false,
  wrapAround: true,
  wheelSensitivity: 1,
  wheelCooldownMs: 140,
  wheelAcceleration: true,
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

export function normalizeTabWheelCycleOrder(value: unknown): TabWheelCycleOrder {
  return TABWHEEL_CYCLE_ORDERS.includes(value as TabWheelCycleOrder)
    ? value as TabWheelCycleOrder
    : DEFAULT_TABWHEEL_SETTINGS.cycleOrder;
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
    allowGesturesInEditableFields: normalizeEnabledFlag(
      settings.allowGesturesInEditableFields,
      DEFAULT_TABWHEEL_SETTINGS.allowGesturesInEditableFields,
    ),
    cycleOrder: normalizeTabWheelCycleOrder(settings.cycleOrder),
    skipPinnedTabs: normalizeEnabledFlag(
      settings.skipPinnedTabs,
      DEFAULT_TABWHEEL_SETTINGS.skipPinnedTabs,
    ),
    wrapAround: normalizeEnabledFlag(
      settings.wrapAround,
      DEFAULT_TABWHEEL_SETTINGS.wrapAround,
    ),
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
