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

test("background runtime composes only TabWheel domain and handler", () => {
  const source = readText("src/entryPoints/backgroundRuntime/background.ts");

  assert.match(source, /createTabWheelDomain/);
  assert.match(source, /createTabWheelMessageHandler\(tabWheel\)/);
  assert.match(source, /registerRuntimeMessageRouter\(\s*\[/);
  assert.match(source, /tabWheel\.registerLifecycleListeners\(\)/);
  assert.match(source, /tabWheel\.ensureLoaded\(\)/);
  assert.doesNotMatch(source, /tabManager|anchorTags|sessionMessageHandler|commandRouter|startupRestore|miscMessageHandler/);
});

test("TabWheel message handler routes mutation, cycling, scroll, help, and settings", () => {
  const source = readText("src/lib/backgroundRuntime/handlers/tabWheelMessageHandler.ts");

  assert.match(source, /case "TABWHEEL_GET_CURRENT_STATE":[\s\S]*domain\.getCurrentState\(sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_TAG_CURRENT":[\s\S]*domain\.tagCurrent\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_REMOVE_CURRENT":[\s\S]*domain\.removeCurrent\(sender\.tab,\s*message\.windowId\)/);
  assert.match(source, /case "TABWHEEL_REMOVE_TAB":[\s\S]*domain\.removeTab\([\s\S]*message\.tabId,[\s\S]*message\.windowId\s*\?\?\s*sender\.tab\?\.windowId/);
  assert.match(source, /case "TABWHEEL_CLEAR_WINDOW":[\s\S]*domain\.clearWindow\(message\.windowId\s*\?\?\s*sender\.tab\?\.windowId\)/);
  assert.match(source, /case "TABWHEEL_LIST":[\s\S]*domain\.list\(message\.windowId\s*\?\?\s*sender\.tab\?\.windowId\)/);
  assert.match(source, /case "TABWHEEL_ACTIVATE":[\s\S]*domain\.activate\([\s\S]*message\.tabId,[\s\S]*message\.windowId\s*\?\?\s*sender\.tab\?\.windowId/);
  assert.match(source, /case "TABWHEEL_CYCLE":[\s\S]*domain\.cycle\(message\.direction,\s*sender\.tab\)/);
  assert.match(source, /case "TABWHEEL_SAVE_SCROLL_POSITION":[\s\S]*domain\.saveScrollPosition\(/);
  assert.match(source, /case "TABWHEEL_OPEN_HELP":[\s\S]*openHelpInActiveTab\(\)/);
  assert.match(source, /case "TABWHEEL_OPEN_OPTIONS":[\s\S]*openOptionsPage\(\)/);
  assert.doesNotMatch(source, /TABWHEEL_SESSION|saveSession|loadSession|listSessions|deleteSession/);
});

test("content script implements modifier wheel/click gestures and tagged scroll memory", () => {
  const source = readText("src/lib/appInit/appInit.ts");

  assert.match(source, /window\.addEventListener\("wheel",\s*wheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(source, /window\.addEventListener\("pointerdown",\s*pointerDownHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("pointerup",\s*pointerUpHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("pointercancel",\s*pointerCancelHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("mousedown",\s*mouseDownHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("mouseup",\s*mouseUpHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("click",\s*clickHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("auxclick",\s*auxClickHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("contextmenu",\s*contextMenuHandler,\s*true\)/);
  assert.match(source, /window\.removeEventListener\("pointercancel",\s*pointerCancelHandler,\s*true\)/);
  assert.doesNotMatch(source, /document\.addEventListener\("(?:pointerdown|pointerup|pointercancel|mousedown|mouseup|click|auxclick|contextmenu)"/);
  assert.doesNotMatch(source, /document\.removeEventListener\("(?:pointerdown|pointerup|pointercancel|mousedown|mouseup|click|auxclick|contextmenu)"/);
  assert.doesNotMatch(source, /window\.addEventListener\("(?:click|auxclick|contextmenu)",\s*\w+,\s*false\)/);
  assert.doesNotMatch(source, /window\.removeEventListener\("(?:click|auxclick|contextmenu)",\s*\w+,\s*false\)/);
  assert.match(source, /claimModifierClickGesture/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source, /MODIFIER_CLICK_SUPPRESSION_MS|MOUSE_GESTURE_OWNERSHIP_TIMEOUT_MS|POST_MOUSE_GESTURE_SUPPRESSION_MS/);
  assert.match(source, /SHORTCUT_KEYUP_SUPPRESSION_MS/);
  assert.match(source, /EVENT_MODIFIER_KEYS:\s*readonly TabWheelEventModifierKey\[\]\s*=\s*\["alt",\s*"ctrl",\s*"shift",\s*"meta"\]/);
  assert.match(source, /settings\.gestureModifier/);
  assert.match(source, /settings\.gestureWithShift/);
  assert.match(source, /settings\.panelModifier/);
  assert.match(source, /settings\.panelWithShift/);
  assert.match(source, /settings\.helpModifier/);
  assert.match(source, /settings\.helpWithShift/);
  assert.match(source, /getCurrentTabWheelStateWithRetry/);
  assert.match(source, /TAGGED_PILL_ID/);
  assert.match(source, /TAGGED_FAVICON_ATTR/);
  assert.match(source, /TAGGED_FAVICON_RESTORE_ATTR/);
  assert.match(source, /buildTaggedFaviconHref/);
  assert.match(source, /ensureTaggedFavicon/);
  assert.match(source, /forceRestoreOriginalFavicon/);
  assert.match(source, /removeFaviconRestoreLinks/);
  assert.match(source, /ensureTaggedPill/);
  assert.match(source, /applyTaggedIndicators/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /scheduleTaggedIndicatorRefresh/);
  assert.match(source, /getTabCycleWheelDelta/);
  assert.match(source, /return event\.deltaX/);
  assert.match(source, /resolveWheelDirection\(wheelDelta,\s*settings\.invertScroll\)/);
  assert.match(source, /type MouseGestureTerminalEvent = "click" \| "auxclick" \| "contextmenu"/);
  assert.match(source, /interface OwnedMouseGesture \{[\s\S]*terminalEvent: MouseGestureTerminalEvent;[\s\S]*startClientX: number;[\s\S]*startClientY: number;[\s\S]*releaseClientX: number \| null;[\s\S]*releaseClientY: number \| null;[\s\S]*hasReleased: boolean;[\s\S]*\}/);
  assert.match(source, /ownedMouseGesturesByButton = new Map<number, OwnedMouseGesture>\(\)/);
  assert.match(source, /function resolveMouseGestureTerminalEvent\(button: number\): MouseGestureTerminalEvent \| null \{[\s\S]*button === 0[\s\S]*"click"[\s\S]*button === 1[\s\S]*"auxclick"[\s\S]*button === 2[\s\S]*"contextmenu"/);
  assert.match(source, /function isOwnedMouseGestureTerminalEvent\([\s\S]*gesture: OwnedMouseGesture,[\s\S]*event: MouseEvent,[\s\S]*terminalEvent: MouseGestureTerminalEvent,[\s\S]*\): boolean \{[\s\S]*!event\.isTrusted[\s\S]*gesture\.terminalEvent !== terminalEvent[\s\S]*terminalEvent === "contextmenu"[\s\S]*event\.button === 2[\s\S]*gesture\.hasReleased[\s\S]*event\.detail > 0/);
  assert.match(source, /function ownMouseGesture\(button: number,\s*event: MouseEvent\): boolean \{[\s\S]*const terminalEvent = resolveMouseGestureTerminalEvent\(button\);[\s\S]*if \(!terminalEvent\) return false;[\s\S]*ownedMouseGesturesByButton\.set\(button,[\s\S]*terminalEvent,[\s\S]*startClientX: event\.clientX,[\s\S]*startClientY: event\.clientY,[\s\S]*releaseClientX: null,[\s\S]*releaseClientY: null,[\s\S]*hasReleased: false,[\s\S]*\}\);[\s\S]*return true;/);
  assert.match(source, /function markOwnedMouseGestureReleased\(button: number,\s*event: MouseEvent\): boolean \{[\s\S]*ownedMouseGesturesByButton\.get\(button\);[\s\S]*gesture\.releaseClientX = event\.clientX;[\s\S]*gesture\.releaseClientY = event\.clientY;[\s\S]*gesture\.hasReleased = true;[\s\S]*return true;/);
  assert.match(source, /function completeOwnedMouseGesture\([\s\S]*event: MouseEvent,[\s\S]*\): boolean \{[\s\S]*isOwnedMouseGestureTerminalEvent\(gesture,\s*event,\s*terminalEvent\)[\s\S]*clearOwnedMouseGesture\(button\);[\s\S]*runModifierClickAction\(button\);[\s\S]*return true;/);
  assert.match(source, /function claimModifierClickGesture\(button: number,\s*event: MouseEvent\): void \{[\s\S]*if \(hasOwnedMouseGesture\(button\)\) return;[\s\S]*ownMouseGesture\(button,\s*event\);[\s\S]*\}/);
  assert.doesNotMatch(source, /function claimModifierClickGesture\(button: number,[\s\S]*\): void \{[\s\S]*runModifierClickAction\(button\)/);
  const runModifierClickActionSource = source.slice(
    source.indexOf("function runModifierClickAction(button: number): void"),
    source.indexOf("\n  function claimModifierClickGesture", source.indexOf("function runModifierClickAction(button: number): void")),
  );
  assert.match(runModifierClickActionSource, /tagCurrentTab\(\)\.then\(\(\) => \{[\s\S]*scheduleTaggedIndicatorRefresh\(\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*showStatus\("Tag failed"\);/);
  assert.match(runModifierClickActionSource, /removeCurrentTabTag\(\)\.then\(\(\) => \{[\s\S]*scheduleTaggedIndicatorRefresh\(\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*showStatus\("Remove failed"\);/);
  assert.doesNotMatch(runModifierClickActionSource, /showStatus\(result\.ok|Tagged tab|Already tagged|Removed tag/);
  assert.match(source, /function isHandledModifierMouseEvent\([\s\S]*event: MouseEvent,[\s\S]*button = event\.button,[\s\S]*\): boolean \{[\s\S]*event\.isTrusted[\s\S]*isTabWheelModifier\(event,\s*settings\.gestureModifier,\s*settings\.gestureWithShift\)/);
  assert.match(source, /function pointerDownHandler\(event: PointerEvent\): void \{[\s\S]*clearOwnedMouseGestures\(\);[\s\S]*suppressPageEvent\(event\);[\s\S]*claimModifierClickGesture\(event\.button,\s*event\);/);
  assert.match(source, /function pointerUpHandler\(event: PointerEvent\): void \{[\s\S]*markOwnedMouseGestureReleased\(event\.button,\s*event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(source, /function pointerCancelHandler\(event: PointerEvent\): void \{[\s\S]*clearOwnedMouseGesture\(event\.button\);[\s\S]*suppressPageEvent\(event\);[\s\S]*\}/);
  assert.match(source, /function mouseDownHandler\(event: MouseEvent\): void \{[\s\S]*clearOwnedMouseGestures\(\);[\s\S]*suppressPageEvent\(event\);[\s\S]*claimModifierClickGesture\(event\.button,\s*event\);/);
  assert.match(source, /function mouseUpHandler\(event: MouseEvent\): void \{[\s\S]*markOwnedMouseGestureReleased\(event\.button,\s*event\)[\s\S]*suppressPageEvent\(event\);/);
  const clickHandlerSource = source.slice(
    source.indexOf("function clickHandler(event: MouseEvent): void"),
    source.indexOf("\n  function isShortcutEvent", source.indexOf("function clickHandler(event: MouseEvent): void")),
  );
  const auxClickHandlerSource = source.slice(
    source.indexOf("function auxClickHandler(event: MouseEvent): void"),
    source.indexOf("\n  function contextMenuHandler", source.indexOf("function auxClickHandler(event: MouseEvent): void")),
  );
  const contextMenuHandlerSource = source.slice(
    source.indexOf("function contextMenuHandler(event: MouseEvent): void"),
    source.indexOf("\n  function storageChangedHandler", source.indexOf("function contextMenuHandler(event: MouseEvent): void")),
  );
  assert.match(clickHandlerSource, /completeOwnedMouseGesture\(0,\s*"click",\s*event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(auxClickHandlerSource, /event\.button === 1 && completeOwnedMouseGesture\(1,\s*"auxclick",\s*event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(contextMenuHandlerSource, /completeOwnedMouseGesture\(2,\s*"contextmenu",\s*event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(clickHandlerSource, /isHandledModifierMouseEvent\(event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(auxClickHandlerSource, /isHandledModifierMouseEvent\(event\)[\s\S]*suppressPageEvent\(event\);/);
  assert.match(contextMenuHandlerSource, /isHandledModifierMouseEvent\(event,\s*2\)[\s\S]*suppressPageEvent\(event\);/);
  assert.doesNotMatch(clickHandlerSource, /runModifierClickAction/);
  assert.doesNotMatch(auxClickHandlerSource, /runModifierClickAction/);
  assert.doesNotMatch(contextMenuHandlerSource, /runModifierClickAction/);
  assert.doesNotMatch(source, /suppressAllNativeMouseFollowups|extendOwnedMouseGestureTerminalSuppression|releaseOwnedMouseGesture|markMouseGestureSuppressed|ownedMouseGestureTimersByButton/);
  assert.match(source, /isModifierKeyName/);
  assert.match(source, /isShortcutKeyEvent/);
  assert.match(source, /event\.code === `Digit\$\{normalizedKey\}`/);
  assert.match(source, /markShortcutKeyUpSuppressed/);
  assert.match(source, /window\.addEventListener\("keydown",\s*keyDownHandler,\s*true\)/);
  assert.match(source, /window\.addEventListener\("keyup",\s*keyUpHandler,\s*true\)/);
  assert.match(source, /document\.addEventListener\("keyup",\s*keyUpHandler,\s*true\)/);
  assert.match(source, /window\.removeEventListener\("keydown",\s*keyDownHandler,\s*true\)/);
  assert.match(source, /window\.removeEventListener\("keyup",\s*keyUpHandler,\s*true\)/);
  assert.match(source, /document\.removeEventListener\("keyup",\s*keyUpHandler,\s*true\)/);
  assert.match(source, /changes\[TABWHEEL_STORAGE_KEYS\.taggedTabs\]/);
  assert.match(source, /document\.addEventListener\("DOMContentLoaded",\s*documentReadyHandler\)/);
  assert.match(source, /window\.addEventListener\("pageshow",\s*pageShowHandler\)/);
  const visibilityStart = source.indexOf("function visibilityHandler(): void");
  const visibilityEnd = source.indexOf("\n  function documentReadyHandler", visibilityStart);
  const visibilitySource = source.slice(visibilityStart, visibilityEnd);
  assert.match(visibilitySource, /flushScrollSnapshot\(\);[\s\S]*clearOwnedMouseGestures\(\);[\s\S]*closeClearConfirm\(\);[\s\S]*dismissPanel\(\);/);
  assert.match(source, /isShortcutEvent\(event,\s*settings\.panelModifier,\s*settings\.panelWithShift,\s*settings\.panelKey\)[\s\S]*suppressPageEvent\(event\);[\s\S]*openTabWheelPanel\(\)/);
  assert.match(source, /isShortcutEvent\(event,\s*settings\.helpModifier,\s*settings\.helpWithShift,\s*settings\.helpKey\)[\s\S]*suppressPageEvent\(event\);[\s\S]*openTabWheelHelpOverlay\(\)/);
  assert.match(source, /tagCurrentTab\(\)/);
  assert.match(source, /removeCurrentTabTag\(\)/);
  assert.match(source, /clearTaggedTabs\(\)/);
  assert.match(source, /data-tw-clear="yes"[\s\S]*data-tw-clear="no"/);
  const clearConfirmSource = source.slice(
    source.indexOf("function openClearConfirm(taggedCount: number): void"),
    source.indexOf("\n  async function requestClearTaggedTabs", source.indexOf("function openClearConfirm(taggedCount: number): void")),
  );
  assert.match(clearConfirmSource, /clearTaggedTabs\(\)\.then\(\(\) => \{[\s\S]*scheduleTaggedIndicatorRefresh\(\);[\s\S]*\}\)\.catch\(\(\) => \{[\s\S]*showStatus\("Clear failed"\);/);
  assert.doesNotMatch(clearConfirmSource, /showStatus\(result\.ok|Cleared \$\{taggedCount\}/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "y"[\s\S]*confirm\(\)/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "n"[\s\S]*cancel\(\)/);
  assert.match(source, /resolveWheelDirection\(wheelDelta,\s*settings\.invertScroll\)/);
  assert.match(source, /cycleTabWheel\(direction\)/);
  assert.match(source, /openTabWheelPanel\(\)/);
  assert.match(source, /openTabWheelHelpOverlay\(\)/);
  assert.match(source, /No currently tagged tabs/);
  assert.match(source, /SCROLL_SAVE_DEBOUNCE_MS/);
  assert.match(source, /saveTaggedTabScrollPosition\(scrollX,\s*scrollY\)/);
  assert.match(source, /case "SET_SCROLL":[\s\S]*restoreWindowScroll\(/);
  assert.match(source, /case "TABWHEEL_TAG_STATE_CHANGED":[\s\S]*applyTaggedIndicators\(receivedMessage\.isTagged\)/);
  assert.match(source, /case "OPEN_TABWHEEL_HELP":[\s\S]*openTabWheelHelpOverlay\(\)/);
});

test("TabWheel panel lists tagged tabs and binds configured entry point", () => {
  const panelSource = readText("src/lib/ui/panels/tabWheel/tabWheel.ts");
  const appInitSource = readText("src/lib/appInit/appInit.ts");

  assert.match(panelSource, /openTabWheelPanel/);
  assert.match(panelSource, /listTaggedTabsWithRetry/);
  assert.match(panelSource, /activateTaggedTab/);
  assert.match(panelSource, /removeTaggedTab/);
  assert.match(panelSource, /buildFuzzyPattern/);
  assert.match(panelSource, /buildSearchText/);
  assert.match(panelSource, /matchesSearch/);
  assert.match(panelSource, /scoreFuzzyMatch/);
  assert.match(panelSource, /normalizeSearchQuery/);
  assert.match(panelSource, /visibleEntries\.sort\(\(a,\s*b\) => a\.score - b\.score \|\| a\.index - b\.index\)/);
  assert.match(panelSource, /getFuzzyHighlightIndexes/);
  assert.match(panelSource, /renderHighlightedText/);
  assert.match(panelSource, /ht-tabwheel-highlight/);
  assert.match(panelSource, /is-searching/);
  assert.match(panelSource, /is-search-match/);
  assert.match(panelSource, /focusSearch/);
  assert.match(panelSource, /clearSearch/);
  assert.match(panelSource, /deleteActiveEntry/);
  assert.match(panelSource, /STATUS_CLEAR_MS/);
  assert.match(panelSource, /statusClearTimer/);
  assert.match(panelSource, /clearStatusTimer/);
  assert.match(panelSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(panelSource, /composedPath\(\)/);
  assert.match(panelSource, /stopPanelKeyboardBubble/);
  assert.match(panelSource, /shadow\.addEventListener\("keydown",\s*stopPanelKeyboardBubble\)/);
  assert.match(panelSource, /panelWheelHandler/);
  assert.match(panelSource, /panel\.addEventListener\("wheel",\s*panelWheelHandler,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(panelSource, /list\.scrollTop \+= resolveWheelDeltaY\(event,\s*list\)/);
  assert.match(panelSource, /event\.key\.toLowerCase\(\) === "f"/);
  assert.match(panelSource, /aria-label="Refresh tagged tabs"/);
  assert.match(panelSource, /aria-label="Open settings"/);
  assert.match(panelSource, /openTabWheelOptions/);
  assert.match(panelSource, /No tagged tabs/);
  assert.match(panelSource, /No currently tagged tabs/);
  assert.match(panelSource, /Fuzzy search matches tab titles, domains, and URLs/);
  assert.match(panelSource, /placeholder="Search"/);
  assert.match(panelSource, /data-action="clear-yes"/);
  assert.match(panelSource, /data-action="clear-yes"[\s\S]*data-action="clear-no"/);
  assert.match(panelSource, /isConfirmingClear && event\.key\.toLowerCase\(\) === "n"[\s\S]*setStatus\("Clear cancelled"\)/);
  assert.match(panelSource, /isConfirmingClear && event\.key\.toLowerCase\(\) === "y"[\s\S]*data-action="clear-yes"[\s\S]*button\?\.click\(\)/);
  assert.match(panelSource, /isConfirmingClear && event\.key\.toLowerCase\(\) === "y"[\s\S]*isTextInputEvent\(event\)/);
  assert.match(panelSource, /data-action="search"/);
  assert.match(panelSource, /footerRowHtml/);
  assert.match(panelSource, /key:\s*"Tab",\s*desc:\s*"list"/);
  assert.match(panelSource, /key:\s*"F",\s*desc:\s*"search"/);
  assert.match(panelSource, /key:\s*"Shift\+Space",\s*desc:\s*"clear search"/);
  assert.match(panelSource, /key:\s*"D",\s*desc:\s*"delete"/);
  assert.match(panelSource, /key:\s*"J\/K",\s*desc:\s*"move"/);
  assert.match(panelSource, /key:\s*"Wheel",\s*desc:\s*"scroll list"/);
  assert.match(panelSource, /event\.shiftKey && event\.code === "Space"/);
  assert.match(panelSource, /event\.key\.toLowerCase\(\) === "d"/);
  assert.match(panelSource, /setStatus\("Refreshed tagged tabs"\)/);
  assert.doesNotMatch(panelSource, /event\.key\.toLowerCase\(\) === "r"/);
  assert.doesNotMatch(panelSource, /key:\s*"f"|key:\s*"j\/k"/);
  assert.doesNotMatch(panelSource, /desc:\s*"refresh"/);
  assert.doesNotMatch(panelSource, /desc:\s*"filter live"/);
  assert.doesNotMatch(panelSource, /desc:\s*"saved while active"/);
  assert.doesNotMatch(panelSource, /desc:\s*"untag row"/);
  assert.match(appInitSource, /isShortcutEvent\(event,\s*settings\.panelModifier,\s*settings\.panelWithShift,\s*settings\.panelKey\)/);
  assert.match(appInitSource, /isShortcutEvent\(event,\s*settings\.helpModifier,\s*settings\.helpWithShift,\s*settings\.helpKey\)/);
  assert.match(appInitSource, /openTabWheelPanel\(\)/);
  assert.match(appInitSource, /openTabWheelHelpOverlay\(\)/);
});

test("settings expose configurable gesture, panel, and help shortcuts", () => {
  const contract = readText("src/lib/common/contracts/tabWheel.ts");
  const optionsSource = readText("src/entryPoints/optionsPage/optionsPage.ts");
  const optionsHtml = readText("src/entryPoints/optionsPage/optionsPage.html");

  assert.match(contract, /TABWHEEL_MODIFIER_KEYS/);
  assert.match(contract, /TABWHEEL_MODIFIER_KEYS:[\s\S]*\[\s*"alt",\s*"ctrl",\s*"meta",\s*\][\s\S]*as const/);
  assert.doesNotMatch(contract, /TABWHEEL_MODIFIER_KEYS:[\s\S]*"shift"[\s\S]*as const/);
  assert.match(contract, /TABWHEEL_PANEL_KEY_OPTIONS/);
  assert.match(contract, /gestureModifier:\s*"alt"/);
  assert.match(contract, /gestureWithShift:\s*false/);
  assert.match(contract, /panelModifier:\s*"alt"/);
  assert.match(contract, /panelWithShift:\s*false/);
  assert.match(contract, /panelKey:\s*"t"/);
  assert.match(contract, /helpModifier:\s*"alt"/);
  assert.match(contract, /helpWithShift:\s*false/);
  assert.match(contract, /helpKey:\s*"m"/);
  assert.match(contract, /formatTabWheelModifierCombo/);
  assert.match(contract, /formatTabWheelPanelShortcut/);
  assert.match(contract, /formatTabWheelHelpShortcut/);
  assert.match(optionsSource, /gestureModifierSelect/);
  assert.match(optionsSource, /gestureWithShiftInput/);
  assert.match(optionsSource, /panelModifierSelect/);
  assert.match(optionsSource, /panelWithShiftInput/);
  assert.match(optionsSource, /panelKeySelect/);
  assert.match(optionsSource, /helpModifierSelect/);
  assert.match(optionsSource, /helpWithShiftInput/);
  assert.match(optionsSource, /helpKeySelect/);
  assert.match(optionsSource, /saveTabWheelSettings\(settings\)/);
  assert.match(optionsHtml, /id="gestureModifier"/);
  assert.match(optionsHtml, /id="gestureWithShift"/);
  assert.match(optionsHtml, /id="panelModifier"/);
  assert.match(optionsHtml, /id="panelWithShift"/);
  assert.match(optionsHtml, /id="panelKey"/);
  assert.match(optionsHtml, /id="helpModifier"/);
  assert.match(optionsHtml, /id="helpWithShift"/);
  assert.match(optionsHtml, /id="helpKey"/);
  assert.match(optionsHtml, /id="helpShortcut"/);
});

test("TabWheel domain stores tagged tabs, preserves scroll x/y, and falls back to all tabs", () => {
  const source = readText("src/lib/backgroundRuntime/domains/tabWheelDomain.ts");

  assert.match(source, /TABWHEEL_STORAGE_KEYS\.taggedTabs/);
  assert.match(source, /MAX_TAGGED_TABS/);
  assert.match(source, /getCurrentState/);
  assert.match(source, /TAGGED_BADGE_TEXT = "TAG"/);
  assert.match(source, /TAGGED_BADGE_COLOR = "#32d74b"/);
  assert.match(source, /getTaggedTabIds/);
  assert.match(source, /notifyWindowTagState/);
  assert.match(source, /type:\s*"TABWHEEL_TAG_STATE_CHANGED"/);
  assert.match(source, /isTagged:\s*taggedTabIds\.has\(tab\.id\)/);
  assert.match(source, /await notifyWindowTagState\(activeTab\.windowId\)/);
  assert.match(source, /await notifyWindowTagState\(resolvedWindowId\)/);
  assert.match(source, /setBadgeText\(\{\s*tabId:\s*tab\.id,[\s\S]*text:\s*taggedTabIds\.has\(tab\.id\) \? TAGGED_BADGE_TEXT : ""/);
  assert.match(source, /getScroll\(activeTab\.id\)/);
  assert.match(source, /entry\.scrollX = scroll\.scrollX/);
  assert.match(source, /entry\.scrollY = scroll\.scrollY/);
  assert.match(source, /removeTab\(/);
  assert.match(source, /resolveCycleTargetIndex\(/);
  assert.match(source, /taggedTabIds/);
  assert.match(source, /restoreScroll\(targetTab\.id,\s*targetEntry\.scrollX,\s*targetEntry\.scrollY\)/);
  const cycleSource = source.slice(
    source.indexOf("async function cycle("),
    source.indexOf("\n  async function activate", source.indexOf("async function cycle(")),
  );
  assert.match(cycleSource, /browser\.tabs\.update\(targetTab\.id,\s*\{\s*active:\s*true\s*\}\)/);
  assert.match(cycleSource, /restoreScroll\(targetTab\.id,\s*targetEntry\.scrollX,\s*targetEntry\.scrollY\)/);
  assert.doesNotMatch(cycleSource, /sendStatus|Cycling all tabs|Tagged \$\{/);
  assert.match(source, /browser\.runtime\.onStartup\.addListener/);
  assert.doesNotMatch(source, /TabWheelSession|MAX_TABWHEEL_SESSIONS|TABWHEEL_STORAGE_KEYS\.sessions|saveSession|loadSession|listSessions|deleteSession/);
});

test("popup exposes tagged-tab controls, settings, and help", () => {
  const source = readText("src/entryPoints/toolbarPopup/toolbarPopup.ts");
  const html = readText("src/entryPoints/toolbarPopup/toolbarPopup.html");
  const css = readText("src/entryPoints/toolbarPopup/toolbarPopup.css");

  assert.match(source, /listTaggedTabsWithRetry/);
  assert.match(source, /tagCurrentTab/);
  assert.match(source, /removeCurrentTabTag/);
  assert.match(source, /removeTaggedTab/);
  assert.match(source, /clearTaggedTabs/);
  assert.match(source, /buildFuzzyPattern/);
  assert.match(source, /scoreFuzzyMatch/);
  assert.match(source, /renderHighlightedText/);
  assert.match(source, /clearSearch/);
  assert.match(source, /deleteActiveEntry/);
  assert.match(source, /id="clearYesBtn"[\s\S]*id="clearNoBtn"/);
  assert.match(source, /isConfirmingClear && event\.key\.toLowerCase\(\) === "n"[\s\S]*setStatus\("Clear cancelled"\)/);
  assert.match(source, /isConfirmingClear && event\.key\.toLowerCase\(\) === "y"[\s\S]*document\.getElementById\("clearYesBtn"\)\?\.click\(\)/);
  assert.match(source, /isConfirmingClear && event\.key\.toLowerCase\(\) === "y"[\s\S]*if \(event\.shiftKey && event\.code === "Space"\)/);
  assert.match(source, /event\.shiftKey && event\.code === "Space"/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "d"/);
  assert.match(source, /openTabWheelHelp/);
  assert.match(source, /loadTabWheelSettings/);
  assert.match(source, /formatTabWheelModifierCombo/);
  assert.match(source, /browser\.runtime\.openOptionsPage/);
  assert.match(html, /id="searchInput"/);
  assert.match(html, /id="refreshBtn"/);
  assert.match(html, /id="helpBtn"/);
  assert.match(html, /id="settingsBtn"/);
  assert.match(html, /Shift\+Space/);
  assert.match(html, />F<\/strong> search/);
  assert.match(html, />D<\/strong> delete/);
  assert.match(html, />J\/K<\/strong> move/);
  assert.doesNotMatch(html, />f<\/strong>|>j\/k<\/strong>/);
  assert.match(css, /\.tagged-row-shell/);
  assert.match(css, /\.search-input\.is-searching/);
  assert.match(css, /\.match-highlight/);
  assert.doesNotMatch(source, /Session|session|saveTabWheelSession|loadTabWheelSession|deleteTabWheelSession|listTabWheelSessions/);
  assert.doesNotMatch(html, /Session|sessionName|saveSessionBtn|sessionsList/);
  assert.doesNotMatch(source, /openBrowserSidePanel|sidePanel\.open|sidebarAction\.open/);
  assert.doesNotMatch(html, /id="panelBtn"/);
});

test("help panel is pivoted to TabWheel reference content", () => {
  const source = readText("src/lib/ui/panels/help/help.ts");

  assert.match(source, /openTabWheelHelpOverlay/);
  assert.match(source, /loadTabWheelSettings/);
  assert.match(source, /openTabWheelOptions/);
  assert.match(source, /formatTabWheelPanelShortcut/);
  assert.match(source, /formatTabWheelHelpShortcut/);
  assert.match(source, /buildHelpSections/);
  assert.match(source, /createPanelHost\(\)/);
  assert.match(source, /getBaseStyles\(\)/);
  assert.match(source, /registerPanelCleanup\(close\)/);
  assert.match(source, /\$\{gestureModifier\} \+ Wheel/);
  assert.match(source, /\$\{gestureModifier\} \+ Left Click/);
  assert.match(source, /Open help/);
  assert.match(source, /aria-label="Open settings"/);
  assert.match(source, /data-action="settings"/);
  assert.match(source, /How To Use/);
  assert.match(source, /layout:\s*"centered"/);
  assert.match(source, /ht-help-step/);
  assert.match(source, /Reserved shortcuts/);
  assert.match(source, /Scroll Memory/);
  assert.doesNotMatch(source, /label:\s*"1"|label:\s*"2"|label:\s*"3"|label:\s*"4"/);
  assert.doesNotMatch(source, /KeybindingsConfig|openHelpOverlay|Tab Manager|Anchor Tags|Sessions|sessions?/);
});
