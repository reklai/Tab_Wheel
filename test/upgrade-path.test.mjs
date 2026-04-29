import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readText(pathFromRoot) {
  return readFileSync(resolve(root, pathFromRoot), "utf8");
}

test("TabWheel storage keys are stable and isolated from legacy storage", () => {
  const contract = readText("src/lib/common/contracts/tabWheel.ts");
  const domain = readText("src/lib/backgroundRuntime/domains/tabWheelDomain.ts");
  const migrations = readText("src/lib/common/utils/storageMigrations.ts");

  assert.match(contract, /taggedTabs:\s*"tabWheelTaggedTabs"/);
  assert.match(contract, /settings:\s*"tabWheelSettings"/);
  assert.doesNotMatch(contract, /tabWheelSessions|MAX_TABWHEEL_SESSIONS/);
  assert.match(domain, /browser\.storage\.local\.get\(TABWHEEL_STORAGE_KEYS\.taggedTabs\)/);
  assert.match(domain, /browser\.storage\.local\.set\(\{\s*\[TABWHEEL_STORAGE_KEYS\.taggedTabs\]/);
  assert.match(migrations, /export const STORAGE_SCHEMA_VERSION = 3/);
  assert.match(migrations, /deleteKey\(migratedStorage,\s*"frecencyData"\)/);
  assert.doesNotMatch(migrations, /tabManagerList|tabManagerSessions|anchorTagsByTabId|keybindings/);
});
