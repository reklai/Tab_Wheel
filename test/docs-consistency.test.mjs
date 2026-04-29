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

test("contributor docs reference release/store/privacy docs", () => {
  const contributing = readText("CONTRIBUTING.md");
  assert.ok(contributing.includes("RELEASE.md"));
  assert.ok(contributing.includes("STORE.md"));
  assert.ok(contributing.includes("PRIVACY.md"));
});

test("store and privacy docs match current TabWheel limits", () => {
  const store = readText("STORE.md");
  const privacy = readText("PRIVACY.md");

  assert.ok(store.includes("Firefox / Zen: TabWheel"));
  assert.ok(store.includes("Chrome: TabWheel"));
  assert.ok(store.includes("TagWheel") === false);
  assert.ok(store.includes("Alt + T"));
  assert.ok(store.includes("Alt + M"));
  assert.ok(privacy.includes("up to 15 tabs"));
  assert.equal(store.includes("sidePanel"), false);
  assert.equal(privacy.includes("sidePanel"), false);
});

test("docs no longer advertise removed legacy features", () => {
  const combined = `${readText("README.md")}\n${readText("STORE.md")}\n${readText("PRIVACY.md")}`;
  assert.doesNotMatch(combined, /Tab Manager|Anchor Tags|keybindings|frecency|ScrollRail|Harpoon-Tabs|sessions?/i);
});
