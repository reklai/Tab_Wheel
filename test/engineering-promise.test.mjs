import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

function readText(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

const OVERLAY_CSS_FILES = [
  "src/lib/ui/panels/help/help.css",
  "src/lib/ui/panels/quickControls/quickControls.css",
];

test("store and privacy docs include local-only/no-telemetry policy", () => {
  const store = readText("STORE.md");
  const privacy = readText("PRIVACY.md");
  assert.match(store, /No data leaves your browser/);
  assert.match(privacy, /does not collect, transmit, or share/);
});

test("package scripts expose engineering guardrail chain", () => {
  const packageJson = JSON.parse(readText("package.json"));
  assert.equal(packageJson.scripts.lint, "node esBuildConfig/lint.mjs");
  assert.equal(packageJson.scripts.test, "node --test test/*.test.mjs");
  assert.equal(packageJson.scripts["verify:store"], "node esBuildConfig/verifyStore.mjs");
  assert.match(packageJson.scripts.ci, /\bnpm run lint\b/);
  assert.match(packageJson.scripts.ci, /\bnpm run test\b/);
  assert.match(packageJson.scripts.ci, /\bnpm run verify:compat\b/);
  assert.match(packageJson.scripts.ci, /\bnpm run verify:store\b/);
});

test("overlay css includes anti-glitch container baseline", () => {
  for (const file of OVERLAY_CSS_FILES) {
    const css = readText(file);
    assert.match(css, /backface-visibility:\s*hidden/);
    assert.match(css, /will-change:\s*transform/);
  }
});

test("quick controls use restrained dark controls and blue accents", () => {
  const css = readText("src/lib/ui/panels/quickControls/quickControls.css");
  assert.match(css, /\.ht-quick-controls-container/);
  assert.match(css, /\.ht-quick-grid/);
  assert.match(css, /\.ht-quick-row/);
  assert.match(css, /\.ht-quick-range/);
  assert.match(css, /var\(--ht-color-/);
  assert.doesNotMatch(css, /rgba\(50,215,75,/);
});
