import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readJson(pathFromRoot) {
  return JSON.parse(readFileSync(resolve(root, pathFromRoot), "utf8"));
}

test("verifyCompat script succeeds", () => {
  const result = spawnSync(process.execPath, [resolve(root, "esBuildConfig/verifyCompat.mjs")], {
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `verifyCompat failed:\nstdout:\n${result.stdout || "(empty)"}\nstderr:\n${result.stderr || "(empty)"}`,
  );
});

test("manifests no longer declare legacy keyboard commands", () => {
  const v2 = readJson("esBuildConfig/manifest_v2.json");
  const v3 = readJson("esBuildConfig/manifest_v3.json");
  assert.equal(v2.commands, undefined);
  assert.equal(v3.commands, undefined);
});

test("manifests use TabWheel names and titles", () => {
  const v2 = readJson("esBuildConfig/manifest_v2.json");
  const v3 = readJson("esBuildConfig/manifest_v3.json");
  assert.equal(v2.name, "TabWheel");
  assert.equal(v2.browser_action.default_title, "TabWheel");
  assert.equal(v3.name, "TabWheel");
  assert.equal(v3.action.default_title, "TabWheel");
});

test("manifests do not expose native side panel/sidebar surfaces", () => {
  const v2 = readJson("esBuildConfig/manifest_v2.json");
  const v3 = readJson("esBuildConfig/manifest_v3.json");

  assert.equal(v2.sidebar_action, undefined);
  assert.equal(v3.side_panel, undefined);
  assert.equal(v3.permissions.includes("sidePanel"), false);
});

test("content scripts run early enough to claim modifier-wheel events", () => {
  const v2 = readJson("esBuildConfig/manifest_v2.json");
  const v3 = readJson("esBuildConfig/manifest_v3.json");

  assert.equal(v2.content_scripts[0].run_at, "document_start");
  assert.equal(v3.content_scripts[0].run_at, "document_start");
  assert.equal(v2.content_scripts[0].all_frames, true);
  assert.equal(v3.content_scripts[0].all_frames, true);
  assert.equal(v2.content_scripts[0].match_about_blank, true);
  assert.equal(v3.content_scripts[0].match_about_blank, true);
});

test("chrome manifest can activate existing normal web tabs after install", () => {
  const v3 = readJson("esBuildConfig/manifest_v3.json");

  assert.ok(v3.permissions.includes("scripting"));
  assert.ok(v3.host_permissions.includes("<all_urls>"));
});

test("firefox manifest contains AMO gecko metadata", () => {
  const v2 = readJson("esBuildConfig/manifest_v2.json");
  const gecko = v2.browser_specific_settings?.gecko;
  assert.equal(typeof gecko?.id, "string");
  assert.ok(gecko.id.length > 0);

  const required = gecko?.data_collection_permissions?.required;
  assert.ok(Array.isArray(required), "Expected gecko.data_collection_permissions.required to be an array.");
  assert.ok(required.includes("none"), 'Expected gecko.data_collection_permissions.required to include "none".');
});
