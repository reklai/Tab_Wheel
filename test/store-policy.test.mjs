import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

test("verifyStore script succeeds", () => {
  const result = spawnSync(process.execPath, [resolve(root, "esBuildConfig/verifyStore.mjs")], {
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `verifyStore failed:\nstdout:\n${result.stdout || "(empty)"}\nstderr:\n${result.stderr || "(empty)"}`,
  );
});
