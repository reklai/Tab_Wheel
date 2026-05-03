# Store Reference - TabWheel

## Listing Title

Mouse Wheel Tab Switcher

## Extension Names

- Firefox / Zen: Mouse Wheel Tab Switcher
- Chrome: Mouse Wheel Tab Switcher

## Summary (short, <=132 chars)

Mouse scroll wheel tab switcher with MRU mode, in-page search, recent-tab, and close-to-recent gestures.

## Description

TabWheel is a mouse scroll wheel-based browser navigation extension for quickly switching between tabs without reaching for the tab strip. Use Alt + Wheel by default for modifier-wheel cycling: wheel down or right moves to the next tab, and wheel up or left moves to the previous tab. Direction, modifier, Shift requirement, pinned-tab behavior, restricted-page skipping, wrap-around, sensitivity, cooldown, horizontal wheel support, acceleration, and safe overshoot guarding are configurable.

Use Alt + Left Click to open an in-page search launcher that opens results in a new adjacent tab using the browser's current default search provider. A configurable search URL template is kept as a fallback. Use Alt + Middle Click to jump to the most recently used tab. Use Alt + Right Click to close the current tab and activate the most recently used tab when one is available; if no eligible recent tab exists, the current tab stays open. General mode cycles through eligible tabs in visible tab-strip order. MRU mode cycles through eligible tabs in most-recently-used order.

The extension popup toolbar gives you the main controls in one place: current cycle mode, Previous / Next fallback buttons, search, recent-tab, close-tab controls, a Refresh action for reconnecting TabWheel on the current page, and wheel tuning.

Presets include Precise, Balanced, Fast, and Custom. Editable-field control lets you allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs. Middle-click recent-tab switching runs on the completed click to avoid duplicate activation from browser event timing. TabWheel can also remember recent root scroll positions, normalized page position, and browser zoom, then restore them when cycling back to the same URL using URL checks to avoid stale restores.

TabWheel tries to activate existing normal web tabs after install or update, and the popup Refresh action can reconnect TabWheel on the current page without reloading the page. Browser-reserved pages such as `chrome://`, extension pages, browser stores, devtools, PDF viewers, and some restricted pages do not allow page shortcuts; TabWheel skips those pages during wheel cycling by default, and the toolbar popup search field and tab controls remain available where the popup can run.

Everything runs locally in your browser using extension storage. TabWheel stores settings, the fallback search URL template, MRU tab order, recent scroll positions, page geometry, tab zoom, and URL checks locally. TabWheel does not use telemetry, tracking, analytics, remote code, or external data transfer.

Customize controls:

- Open the TabWheel extension popup toolbar
- Change the base modifier between Alt / Option, Ctrl / Control, and Meta / Command
- Change the fallback search URL template
- Optionally require Shift to reduce accidental activation
- Pick a wheel preset: Precise, Balanced, Fast, or Custom
- Adjust sensitivity, cooldown, acceleration, horizontal wheel support, pinned-tab handling, restricted-page skipping, wrap-around, and safe overshoot guard
- Use Previous / Next, search, recent tab, and close tab when page shortcuts are unavailable
- Use Refresh TabWheel when a normal page needs the content script reconnected

## Privacy

No data leaves your browser. TabWheel stores settings, the fallback search URL template, MRU tab order, recent scroll positions, page geometry, tab zoom, and URL checks for scroll restore through browser storage.

## Permissions

- `tabs`: Read, activate, create, and close tabs for cycling and click actions.
- `storage`: Store settings, fallback search URL template, MRU tab order, scroll positions, page geometry, tab zoom, and schema version locally.
- `search`: Run searches with the browser's current default search provider.
- `scripting` (Chrome): Activate the content script on already-open normal web tabs after install or update.
- `<all_urls>`: Run the content script on pages so modifier-wheel cycling and scroll memory can work.

## Browser Support

Works on Firefox, Chrome, and Zen Browser.
