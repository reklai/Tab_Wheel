import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

test("verifyUpgrade script succeeds on fixture snapshots", () => {
  const result = spawnSync(process.execPath, [resolve(root, "esBuildConfig/verifyUpgrade.mjs")], {
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `verifyUpgrade failed:\nstdout:\n${result.stdout || "(empty)"}\nstderr:\n${result.stderr || "(empty)"}`,
  );
});

