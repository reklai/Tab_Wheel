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

test("message handler routes Wheel List, cycling, scroll, help, and settings", () => {
  const source = readText("src/lib/backgroundRuntime/handlers/tabWheelMessageHandler.ts");

  assert.match(source, /case "TABWHEEL_CONTENT_READY":[\s\S]*domain\.markContentScriptReady\(sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_CYCLE":[\s\S]*domain\.cycle\(message\.direction,\s*sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_REFRESH_CURRENT_TAB":[\s\S]*domain\.refreshCurrentTab\(sender\.tab,\s*message\.windowId/);
  assert.match(source, /case "TABWHEEL_GET_OVERVIEW":[\s\S]*domain\.getOverview\(sender\.tab/);
  assert.match(source, /case "TABWHEEL_TOGGLE_CURRENT_TAG":[\s\S]*domain\.toggleCurrentTag\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_REMOVE_TAGGED_TAB":[\s\S]*domain\.removeTaggedTab\(message\.tabId,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_CLEAR_TAGGED_TABS":[\s\S]*domain\.clearTaggedTabs\(message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_ACTIVATE_TAGGED_TAB":[\s\S]*domain\.activateTaggedTab\(message\.tabId,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_TOGGLE_CYCLE_SCOPE":[\s\S]*domain\.toggleCycleScope\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_SET_CYCLE_SCOPE":[\s\S]*domain\.setCycleScope\(message\.cycleScope,\s*sender\.tab,\s*message\.windowId,\s*\{[\s\S]*suppressPageStatus:\s*message\.suppressPageStatus/);
  assert.match(source, /case "TABWHEEL_FETCH_FAVICON":[\s\S]*fetchFaviconData\(message\.href\)/);
  assert.match(source, /case "TABWHEEL_SAVE_SCROLL_POSITION":[\s\S]*domain\.saveScrollPosition\(/);
  assert.match(source, /case "TABWHEEL_OPEN_HELP":[\s\S]*openHelpInActiveTab\(\)/);
  assert.match(source, /case "TABWHEEL_OPEN_OPTIONS":[\s\S]*openOptionsPage\(\)/);
  assert.match(source, /MAX_FAVICON_BYTES/);
  assert.match(source, /arrayBufferToBase64/);
  assert.match(source, /data:\$\{mimeType\};base64,\$\{base64\}/);
  assert.doesNotMatch(source, /GET_CYCLE_MODE|SET_CYCLE_MODE|TABWHEEL_MRU|cycleOrder/);
});

test("content script implements modifier-wheel, left-click tagging, right-click scope switching, and indicators", () => {
  const source = readText("src/lib/appInit/appInit.ts");
  const messages = readText("src/lib/common/contracts/runtimeMessages.ts");

  assert.match(source, /window\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /document\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /isTopFrame\(\)/);
  assert.match(source, /if \(isTopFrameContext\)[\s\S]*browser\.runtime\.onMessage\.addListener\(messageHandler\)/);
  assert.match(source, /window\.addEventListener\("pointerdown",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("mousedown",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("pointerup",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("mouseup",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("click",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("auxclick",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("contextmenu",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("pointerdown",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("mousedown",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("pointerup",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("mouseup",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("click",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("auxclick",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("contextmenu",\s*mouseGestureHandler,\s*true\)/);
  assert.match(source, /event\.button === 0/);
  assert.match(source, /event\.button === 2/);
  assert.match(source, /MOUSE_GESTURE_CLAIM_MS/);
  assert.match(source, /areSettingsLoaded/);
  assert.match(source, /isMouseGestureStartEvent/);
  assert.match(source, /claimedMouseGesture/);
  assert.match(source, /suppressPageEvent\(event\)/);
  assert.match(source, /!settings\.allowGesturesInEditableFields && isEditableTarget\(target\)/);
  assert.match(source, /normalizeWheelDelta\(event,\s*window\.innerHeight,\s*window\.innerWidth,\s*settings\.horizontalWheel\)/);
  assert.match(source, /wheelAccumulator \+= wheelDelta \* settings\.wheelSensitivity/);
  assert.match(source, /settings\.wheelCooldownMs/);
  assert.match(source, /settings\.wheelAcceleration/);
  assert.match(source, /settings\.overshootGuard/);
  assert.match(source, /OVERSHOOT_GUARD_MS/);
  assert.match(source, /toggleCurrentTabWheelTag\(\)/);
  assert.match(source, /typeof result\.isCurrentTagged !== "boolean"/);
  assert.match(source, /applyTaggedIndicators\(result\.isCurrentTagged,\s*result\.cycleScope \|\| settings\.cycleScope\)/);
  assert.match(source, /toggleTabWheelCycleScope\(\)/);
  assert.doesNotMatch(source, /toggleTabWheelCycleScope\(\)\.then\(\(result\)[\s\S]*showStatus\(result\.reason\)/);
  assert.match(source, /TAGGED_PILL_ID/);
  assert.match(source, /tw-tagged-dot/);
  assert.match(source, /tw-tagged-label/);
  assert.match(source, /In-Wheel List \(Cycle Mode: \$\{cycleScopeLabel\(cycleScope\)\}\)/);
  assert.match(source, /TAGGED_FAVICON_ATTR/);
  assert.match(source, /TAGGED_FAVICON_RESTORE_ATTR/);
  assert.match(source, /MAX_ORIGINAL_FAVICON_CACHE_ENTRIES = 20/);
  assert.match(source, /originalFaviconHrefByPageUrl = new Map<string,\s*string>\(\)/);
  assert.match(source, /getFaviconCacheKey\(\)/);
  assert.match(source, /cacheOriginalFaviconHref\(pageUrl,\s*originalHref\)/);
  assert.match(source, /buildTaggedFaviconHref/);
  assert.match(source, /fetchTabWheelFaviconData\(originalHref\)/);
  assert.match(source, /loadTaggedFaviconImage/);
  assert.match(source, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(source, /link\.type = "image\/png"/);
  assert.match(source, /ensureTaggedFavicon\(\)/);
  assert.match(source, /removeTaggedFavicon\(\)/);
  assert.match(source, /const pageUrl = getFaviconCacheKey\(\)/);
  assert.match(source, /const originalHref = getCachedOriginalFaviconHref\(pageUrl\)[\s\S]*lastTaggedFaviconSourceHref[\s\S]*getCurrentFaviconHref\(\)/);
  assert.match(source, /removeCachedOriginalFaviconHref\(pageUrl\)/);
  assert.match(source, /restoreOriginalFavicon\(originalHref\)/);
  assert.match(source, /removeFaviconRestoreLinks\(\)/);
  assert.match(source, /observeFaviconChanges\(\)/);
  assert.match(source, /applyTaggedIndicators\(receivedMessage\.isTagged,\s*receivedMessage\.cycleScope\)/);
  assert.match(source, /TABWHEEL_CONTENT_READY/);
  assert.match(source, /case "TABWHEEL_PING"/);
  assert.match(messages, /TABWHEEL_STATUS/);
  assert.match(messages, /TABWHEEL_TAG_STATE_CHANGED/);
  assert.match(messages, /TABWHEEL_FETCH_FAVICON/);
  assert.doesNotMatch(source, /data:image\/svg\+xml|#202124/);
  assert.doesNotMatch(`${source}\n${messages}`, /openQuickControlsPanel|showCycleToast|CYCLE_MODE|mruState|MAX_MRU/);
});

test("settings contract exposes Wheel List scope and wheel tuning", () => {
  const contract = readText("src/lib/common/contracts/tabWheel.ts");
  const types = readText("src/types.d.ts");

  assert.match(contract, /scrollMemory:\s*"tabWheelScrollMemory"/);
  assert.match(contract, /wheelList:\s*"tabWheelWheelList"/);
  assert.match(contract, /MAX_WHEEL_LIST_TABS = 15/);
  assert.match(contract, /TABWHEEL_CYCLE_SCOPES:[\s\S]*\["general",\s*"tagged"\]/);
  assert.match(contract, /TABWHEEL_PRESETS:[\s\S]*\["precise",\s*"balanced",\s*"fast",\s*"custom"\]/);
  assert.match(contract, /wheelPreset:\s*"balanced"/);
  assert.match(contract, /wheelSensitivity:\s*1/);
  assert.match(contract, /wheelCooldownMs:\s*160/);
  assert.match(contract, /wheelAcceleration:\s*false/);
  assert.match(contract, /horizontalWheel:\s*true/);
  assert.match(contract, /overshootGuard:\s*true/);
  assert.match(types, /type TabWheelCycleScope = "general" \| "tagged"/);
  assert.match(types, /type TabWheelPreset = "precise" \| "balanced" \| "fast" \| "custom"/);
  assert.match(types, /interface TabWheelTaggedTabEntry/);
  assert.match(types, /interface TabWheelFaviconFetchResult extends TabWheelActionResult/);
  assert.match(types, /interface TabWheelRefreshResult extends TabWheelActionResult/);
  assert.match(types, /isCurrentTagged\?: boolean/);
  assert.match(types, /taggedTabs: TabWheelTaggedTabEntry\[\]/);
  assert.match(types, /type TabWheelContentScriptStatus = "ready" \| "unavailable"/);
  assert.doesNotMatch(`${contract}\n${types}`, /TabWheelCycleOrder|TabWheelMruState|TABWHEEL_CYCLE_ORDERS|MAX_MRU|mruState|showCycleToast/);
});

test("domain supports Wheel List cycling with URL-validated scroll memory", () => {
  const source = readText("src/lib/backgroundRuntime/domains/tabWheelDomain.ts");

  assert.match(source, /scrollMemoryByTabId: ScrollMemoryByTabId/);
  assert.match(source, /wheelListByWindowId: WheelListByWindowId/);
  assert.match(source, /contentScriptReadyUrlsByTabId = new Map<number,\s*string>/);
  assert.match(source, /activateExistingContentScripts/);
  assert.match(source, /refreshCurrentTab/);
  assert.match(source, /const wasReady = await pingContentScript\(activeTab\)/);
  assert.match(source, /wasReady \|\| overview\.contentScriptStatus === "ready"/);
  assert.match(source, /pingContentScript/);
  assert.match(source, /waitForContentScriptReady/);
  assert.match(source, /runtimeBrowser\.scripting\?\.executeScript/);
  assert.match(source, /runtimeBrowser\.tabs\.executeScript/);
  assert.match(source, /allFrames:\s*true/);
  assert.match(source, /TabWheel cannot run on this page\./);
  assert.match(source, /markContentScriptReady/);
  assert.match(source, /resolveContentScriptStatus/);
  assert.match(source, /resolveStripTargetTab/);
  assert.match(source, /getTaggedTabs/);
  assert.match(source, /toggleCurrentTag/);
  assert.match(source, /isCurrentTagged:\s*false/);
  assert.match(source, /isCurrentTagged:\s*true/);
  assert.match(source, /removeTaggedTab/);
  assert.match(source, /clearTaggedTabs/);
  assert.match(source, /activateTaggedTab/);
  assert.match(source, /setCycleScope/);
  assert.match(source, /Tag a tab first/);
  assert.match(source, /settings\.skipPinnedTabs/);
  assert.match(source, /settings\.wrapAround/);
  assert.match(source, /captureTabScroll\(activeTab\)/);
  assert.match(source, /restoreScroll\(targetTab\)/);
  assert.match(source, /entry\?\.url !== currentUrl/);
  assert.match(source, /TABWHEEL_STORAGE_KEYS\.scrollMemory/);
  assert.match(source, /TABWHEEL_STORAGE_KEYS\.wheelList/);
  assert.match(source, /MAX_SCROLL_MEMORY_ENTRIES/);
  assert.match(source, /MAX_WHEEL_LIST_TABS/);
  assert.doesNotMatch(source, /resolveMruTargetTab|mruTabIdsByWindowId|TABWHEEL_STORAGE_KEYS\.mruState|MAX_MRU|cycleModeByWindowId/);
});

test("popup exposes the scrollable Wheel List panel and fallback controls", () => {
  const popupSource = readText("src/entryPoints/toolbarPopup/toolbarPopup.ts");
  const popupHtml = readText("src/entryPoints/toolbarPopup/toolbarPopup.html");
  const popupCss = readText("src/entryPoints/toolbarPopup/toolbarPopup.css");

  assert.match(popupSource, /getTabWheelOverviewWithRetry/);
  assert.match(popupSource, /cycleTabWheel/);
  assert.match(popupSource, /refreshCurrentTabWheel/);
  assert.match(popupSource, /refreshCurrentTabWheelState/);
  assert.doesNotMatch(popupSource, /browser\.tabs\.reload/);
  assert.match(popupSource, /titlebarTextEl\.textContent = overview[\s\S]*TabWheel \(/);
  assert.match(popupSource, /toggleCurrentTabWheelTag/);
  assert.match(popupSource, /setTabWheelCycleScope/);
  assert.match(popupSource, /suppressPageStatus:\s*true/);
  assert.match(popupSource, /activateTaggedTabWheelTab/);
  assert.match(popupSource, /clearTaggedTabWheelTabs/);
  assert.match(popupSource, /removeTaggedTabWheelTab/);
  assert.match(popupSource, /saveTabWheelSettings/);
  assert.match(popupSource, /popupToast/);
  assert.match(popupSource, /is-visible/);
  assert.match(popupSource, /onHidden\?: \(\) => void/);
  assert.match(popupSource, /interface RenderStateOptions/);
  assert.match(popupSource, /announceUnavailable/);
  assert.match(popupSource, /await refreshAll\(\{\s*announceUnavailable:\s*true\s*\}\)/);
  assert.match(popupSource, /Click Remove all again to empty the Wheel List",\s*false,\s*\(\) => \{[\s\S]*isConfirmingClear = false/);
  assert.doesNotMatch(popupSource, /showStatus\(direction === "prev"/);
  assert.match(popupHtml, /Current Cycle Mode/);
  assert.match(popupHtml, /class="mode-pill"/);
  assert.match(popupHtml, /id="generalModeBtn"/);
  assert.match(popupHtml, /id="wheelListModeBtn"/);
  assert.match(popupHtml, /id="tagCurrentBtn"/);
  assert.match(popupHtml, /id="prevTabBtn"/);
  assert.match(popupHtml, /id="nextTabBtn"/);
  assert.match(popupHtml, /id="titlebarText"/);
  assert.match(popupHtml, /id="refreshTabWheelBtn"/);
  assert.match(popupHtml, /Refresh TabWheel on this tab/);
  assert.match(popupHtml, /id="clearTagsBtn"/);
  assert.match(popupHtml, /id="wheelListSection"/);
  assert.match(popupHtml, /id="wheelListToggle"/);
  assert.match(popupHtml, /class="summary-actions"/);
  assert.match(popupHtml, /id="taggedTabsList"/);
  assert.match(popupHtml, /id="wheelPreset"/);
  assert.match(popupHtml, /id="horizontalWheel"/);
  assert.match(popupHtml, /id="overshootGuard"/);
  assert.match(popupHtml, /id="popupToast"/);
  assert.doesNotMatch(popupHtml, /Current tab|Not tagged|Off by default/);
  assert.match(popupHtml, /Previous/);
  assert.match(popupHtml, /Next/);
  assert.match(popupCss, /\.shortcut-panel[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(popupCss, /\.mode-pill/);
  assert.match(popupCss, /\.titlebar-button[\s\S]*justify-self:\s*end/);
  assert.match(popupCss, /\.tagged-list\s*\{[\s\S]*max-height:\s*190px[\s\S]*overflow-y:\s*auto/);
  assert.match(popupCss, /\.list-section\.is-open \.tagged-list/);
  assert.match(popupCss, /\.popup-scroll/);
  assert.match(popupCss, /\.popup-toast\s*\{[\s\S]*top:\s*50%[\s\S]*left:\s*50%/);
  assert.match(popupCss, /\.popup-toast\.is-visible/);
  assert.match(popupCss, /overflow-y:\s*auto/);
  assert.doesNotMatch(`${popupHtml}\n${popupCss}`, /statusLine|status-line/);
  assert.doesNotMatch(`${popupHtml}\n${popupCss}`, /tabMeta|meta-pill|titlebar-actions/);
  assert.doesNotMatch(`${popupSource}\n${popupHtml}`, /cycleOrder|most-recently-used|MRU|showCycleToast/);
});

test("options and help document the simple Wheel List gesture model", () => {
  const optionsSource = readText("src/entryPoints/optionsPage/optionsPage.ts");
  const optionsHtml = readText("src/entryPoints/optionsPage/optionsPage.html");
  const helpSource = readText("src/lib/ui/panels/help/help.ts");
  const headerIndex = optionsHtml.indexOf("settings-header");
  const modifierIndex = optionsHtml.indexOf('for="gestureModifier"');
  const shiftIndex = optionsHtml.indexOf('for="gestureWithShift"');
  const presetIndex = optionsHtml.indexOf('for="wheelPreset"');
  const editableIndex = optionsHtml.indexOf('for="allowGesturesInEditableFields"');

  assert.ok(headerIndex >= 0);
  assert.ok(modifierIndex > headerIndex);
  assert.ok(shiftIndex > modifierIndex);
  assert.ok(presetIndex > shiftIndex);
  assert.ok(editableIndex > presetIndex);
  assert.match(optionsSource, /gestureModifierSelect/);
  assert.match(optionsSource, /wheelPresetSelect/);
  assert.match(optionsSource, /horizontalWheelInput/);
  assert.match(optionsSource, /overshootGuardInput/);
  assert.doesNotMatch(optionsSource, /cycleScopeSelect|TABWHEEL_CYCLE_SCOPES|populateCycleScopeSelect|cycleScopeLabel/);
  assert.match(optionsHtml, /id="gestureModifier"/);
  assert.match(optionsHtml, /id="gestureWithShift"/);
  assert.match(optionsHtml, /id="wheelPreset"/);
  assert.match(optionsHtml, /id="horizontalWheel"/);
  assert.match(optionsHtml, /id="overshootGuard"/);
  assert.match(optionsHtml, /Choose the base key used for wheel cycling, tag\/untag, and cycle-mode switching\./);
  assert.match(optionsHtml, /Add Shift to the selected modifier to reduce accidental wheel switches\./);
  assert.match(optionsHtml, /Allow wheel-cycling when cursor is inside text boxes, search fields, and editors\/docs/);
  assert.match(optionsHtml, /Modifier-click caveat/);
  assert.match(optionsHtml, /Some sites and browsers reserve modifier \+ left\/right click combinations/);
  assert.match(optionsHtml, /Extension constraints/);
  assert.match(optionsHtml, /chrome:\/\/extensions/);
  assert.match(optionsHtml, /about:addons/);
  assert.match(optionsHtml, /use the toolbar popup controls there/);
  assert.match(optionsHtml, /Left Click/);
  assert.match(optionsHtml, /Right Click/);
  assert.doesNotMatch(optionsHtml, /id="cycleScope"|Current cycle mode|General cycles eligible tabs|Wheel List cycles only tabs you marked/);
  assert.match(helpSource, /Wheel List/);
  assert.match(helpSource, /Left Click/);
  assert.match(helpSource, /Right Click/);
  assert.match(helpSource, /Allow wheel-cycling when cursor is inside text boxes, search fields, and editors\/docs/);
  assert.match(helpSource, /Horizontal wheel/);
  assert.match(helpSource, /Safe overshoot guard/);
  assert.match(helpSource, /title: "Caveats",\s*layout: "centered"/);
  assert.match(helpSource, /Modifier-click caveat/);
  assert.match(helpSource, /modifier \+ left\/right click can be reserved by sites, browsers, or the OS/);
  assert.match(helpSource, /Extension constraints/);
  assert.match(helpSource, /page gestures work on normal web pages; browser UI, stores, PDFs, and internal pages can block content scripts/);
  assert.match(`${optionsHtml}\n${helpSource}`, /Prevent extra tab jumps from trackpad or wheel momentum|prevents extra tab jumps from trackpad or wheel momentum/);
  assert.doesNotMatch(helpSource, /Scroll Memory|What it remembers|URL check|Untagged tabs|scroll X \/ Y/);
  assert.doesNotMatch(helpSource, /The toolbar popup gives you Previous \/ Next buttons and Wheel List management|ht-help-tip/);
  assert.doesNotMatch(`${optionsSource}\n${optionsHtml}\n${helpSource}`, /cycleOrder|most-recently-used|MRU|Right Hold|Alt \+ T|Alt \+ M|Switch feedback|showCycleToast|rich editors|while typing|shortcuts work in inputs|wheel-cycling works in text boxes|stray inertial ticks|same-direction inertial/);
});

test("removed dedicated tag panel files are not referenced", () => {
  const source = [
    readText("src/lib/appInit/appInit.ts"),
    readText("src/entryPoints/toolbarPopup/toolbarPopup.ts"),
    readText("src/lib/common/utils/panelHost.ts"),
    readText("esBuildConfig/lint.mjs"),
  ].join("\n");

  assert.doesNotMatch(source, /ui\/panels\/tabWheel|ht-tabwheel-container|openTabWheelPanel/);
});
