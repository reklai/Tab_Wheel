import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function readText(pathFromRoot) {
  return readFileSync(resolve(ROOT, pathFromRoot), "utf8");
}

test("in-page overlays include mobile tightening for small devices", () => {
  for (const file of [
    "src/lib/ui/panels/help/help.css",
    "src/lib/ui/panels/quickControls/quickControls.css",
  ]) {
    const css = readText(file);
    assert.match(css, /@media \(max-width:/);
    assert.match(css, /border-radius:\s*8px/);
  }
});

test("popup and options layouts guard narrow viewports", () => {
  const popupCss = readText("src/entryPoints/toolbarPopup/toolbarPopup.css");
  const optionsCss = readText("src/entryPoints/optionsPage/optionsPage.css");
  assert.match(popupCss, /grid-template-columns:[^;]*minmax\(0,\s*1fr\)/);
  assert.match(optionsCss, /@media \(max-width:\s*620px\)/);
  assert.match(optionsCss, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
