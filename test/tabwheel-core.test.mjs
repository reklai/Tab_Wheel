import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

const ROOT = process.cwd();

async function loadTabWheelCoreModule() {
  const source = readFileSync(
    resolve(ROOT, "src/lib/core/tabWheel/tabWheelCore.ts"),
    "utf8",
  );

  const transformed = await transform(source, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });

  const encoded = Buffer.from(transformed.code, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

test("tabWheelCore resolves wheel direction with optional invert", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.resolveWheelDirection(100, false), "next");
  assert.equal(core.resolveWheelDirection(-100, false), "prev");
  assert.equal(core.resolveWheelDirection(100, true), "prev");
  assert.equal(core.resolveWheelDirection(-100, true), "next");
});

test("tabWheelCore cycles all tabs when no tagged indices exist", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], [], 1, "next"), 2);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], [], 0, "prev"), 2);
});

test("tabWheelCore cycles tagged tabs from current tab-strip position", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.resolveCycleTargetIndex([0, 1, 2, 3, 4], [1, 3], 2, "next"), 3);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2, 3, 4], [1, 3], 2, "prev"), 1);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2, 3, 4], [1, 3], 4, "next"), 1);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2, 3, 4], [1, 3], 0, "prev"), 3);
});
