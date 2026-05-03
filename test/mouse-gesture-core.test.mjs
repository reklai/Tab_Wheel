import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "esbuild";

const ROOT = process.cwd();

async function loadMouseGestureCoreModule() {
  const source = readFileSync(
    resolve(ROOT, "src/lib/core/tabWheel/mouseGestureCore.ts"),
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

test("mouse gesture core resolves button policies", async () => {
  const core = await loadMouseGestureCoreModule();

  assert.equal(core.resolveMouseGesturePolicy(0)?.action, "search");
  assert.equal(core.resolveMouseGesturePolicy(1)?.action, "recentTab");
  assert.equal(core.resolveMouseGesturePolicy(2)?.action, "closeToRecent");
  assert.equal(core.resolveMouseGesturePolicy(3), null);
});

test("mouse gesture core runs middle click immediately and finishes on auxclick", async () => {
  const core = await loadMouseGestureCoreModule();
  const policy = core.resolveMouseGesturePolicy(1);
  const session = core.createMouseGestureSession(policy, 1000);

  assert.equal(core.shouldRunMouseGestureSession(session, "mousedown"), true);
  session.hasRun = true;
  assert.equal(core.shouldRunMouseGestureSession(session, "auxclick"), false);
  assert.equal(core.shouldFinishMouseGestureSession(session, "auxclick"), true);
});

test("mouse gesture core waits for contextmenu before right click close", async () => {
  const core = await loadMouseGestureCoreModule();
  const policy = core.resolveMouseGesturePolicy(2);
  const session = core.createMouseGestureSession(policy, 1000);

  assert.equal(core.shouldRunMouseGestureSession(session, "mousedown"), false);
  assert.equal(core.isMouseGestureEventForSession(session, { type: "contextmenu", button: 0 }), true);
  assert.equal(core.shouldRunMouseGestureSession(session, "contextmenu"), true);
  assert.equal(core.shouldFinishMouseGestureSession(session, "contextmenu"), true);
});

test("mouse gesture core expires stale sessions", async () => {
  const core = await loadMouseGestureCoreModule();
  const policy = core.resolveMouseGesturePolicy(0);
  const session = core.createMouseGestureSession(policy, 1000);

  assert.equal(core.isMouseGestureSessionExpired(session, 1899), false);
  assert.equal(core.isMouseGestureSessionExpired(session, 1901), true);
});
