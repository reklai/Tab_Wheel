const STORAGE_SCHEMA_VERSION_KEY = "storageSchemaVersion";
const TABWHEEL_SETTINGS_KEY = "tabWheelSettings";
export const STORAGE_SCHEMA_VERSION = 6;

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
    changed = deleteKey(migratedStorage, "tabWheelTaggedTabs") || changed;
    changed = deleteKey(migratedStorage, "tabWheelSessions") || changed;
  }
  if (fromVersion < 5) {
    changed = enableEditableFieldsByDefault(migratedStorage) || changed;
  }
  if (fromVersion < 6) {
    changed = deleteSettingKey(migratedStorage, "showCycleToast") || changed;
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
