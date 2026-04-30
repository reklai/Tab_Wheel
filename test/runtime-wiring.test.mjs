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

function sliceFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const end = nextName ? source.indexOf(`\n  function ${nextName}`, start) : source.length;
  assert.notEqual(end, -1, `Missing end marker ${nextName}`);
  return source.slice(start, end);
}

test("background runtime composes TabWheel domain and handler", () => {
  const source = readText("src/entryPoints/backgroundRuntime/background.ts");

  assert.match(source, /createTabWheelDomain/);
  assert.match(source, /createTabWheelMessageHandler\(tabWheel\)/);
  assert.match(source, /tabWheel\.registerLifecycleListeners\(\)/);
  assert.match(source, /tabWheel\.ensureLoaded\(\)/);
  assert.doesNotMatch(source, /tabManager|anchorTags|sessionMessageHandler|commandRouter|startupRestore|miscMessageHandler/);
});

test("message handler routes wheel overview, cycling, scroll, help, and settings", () => {
  const source = readText("src/lib/backgroundRuntime/handlers/tabWheelMessageHandler.ts");

  assert.match(source, /case "TABWHEEL_CYCLE":[\s\S]*domain\.cycle\(message\.direction,\s*sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_GET_OVERVIEW":[\s\S]*domain\.getOverview\(sender\.tab/);
  assert.match(source, /case "TABWHEEL_SAVE_SCROLL_POSITION":[\s\S]*domain\.saveScrollPosition\(/);
  assert.match(source, /case "TABWHEEL_OPEN_HELP":[\s\S]*openHelpInActiveTab\(\)/);
  assert.match(source, /case "TABWHEEL_OPEN_OPTIONS":[\s\S]*openOptionsPage\(\)/);
  assert.doesNotMatch(source, /TAG_CURRENT|REMOVE_CURRENT|TOGGLE_CURRENT|RESTORE_REMOVED|TABWHEEL_LIST|TABWHEEL_ACTIVATE|GET_CYCLE_MODE|SET_CYCLE_MODE/);
});

test("content script implements tuned modifier-wheel cycling and quick controls", () => {
  const source = readText("src/lib/appInit/appInit.ts");
  const messages = readText("src/lib/common/contracts/runtimeMessages.ts");

  assert.match(source, /window\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /window\.addEventListener\("click",\s*clickHandler,\s*true\)/);
  assert.doesNotMatch(source, /window\.addEventListener\("(?:pointerdown|pointerup|pointercancel|mousedown|mouseup|auxclick|contextmenu)"/);
  assert.match(source, /normalizeWheelDeltaY\(event,\s*window\.innerHeight\)/);
  assert.match(source, /wheelAccumulator \+= wheelDelta \* settings\.wheelSensitivity/);
  assert.match(source, /settings\.wheelCooldownMs/);
  assert.match(source, /settings\.wheelAcceleration/);
  assert.match(source, /openQuickControlsPanel\(\)/);
  assert.match(source, /saveTabWheelScrollPosition\(scrollX,\s*scrollY\)/);
  assert.match(messages, /TABWHEEL_GET_OVERVIEW/);
  assert.doesNotMatch(`${source}\n${messages}`, /showCycleToast|TABWHEEL_STATUS|tw-status-indicator|formatCycleStatus/);
  assert.doesNotMatch(source, /Tagged|TAGGED|tagged|Favicon|Pill|openTabWheelPanel|mouseGesturesEnabled|keyboardGesturesEnabled|rightHold/i);
  assert.doesNotMatch(messages, /TAG|Tagged|LIST|ACTIVATE|CURRENT_STATE|CYCLE_MODE/);
});

test("settings contract exposes wheel tuning without tag storage or switch feedback", () => {
  const contract = readText("src/lib/common/contracts/tabWheel.ts");
  const types = readText("src/types.d.ts");

  assert.match(contract, /scrollMemory:\s*"tabWheelScrollMemory"/);
  assert.match(contract, /TABWHEEL_CYCLE_ORDERS:[\s\S]*\["strip",\s*"mru"\]/);
  assert.match(contract, /wheelSensitivity:\s*1/);
  assert.match(contract, /wheelCooldownMs:\s*140/);
  assert.match(contract, /allowGesturesInEditableFields:\s*true/);
  assert.match(contract, /skipPinnedTabs:\s*false/);
  assert.match(contract, /wrapAround:\s*true/);
  assert.match(contract, /normalizeTabWheelCycleOrder/);
  assert.match(types, /type TabWheelCycleOrder = "strip" \| "mru"/);
  assert.match(types, /interface TabWheelScrollMemoryEntry/);
  assert.doesNotMatch(`${contract}\n${types}`, /TaggedTabEntry|TabWheelCycleMode|MAX_TAGGED|taggedTabs|showCycleToast/);
});

test("domain supports left-right and MRU cycling with scroll memory", () => {
  const source = readText("src/lib/backgroundRuntime/domains/tabWheelDomain.ts");

  assert.match(source, /scrollMemoryByTabId: ScrollMemoryByTabId/);
  assert.match(source, /mruTabIdsByWindowId = new Map<number,\s*number\[\]>/);
  assert.match(source, /resolveStripTargetTab/);
  assert.match(source, /resolveMruTargetTab/);
  assert.match(source, /settings\.skipPinnedTabs/);
  assert.match(source, /settings\.wrapAround/);
  assert.match(source, /captureTabScroll\(activeTab\)/);
  assert.match(source, /restoreScroll\(targetTab\.id\)/);
  assert.match(source, /TABWHEEL_STORAGE_KEYS\.scrollMemory/);
  assert.match(source, /MAX_SCROLL_MEMORY_ENTRIES/);
  assert.doesNotMatch(source, /Tagged|TAGGED|tagged|Badge|restoreRemoved|cycleModeByWindowId|notifyWindowTagState/i);
});

test("quick controls panel and popup expose wheel controls", () => {
  const quickPanel = readText("src/lib/ui/panels/quickControls/quickControls.ts");
  const quickCss = readText("src/lib/ui/panels/quickControls/quickControls.css");
  const popupSource = readText("src/entryPoints/toolbarPopup/toolbarPopup.ts");
  const popupHtml = readText("src/entryPoints/toolbarPopup/toolbarPopup.html");

  assert.match(quickPanel, /openQuickControlsPanel/);
  assert.match(quickPanel, /createPanelHost\(\)/);
  assert.match(quickPanel, /getBaseStyles\(\)/);
  assert.match(quickPanel, /registerPanelCleanup\(close\)/);
  assert.match(quickPanel, /cycleOrder/);
  assert.match(quickPanel, /Left-right/);
  assert.match(quickPanel, /wheelSensitivity/);
  assert.match(quickPanel, /wheelCooldownMs/);
  assert.match(quickPanel, /title="\$\{escapeHtml\(note\)\}"/);
  assert.match(quickPanel, /openTabWheelHelpOverlay/);
  assert.match(quickCss, /\.ht-quick-controls-container/);
  assert.match(popupSource, /getTabWheelOverviewWithRetry/);
  assert.match(popupSource, /saveTabWheelSettings/);
  assert.match(popupHtml, /id="cycleOrder"/);
  assert.match(popupHtml, /Left-right or recent tabs/);
  assert.match(popupHtml, /id="wheelSensitivity"/);
  assert.match(popupHtml, /id="helpBtn"/);
  assert.doesNotMatch(`${quickPanel}\n${popupSource}\n${popupHtml}`, /Tagged|TAGGED|tagged|searchInput|clearBtn|removeBtn|Switch feedback|showCycleToast/i);
});

test("options and help document wheel-focused behavior", () => {
  const optionsSource = readText("src/entryPoints/optionsPage/optionsPage.ts");
  const optionsHtml = readText("src/entryPoints/optionsPage/optionsPage.html");
  const helpSource = readText("src/lib/ui/panels/help/help.ts");

  assert.match(optionsSource, /cycleOrderSelect/);
  assert.match(optionsSource, /wheelSensitivityInput/);
  assert.match(optionsSource, /wheelCooldownInput/);
  assert.match(optionsHtml, /id="cycleOrder"/);
  assert.match(optionsHtml, /id="skipPinnedTabs"/);
  assert.match(optionsHtml, /Left-right follows the visible browser tab order/);
  assert.match(optionsHtml, /Modifier \+ Left Click/);
  assert.match(helpSource, /most-recently-used|Recent/);
  assert.match(helpSource, /Scroll Memory/);
  assert.doesNotMatch(`${optionsSource}\n${optionsHtml}\n${helpSource}`, /Tagged|TAGGED|tagged|Right Hold|Mouse layer|Alt \+ T|Alt \+ M|Switch feedback|showCycleToast/i);
});

test("removed tag panel files are not referenced", () => {
  const source = [
    readText("src/lib/appInit/appInit.ts"),
    readText("src/entryPoints/toolbarPopup/toolbarPopup.ts"),
    readText("src/lib/common/utils/panelHost.ts"),
    readText("esBuildConfig/lint.mjs"),
  ].join("\n");

  assert.doesNotMatch(source, /ui\/panels\/tabWheel|ht-tabwheel-container|openTabWheelPanel/);
});
