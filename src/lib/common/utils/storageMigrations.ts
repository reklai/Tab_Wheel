const STORAGE_SCHEMA_VERSION_KEY = "storageSchemaVersion";
export const STORAGE_SCHEMA_VERSION = 3;

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
