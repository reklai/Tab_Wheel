# Store Reference - TabWheel

## Listing Title

TabWheel - Reliable Wheel Tab Switching

## Extension Names

- Firefox / Zen: TabWheel
- Chrome: TabWheel

## Summary (short, <=132 chars)

Mouse scroll wheel tab switcher: Alt+Wheel switches tabs; Alt+Left tags/untags; Alt+Right switches cycle mode.

## Description

TabWheel is a reliable mouse scroll wheel-based tab switcher. Alt + Wheel switches tabs, Alt + Left Click tags or untags the current tab, and Alt + Right Click switches between General cycling and Wheel List cycling. General mode cycles eligible tabs in visible tab-strip order; Wheel List mode cycles only tagged tabs.

The extension popup toolbar keeps the main controls configurable and customizable: current mode, Wheel List entries, tag current, remove all, Previous / Next fallback buttons, a Refresh action for reconnecting TabWheel on the current page, and wheel tuning. Marked tabs show a subtle in-page Wheel List label and, when safe, a small favicon badge that preserves the site's original icon.

TabWheel includes Precise, Balanced, Fast, and Custom presets, horizontal wheel support, safe overshoot guarding, pinned-tab filtering, wrap-around, sensitivity, cooldown, editable-field control, and optional burst acceleration. Editable-field control means: Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs. TabWheel tries to activate existing normal web tabs after install or update. Browser-reserved pages such as `chrome://`, extension pages, browser stores, and devtools do not allow page shortcuts; use the toolbar popup's controls there.

TabWheel can remember recent scroll positions and restore them when cycling back to the same URL. Scroll memory, URL checks, Wheel List entries, and settings are stored locally and work only where the browser allows the content script to read and restore page scroll.

## Privacy

No data leaves your browser. TabWheel stores settings, Wheel List entries, recent scroll positions, and URL checks for scroll restore through browser storage.

## Permissions

- `tabs`: Read and activate tabs for cycling and Wheel List actions.
- `storage`: Store settings, Wheel List entries, scroll positions, and schema version locally.
- `scripting` (Chrome): Activate the content script on already-open normal web tabs after install or update.
- `<all_urls>`: Run the content script on pages so modifier-wheel cycling and scroll memory can work.

## Browser Support

Works on Firefox, Chrome, and Zen Browser.
