const STORAGE_SCHEMA_VERSION_KEY = "storageSchemaVersion";
const TABWHEEL_SETTINGS_KEY = "tabWheelSettings";
const TABWHEEL_SCROLL_MEMORY_KEY = "tabWheelScrollMemory";
const TABWHEEL_MRU_STATE_KEY = "tabWheelMruState";
const TABWHEEL_LEGACY_TAGGED_TABS_KEY = "tabWheelTaggedTabs";
const TABWHEEL_WHEEL_LIST_KEY = "tabWheelWheelList";
export const STORAGE_SCHEMA_VERSION = 9;
const DEFAULT_SEARCH_URL_TEMPLATE = "https://www.google.com/search?q=%s";

type StorageSnapshot = Record<string, unknown>;

export interface StorageMigrationResult {
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  migratedStorage: StorageSnapshot;
}

function readSchemaVersion(storage: StorageSnapshot): number {
  const numeric = Number(storage[STORAGE_SCHEMA_VERSION_KEY]);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.floor(numeric);
  return rounded > 0 ? rounded : 0;
}

function hasKey(storage: StorageSnapshot, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(storage, key);
}

function deleteKey(storage: StorageSnapshot, key: string): boolean {
  if (!hasKey(storage, key)) return false;
  delete storage[key];
  return true;
}

function enableEditableFieldsByDefault(storage: StorageSnapshot): boolean {
  const settings = storage[TABWHEEL_SETTINGS_KEY];
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    storage[TABWHEEL_SETTINGS_KEY] = { allowGesturesInEditableFields: true };
    return true;
  }
  const nextSettings = {
    ...(settings as Record<string, unknown>),
    allowGesturesInEditableFields: true,
  };
  const changed = (settings as Record<string, unknown>).allowGesturesInEditableFields !== true;
  storage[TABWHEEL_SETTINGS_KEY] = nextSettings;
  return changed;
}

function deleteSettingKey(storage: StorageSnapshot, key: string): boolean {
  const settings = storage[TABWHEEL_SETTINGS_KEY];
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return false;
  const nextSettings = { ...(settings as Record<string, unknown>) };
  if (!deleteKey(nextSettings, key)) return false;
  storage[TABWHEEL_SETTINGS_KEY] = nextSettings;
  return true;
}

function migrateTabWheelSettings(storage: StorageSnapshot): boolean {
  const settings = storage[TABWHEEL_SETTINGS_KEY];
  const hasExistingSettings = typeof settings === "object" && settings !== null && !Array.isArray(settings);
  const nextSettings = hasExistingSettings ? { ...(settings as Record<string, unknown>) } : {};
  let changed = !hasExistingSettings;

  if (nextSettings.cycleScope !== "general" && nextSettings.cycleScope !== "mru") {
    nextSettings.cycleScope = "general";
    changed = true;
  }
  if (typeof nextSettings.skipRestrictedPages !== "boolean") {
    nextSettings.skipRestrictedPages = true;
    changed = true;
  }
  if (typeof nextSettings.searchUrlTemplate !== "string") {
    nextSettings.searchUrlTemplate = DEFAULT_SEARCH_URL_TEMPLATE;
    changed = true;
  }
  if (deleteKey(nextSettings, "cycleOrder")) changed = true;
  if (typeof nextSettings.wheelPreset !== "string") {
    nextSettings.wheelPreset = "balanced";
    changed = true;
  }
  if (typeof nextSettings.horizontalWheel !== "boolean") {
    nextSettings.horizontalWheel = true;
    changed = true;
  }
  if (typeof nextSettings.overshootGuard !== "boolean") {
    nextSettings.overshootGuard = true;
    changed = true;
  }
  if (typeof nextSettings.wheelAcceleration !== "boolean") {
    nextSettings.wheelAcceleration = false;
    changed = true;
  }
  if (typeof nextSettings.wheelCooldownMs !== "number") {
    nextSettings.wheelCooldownMs = 160;
    changed = true;
  }
  if (typeof nextSettings.wheelSensitivity !== "number") {
    nextSettings.wheelSensitivity = 1;
    changed = true;
  }

  if (changed) storage[TABWHEEL_SETTINGS_KEY] = nextSettings;
  return changed;
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function removeScrollMemoryWithoutUrls(storage: StorageSnapshot): boolean {
  const scrollMemory = storage[TABWHEEL_SCROLL_MEMORY_KEY];
  if (typeof scrollMemory !== "object" || scrollMemory === null || Array.isArray(scrollMemory)) return false;
  const nextScrollMemory: Record<string, unknown> = {};
  let changed = false;

  for (const [key, rawEntry] of Object.entries(scrollMemory as Record<string, unknown>)) {
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      changed = true;
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    if (!isHttpUrl(entry.url)) {
      changed = true;
      continue;
    }
    nextScrollMemory[key] = entry;
  }

  if (changed) storage[TABWHEEL_SCROLL_MEMORY_KEY] = nextScrollMemory;
  return changed;
}

export function migrateStorageSnapshot(input: StorageSnapshot): StorageMigrationResult {
  const migratedStorage: StorageSnapshot = { ...input };
  const fromVersion = readSchemaVersion(input);

  if (fromVersion > STORAGE_SCHEMA_VERSION) {
    return {
      fromVersion,
      toVersion: fromVersion,
      changed: false,
      migratedStorage,
    };
  }

  let changed = false;
  if (fromVersion < 2) {
    changed = deleteKey(migratedStorage, "frecencyData") || changed;
  }
  if (fromVersion === 2) {
    changed = deleteKey(migratedStorage, "frecencyData") || changed;
  }
  if (fromVersion < 4) {
    changed = deleteKey(migratedStorage, "tabWheelSessions") || changed;
  }
  if (fromVersion < 5) {
    changed = enableEditableFieldsByDefault(migratedStorage) || changed;
  }
  if (fromVersion < 6) {
    changed = deleteSettingKey(migratedStorage, "showCycleToast") || changed;
  }
  if (fromVersion < 7) {
    changed = removeScrollMemoryWithoutUrls(migratedStorage) || changed;
    changed = deleteKey(migratedStorage, TABWHEEL_MRU_STATE_KEY) || changed;
  }
  if (fromVersion < 8) {
    changed = deleteKey(migratedStorage, TABWHEEL_LEGACY_TAGGED_TABS_KEY) || changed;
    changed = deleteKey(migratedStorage, TABWHEEL_MRU_STATE_KEY) || changed;
    changed = migrateTabWheelSettings(migratedStorage) || changed;
  }
  if (fromVersion < 9) {
    changed = deleteKey(migratedStorage, TABWHEEL_LEGACY_TAGGED_TABS_KEY) || changed;
    changed = deleteKey(migratedStorage, TABWHEEL_WHEEL_LIST_KEY) || changed;
    changed = migrateTabWheelSettings(migratedStorage) || changed;
  }

  if (migratedStorage[STORAGE_SCHEMA_VERSION_KEY] !== STORAGE_SCHEMA_VERSION) {
    migratedStorage[STORAGE_SCHEMA_VERSION_KEY] = STORAGE_SCHEMA_VERSION;
    changed = true;
  }

  return {
    fromVersion,
    toVersion: STORAGE_SCHEMA_VERSION,
    changed,
    migratedStorage,
  };
}
