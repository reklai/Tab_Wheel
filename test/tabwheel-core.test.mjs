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

test("tabWheelCore cycles left-right indices with wrap enabled", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], 1, "next", true), 2);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], 0, "prev", true), 2);
});

test("tabWheelCore holds at left-right edges when wrap is disabled", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], 2, "next", false), 2);
  assert.equal(core.resolveCycleTargetIndex([0, 1, 2], 0, "prev", false), 0);
  assert.equal(core.resolveCycleTargetIndex([0, 2, 4], 1, "next", false), 2);
  assert.equal(core.resolveCycleTargetIndex([0, 2, 4], 3, "prev", false), 2);
});

test("tabWheelCore normalizes wheel delta modes", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.normalizeWheelDeltaY({ deltaMode: 0, deltaY: 12 }, 900), 12);
  assert.equal(core.normalizeWheelDeltaY({ deltaMode: 1, deltaY: 2 }, 900), 32);
  assert.equal(core.normalizeWheelDeltaY({ deltaMode: 2, deltaY: 1 }, 900), 900);
});

test("tabWheelCore uses dominant horizontal delta when enabled", async () => {
  const core = await loadTabWheelCoreModule();

  assert.equal(core.normalizeWheelDelta({ deltaMode: 0, deltaX: 4, deltaY: 12 }, 900, 1200, true), 12);
  assert.equal(core.normalizeWheelDelta({ deltaMode: 0, deltaX: -40, deltaY: 12 }, 900, 1200, true), -40);
  assert.equal(core.normalizeWheelDelta({ deltaMode: 0, deltaX: -40, deltaY: 12 }, 900, 1200, false), 12);
  assert.equal(core.normalizeWheelDelta({ deltaMode: 1, deltaX: 3, deltaY: 1 }, 900, 1200, true), 48);
  assert.equal(core.normalizeWheelDelta({ deltaMode: 2, deltaX: -1, deltaY: 0.5 }, 900, 1200, true), -1200);
});
