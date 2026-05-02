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

test("background runtime composes TabWheel domain and handler", () => {
  const source = readText("src/entryPoints/backgroundRuntime/background.ts");

  assert.match(source, /createTabWheelDomain/);
  assert.match(source, /createTabWheelMessageHandler\(tabWheel\)/);
  assert.match(source, /tabWheel\.registerLifecycleListeners\(\)/);
  assert.match(source, /tabWheel\.ensureLoaded\(\)/);
  assert.doesNotMatch(source, /tabManager|anchorTags|sessionMessageHandler|commandRouter|startupRestore|miscMessageHandler/);
});

test("message handler routes cycling, MRU actions, scroll, help, and settings", () => {
  const source = readText("src/lib/backgroundRuntime/handlers/tabWheelMessageHandler.ts");

  assert.match(source, /case "TABWHEEL_CONTENT_READY":[\s\S]*domain\.markContentScriptReady\(sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_CYCLE":[\s\S]*domain\.cycle\(message\.direction,\s*sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_REFRESH_CURRENT_TAB":[\s\S]*domain\.refreshCurrentTab\(sender\.tab,\s*message\.windowId/);
  assert.match(source, /case "TABWHEEL_GET_OVERVIEW":[\s\S]*domain\.getOverview\(sender\.tab/);
  assert.match(source, /case "TABWHEEL_TOGGLE_CYCLE_SCOPE":[\s\S]*domain\.toggleCycleScope\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_SET_CYCLE_SCOPE":[\s\S]*domain\.setCycleScope\(message\.cycleScope,\s*sender\.tab,\s*message\.windowId,\s*\{[\s\S]*suppressPageStatus:\s*message\.suppressPageStatus/);
  assert.match(source, /case "TABWHEEL_OPEN_SEARCH_TAB":[\s\S]*domain\.openSearchTab\(message\.query,\s*sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_ACTIVATE_MOST_RECENT_TAB":[\s\S]*domain\.activateMostRecentTab\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_CLOSE_CURRENT_TAB_AND_ACTIVATE_RECENT":[\s\S]*domain\.closeCurrentTabAndActivateRecent\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_SAVE_SCROLL_POSITION":[\s\S]*domain\.saveScrollPosition\(/);
  assert.match(source, /case "TABWHEEL_OPEN_HELP":[\s\S]*openHelpInActiveTab\(\)/);
  assert.match(source, /case "TABWHEEL_OPEN_OPTIONS":[\s\S]*openOptionsPage\(\)/);
  assert.doesNotMatch(source, /TAGWHEEL|TABWHEEL_FETCH_FAVICON|TABWHEEL_TOGGLE_CURRENT_TAG|TABWHEEL_REMOVE_TAGGED_TAB|TABWHEEL_CLEAR_TAGGED_TABS|TABWHEEL_ACTIVATE_TAGGED_TAB|MAX_FAVICON_BYTES|fetchFaviconData/);
});

test("content script implements modifier-wheel and left/middle/right click actions", () => {
  const source = readText("src/lib/appInit/appInit.ts");
  const messages = readText("src/lib/common/contracts/runtimeMessages.ts");

  assert.match(source, /window\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /document\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /isTopFrame\(\)/);
  assert.match(source, /if \(isTopFrameContext\)[\s\S]*browser\.runtime\.onMessage\.addListener\(messageHandler\)/);
  assert.match(source, /window\.addEventListener\("pointerdown",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("auxclick",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("contextmenu",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /event\.button === 0[\s\S]*return "search"/);
  assert.match(source, /event\.button === 1[\s\S]*return "recentTab"/);
  assert.match(source, /event\.button === 2[\s\S]*return "closeToRecent"/);
  assert.match(source, /openTabWheelSearchLauncher\(\)/);
  assert.match(source, /activateMostRecentTabWheelTab\(\)/);
  assert.match(source, /closeCurrentTabWheelTabAndActivateRecent\(\)/);
  assert.match(source, /MOUSE_GESTURE_CLAIM_MS/);
  assert.match(source, /areSettingsLoaded/);
  assert.match(source, /isMouseGestureStartEvent/);
  assert.match(source, /claimedMouseGesture/);
  assert.match(source, /suppressPageEvent\(event\)/);
  assert.match(source, /isWheelGestureBlockedTarget/);
  assert.match(source, /isMouseGestureBlockedTarget/);
  assert.match(source, /!settings\.allowGesturesInEditableFields && isEditableTarget\(target\)/);
  assert.match(source, /isMouseGestureBlockedTarget\(event\.target\)[\s\S]*return null/);
  assert.match(source, /normalizeWheelDelta\(event,\s*window\.innerHeight,\s*window\.innerWidth,\s*settings\.horizontalWheel\)/);
  assert.match(source, /wheelAccumulator \+= wheelDelta \* settings\.wheelSensitivity/);
  assert.match(source, /getRootScrollSnapshot/);
  assert.match(source, /scrollRatioX/);
  assert.match(source, /scrollRatioY/);
  assert.match(source, /waitForLayoutStability/);
  assert.match(source, /resolveRootScrollTarget/);
  assert.match(source, /hasSimilarDimension/);
  assert.match(source, /settings\.wheelCooldownMs/);
  assert.match(source, /settings\.wheelAcceleration/);
  assert.match(source, /settings\.overshootGuard/);
  assert.match(source, /OVERSHOOT_GUARD_MS/);
  assert.match(source, /TABWHEEL_CONTENT_READY/);
  assert.match(source, /case "TABWHEEL_PING"/);
  assert.match(messages, /TABWHEEL_OPEN_SEARCH_TAB/);
  assert.match(messages, /TABWHEEL_ACTIVATE_MOST_RECENT_TAB/);
  assert.match(messages, /TABWHEEL_CLOSE_CURRENT_TAB_AND_ACTIVATE_RECENT/);
  assert.doesNotMatch(`${source}\n${messages}`, /Wheel List|TAGGED_FAVICON|TABWHEEL_TAG_STATE_CHANGED|TABWHEEL_FETCH_FAVICON|toggleCurrentTabWheelTag|applyTaggedIndicators|tw-tagged/);
});

test("settings contract exposes MRU scope, restricted-page skipping, and wheel tuning", () => {
  const contract = readText("src/lib/common/contracts/tabWheel.ts");
  const types = readText("src/types.d.ts");

  assert.match(contract, /scrollMemory:\s*"tabWheelScrollMemory"/);
  assert.match(contract, /mruState:\s*"tabWheelMruState"/);
  assert.match(contract, /MAX_MRU_TABS = 100/);
  assert.match(contract, /TABWHEEL_CYCLE_SCOPES:[\s\S]*\["general",\s*"mru"\]/);
  assert.match(contract, /TABWHEEL_PRESETS:[\s\S]*\["precise",\s*"balanced",\s*"fast",\s*"custom"\]/);
  assert.match(contract, /cycleScope:\s*"general"/);
  assert.match(contract, /skipRestrictedPages:\s*true/);
  assert.match(contract, /DEFAULT_SEARCH_URL_TEMPLATE = "https:\/\/www\.google\.com\/search\?q=%s"/);
  assert.match(contract, /MAX_SEARCH_QUERY_LENGTH = 512/);
  assert.match(contract, /normalizeSearchUrlTemplate/);
  assert.match(contract, /normalizeSearchQuery/);
  assert.match(contract, /buildSearchUrl/);
  assert.match(contract, /wheelPreset:\s*"balanced"/);
  assert.match(contract, /wheelSensitivity:\s*1/);
  assert.match(contract, /wheelCooldownMs:\s*160/);
  assert.match(contract, /wheelAcceleration:\s*false/);
  assert.match(contract, /horizontalWheel:\s*true/);
  assert.match(contract, /overshootGuard:\s*true/);
  assert.match(contract, /Alt \/ Option/);
  assert.match(contract, /Meta \/ Command/);
  assert.match(types, /type TabWheelCycleScope = "general" \| "mru"/);
  assert.match(types, /type TabWheelMruState = Record<string,\s*number\[\]>/);
  assert.match(types, /scrollRatioX: number/);
  assert.match(types, /scrollWidth: number/);
  assert.match(types, /viewportWidth: number/);
  assert.match(types, /zoom\?: number/);
  assert.match(types, /skipRestrictedPages: boolean/);
  assert.match(types, /searchUrlTemplate: string/);
  assert.match(types, /type TabWheelContentScriptStatus = "ready" \| "unavailable"/);
  assert.doesNotMatch(`${contract}\n${types}`, /TabWheelTaggedTabEntry|TABWHEEL_CYCLE_ORDERS|tabWheelWheelList|MAX_WHEEL_LIST_TABS|showCycleToast/);
});

test("domain supports MRU cycling, restricted-page skipping, and URL-validated scroll memory", () => {
  const source = readText("src/lib/backgroundRuntime/domains/tabWheelDomain.ts");

  assert.match(source, /scrollMemoryByTabId: ScrollMemoryByTabId/);
  assert.match(source, /mruTabIdsByWindowId: MruTabIdsByWindowId/);
  assert.match(source, /contentScriptReadyUrlsByTabId = new Map<number,\s*string>/);
  assert.match(source, /activateExistingContentScripts/);
  assert.match(source, /refreshCurrentTab/);
  assert.match(source, /pingContentScript/);
  assert.match(source, /waitForContentScriptReady/);
  assert.match(source, /runtimeBrowser\.scripting\?\.executeScript/);
  assert.match(source, /runtimeBrowser\.tabs\.executeScript/);
  assert.match(source, /allFrames:\s*true/);
  assert.match(source, /TabWheel cannot run on this page\./);
  assert.match(source, /markContentScriptReady/);
  assert.match(source, /resolveContentScriptStatus/);
  assert.match(source, /isRestrictedTab/);
  assert.match(source, /settings\.skipRestrictedPages/);
  assert.match(source, /recordMruTab/);
  assert.match(source, /getMruOrderedTabs/);
  assert.match(source, /resolveMruCycleTargetTab/);
  assert.match(source, /resolveMostRecentTab/);
  assert.match(source, /openSearchTab/);
  assert.match(source, /getBrowserDefaultSearchApi/);
  assert.match(source, /searchApi[\s\S]*\.query\(\{\s*text:\s*normalizedQuery,\s*tabId:\s*createdTab\.id\s*\}\)/);
  assert.match(source, /url:\s*searchApi \? "about:blank" : buildSearchUrl/);
  assert.match(source, /browser\.tabs\.update\(createdTab\.id/);
  assert.match(source, /buildSearchUrl/);
  assert.match(source, /normalizeSearchQuery/);
  assert.match(source, /Enter a search query/);
  assert.match(source, /activateMostRecentTab/);
  assert.match(source, /closeCurrentTabAndActivateRecent/);
  assert.match(source, /browser\.tabs\.create/);
  assert.match(source, /browser\.tabs\.remove/);
  assert.match(source, /browser\.tabs\.onActivated\.addListener/);
  assert.match(source, /settings\.skipPinnedTabs/);
  assert.match(source, /settings\.wrapAround/);
  assert.match(source, /captureTabScroll\(activeTab\)/);
  assert.match(source, /restoreScroll\(targetTab\)/);
  assert.match(source, /browser\.tabs\.getZoom/);
  assert.match(source, /browser\.tabs\.setZoom/);
  assert.match(source, /restoreTabZoom/);
  assert.match(source, /normalizeScrollData/);
  assert.match(source, /entry\?\.url !== currentUrl/);
  assert.match(source, /TABWHEEL_STORAGE_KEYS\.scrollMemory/);
  assert.match(source, /TABWHEEL_STORAGE_KEYS\.mruState/);
  assert.match(source, /MAX_SCROLL_MEMORY_ENTRIES/);
  assert.match(source, /MAX_MRU_TABS/);
  assert.doesNotMatch(source, /wheelListByWindowId|getTaggedTabs|toggleCurrentTag|removeTaggedTab|clearTaggedTabs|activateTaggedTab|MAX_WHEEL_LIST_TABS|TABWHEEL_STORAGE_KEYS\.wheelList/);
});

test("popup exposes MRU mode and fallback controls", () => {
  const popupSource = readText("src/entryPoints/toolbarPopup/toolbarPopup.ts");
  const popupHtml = readText("src/entryPoints/toolbarPopup/toolbarPopup.html");
  const popupCss = readText("src/entryPoints/toolbarPopup/toolbarPopup.css");

  assert.match(popupSource, /getTabWheelOverviewWithRetry/);
  assert.match(popupSource, /cycleTabWheel/);
  assert.match(popupSource, /refreshCurrentTabWheel/);
  assert.match(popupSource, /openTabWheelSearchTab/);
  assert.match(popupSource, /activateMostRecentTabWheelTab/);
  assert.match(popupSource, /closeCurrentTabWheelTabAndActivateRecent/);
  assert.match(popupSource, /setTabWheelCycleScope/);
  assert.match(popupSource, /suppressPageStatus:\s*true/);
  assert.match(popupSource, /saveTabWheelSettings/);
  assert.match(popupSource, /popupToast/);
  assert.match(popupSource, /announceUnavailable/);
  assert.match(popupSource, /await refreshAll\(\{\s*announceUnavailable:\s*true\s*\}\)/);
  assert.match(popupHtml, /Current Cycle Mode/);
  assert.match(popupHtml, /class="mode-pill"/);
  assert.match(popupHtml, /id="generalModeBtn"/);
  assert.match(popupHtml, /id="mruModeBtn"/);
  assert.match(popupHtml, /id="prevTabBtn"/);
  assert.match(popupHtml, /id="nextTabBtn"/);
  assert.match(popupHtml, /id="searchForm"/);
  assert.match(popupHtml, /id="searchQueryInput"/);
  assert.doesNotMatch(popupHtml, /Search Google/);
  assert.match(popupHtml, /id="recentTabBtn"/);
  assert.match(popupHtml, /id="closeRecentBtn"/);
  assert.match(popupHtml, /id="skipRestrictedPages"/);
  assert.match(popupHtml, /id="titlebarText"/);
  assert.match(popupHtml, /id="refreshTabWheelBtn"/);
  assert.match(popupHtml, /Refresh TabWheel on this tab/);
  assert.match(popupCss, /\.shortcut-panel[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(popupCss, /\.mode-pill/);
  assert.match(popupCss, /\.search-row[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(popupCss, /\.gesture-row[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(popupCss, /\.titlebar-button[\s\S]*justify-self:\s*end/);
  assert.match(popupCss, /\.popup-scroll/);
  assert.match(popupCss, /\.popup-toast\s*\{[\s\S]*top:\s*50%[\s\S]*left:\s*50%/);
  assert.match(popupCss, /\.popup-toast\.is-visible/);
  assert.match(popupCss, /overflow-y:\s*auto/);
  assert.doesNotMatch(`${popupSource}\n${popupHtml}\n${popupCss}`, /Wheel List|newTabBtn|tagCurrentBtn|clearTagsBtn|taggedTabsList|tagged-list|tagged-row|toggleCurrentTabWheelTag|clearTagged|removeTagged/);
});

test("options and help document the MRU click gesture model", () => {
  const optionsSource = readText("src/entryPoints/optionsPage/optionsPage.ts");
  const optionsHtml = readText("src/entryPoints/optionsPage/optionsPage.html");
  const helpSource = readText("src/lib/ui/panels/help/help.ts");
  const headerIndex = optionsHtml.indexOf("settings-header");
  const modifierIndex = optionsHtml.indexOf('for="gestureModifier"');
  const shiftIndex = optionsHtml.indexOf('for="gestureWithShift"');
  const presetIndex = optionsHtml.indexOf('for="wheelPreset"');
  const modeIndex = optionsHtml.indexOf('for="cycleScope"');

  assert.ok(headerIndex >= 0);
  assert.ok(modifierIndex > headerIndex);
  assert.ok(shiftIndex > modifierIndex);
  assert.ok(presetIndex > shiftIndex);
  assert.ok(modeIndex > presetIndex);
  assert.match(optionsSource, /gestureModifierSelect/);
  assert.match(optionsSource, /cycleScopeSelect/);
  assert.match(optionsSource, /TABWHEEL_CYCLE_SCOPES/);
  assert.match(optionsSource, /searchUrlTemplateInput/);
  assert.match(optionsSource, /skipRestrictedPagesInput/);
  assert.match(optionsHtml, /id="gestureModifier"/);
  assert.match(optionsHtml, /id="gestureWithShift"/);
  assert.match(optionsHtml, /id="wheelPreset"/);
  assert.match(optionsHtml, /id="cycleScope"/);
  assert.match(optionsHtml, /id="searchUrlTemplate"/);
  assert.match(optionsHtml, /id="skipRestrictedPages"/);
  assert.match(optionsHtml, /General follows tab strip order\. MRU follows most-recently-used tab order\./);
  assert.match(optionsHtml, /Open the in-page search launcher/);
  assert.match(optionsHtml, /Jump to the most recently used tab/);
  assert.match(optionsHtml, /Close the current tab and activate the most recently used tab/);
  assert.match(optionsHtml, /Modifier-click caveat/);
  assert.match(optionsHtml, /Some sites and browsers reserve modifier \+ left\/middle\/right click combinations/);
  assert.match(optionsHtml, /Extension constraints/);
  assert.match(optionsHtml, /chrome:\/\/extensions/);
  assert.match(optionsHtml, /about:addons/);
  assert.match(helpSource, /MRU/);
  assert.match(helpSource, /Left Click opens the in-page search launcher/);
  assert.match(helpSource, /Middle Click jumps to the most recently used tab/);
  assert.match(helpSource, /Right Click closes this tab/);
  assert.match(helpSource, /Restricted pages/);
  assert.match(helpSource, /Horizontal wheel/);
  assert.match(helpSource, /Safe overshoot guard/);
  assert.match(helpSource, /title: "Caveats",\s*layout: "centered"/);
  assert.match(helpSource, /modifier \+ left\/middle\/right click can be reserved by sites, browsers, or the OS/);
  assert.match(helpSource, /page gestures work on normal web pages; browser UI, stores, PDFs, and internal pages can block content scripts/);
  assert.doesNotMatch(`${optionsSource}\n${optionsHtml}\n${helpSource}`, /Wheel List|tag\/untag|tagged|showCycleToast|Right Hold|Alt \+ T|Switch feedback/);
});

test("search launcher uses panel host and opens search tabs", () => {
  const source = readText("src/lib/ui/panels/searchLauncher/searchLauncher.ts");
  const css = readText("src/lib/ui/panels/searchLauncher/searchLauncher.css");

  assert.match(source, /createPanelHost\(\)/);
  assert.match(source, /getBaseStyles\(\)/);
  assert.match(source, /registerPanelCleanup\(close\)/);
  assert.match(source, /openTabWheelSearchTab\(query\)/);
  assert.match(source, /normalizeSearchQuery/);
  assert.match(source, /class="ht-search-cancel"[\s\S]*Cancel/);
  assert.doesNotMatch(source, /ht-search-close|Close search/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /Enter a search query/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-busy/);
  assert.match(css, /\.ht-search-launcher/);
  assert.match(css, /\.ht-search-actions/);
  assert.match(css, /\.ht-search-cancel/);
  assert.doesNotMatch(css, /\.ht-search-close/);
  assert.match(css, /\.ht-search-status/);
  assert.match(css, /\.ht-search-submit:disabled/);
  assert.match(css, /backface-visibility:\s*hidden/);
  assert.match(css, /will-change:\s*transform/);
  assert.match(css, /contain:\s*layout style paint/);
});

test("removed dedicated tag panel files are not referenced", () => {
  const source = [
    readText("src/lib/appInit/appInit.ts"),
    readText("src/entryPoints/toolbarPopup/toolbarPopup.ts"),
    readText("src/lib/common/utils/panelHost.ts"),
    readText("esBuildConfig/lint.mjs"),
  ].join("\n");

  assert.doesNotMatch(source, /ui\/panels\/tabWheel|ht-tabwheel-container|openTabWheelPanel|Wheel List|tagged/);
});
