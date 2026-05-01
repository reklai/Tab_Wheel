// Background entrypoint — composes TabWheel domain handlers and runtime router.

import { createTabWheelDomain } from "../../lib/backgroundRuntime/domains/tabWheelDomain";
import { createTabWheelMessageHandler } from "../../lib/backgroundRuntime/handlers/tabWheelMessageHandler";
import { registerRuntimeMessageRouter } from "../../lib/backgroundRuntime/handlers/runtimeRouter";
import { migrateStorageIfNeeded } from "../../lib/common/utils/storageMigrationsRuntime";

const tabWheel = createTabWheelDomain();
tabWheel.registerLifecycleListeners();

registerRuntimeMessageRouter([
  createTabWheelMessageHandler(tabWheel),
]);

async function bootstrapBackground(): Promise<void> {
  const migration = await migrateStorageIfNeeded();
  if (migration.changed) {
    console.log(
      `[TabWheel] Storage migration applied (${migration.fromVersion} -> ${migration.toVersion}).`,
    );
  }

  void tabWheel.ensureLoaded();
}

void bootstrapBackground().catch((error) => {
  console.error("[TabWheel] Background bootstrap failed:", error);
});
