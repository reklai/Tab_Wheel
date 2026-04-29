import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const fixturesDir = resolve(root, "test/fixtures/upgrade");

function readJson(pathFromRoot) {
  return JSON.parse(readFileSync(pathFromRoot, "utf8"));
}

async function loadMigrationModule() {
  const tempDir = mkdtempSync(join(tmpdir(), "ht-upgrade-verify-"));
  const bundledFile = resolve(tempDir, "storageMigrations.mjs");
  await build({
    entryPoints: [resolve(root, "src/lib/common/utils/storageMigrations.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    outfile: bundledFile,
    logLevel: "silent",
  });

  const moduleUrl = `${pathToFileURL(bundledFile).href}?t=${Date.now()}`;
  const module = await import(moduleUrl);
  return { module, tempDir };
}

async function main() {
  const fixtureFiles = readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  if (fixtureFiles.length === 0) {
    throw new Error("No upgrade fixtures found.");
  }

  const { module, tempDir } = await loadMigrationModule();
  const { migrateStorageSnapshot, STORAGE_SCHEMA_VERSION } = module;

  try {
    let checkedCount = 0;
    for (const fileName of fixtureFiles) {
      const fixturePath = resolve(fixturesDir, fileName);
      const fixture = readJson(fixturePath);

      const result = migrateStorageSnapshot(fixture.input);
      assert.deepEqual(
        result.migratedStorage,
        fixture.expected,
        `${fileName}: migrated snapshot mismatch`,
      );
      assert.equal(
        result.changed,
        fixture.expectedChanged,
        `${fileName}: changed flag mismatch`,
      );

      if (fixture.expectedChanged) {
        assert.equal(
          result.toVersion,
          STORAGE_SCHEMA_VERSION,
          `${fileName}: expected migration target version mismatch`,
        );
      }

      checkedCount += 1;
    }

    console.log("[verify:upgrade] OK");
    console.log(`- Fixture cases: ${checkedCount}`);
    console.log(`- Target schema version: ${STORAGE_SCHEMA_VERSION}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[verify:upgrade] FAILED");
  console.error(`- ${error.message}`);
  process.exit(1);
});

