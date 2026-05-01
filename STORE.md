# Store Reference - TabWheel

## Listing Title

TabWheel - Mouse Wheel Tab Switcher

## Extension Names

- Firefox / Zen: TabWheel - Mouse Wheel Tab Switcher
- Chrome: TabWheel - Mouse Wheel Tab Switcher

## Summary (short, <=132 chars)

Mouse scroll wheel tab switcher: Alt+Wheel switches tabs; Alt+Left tags/untags; Alt+Right switches cycle mode.

## Description

TabWheel is a mouse scroll wheel-based browser navigation extension for quickly switching between tabs without reaching for the tab strip. Use Alt + Wheel by default for modifier-wheel cycling: wheel down or right moves to the next tab, and wheel up or left moves to the previous tab. Direction, modifier, Shift requirement, pinned-tab behavior, wrap-around, sensitivity, cooldown, horizontal wheel support, acceleration, and safe overshoot guarding are configurable.

Use Alt + Left Click to tag or untag the current tab for the Wheel List. Use Alt + Right Click to switch between General cycling and Wheel List mode. General mode cycles through eligible tabs in visible tab-strip order. Wheel List mode cycles only the tabs you tagged, making it useful for keeping a small working set reachable while the rest of the window stays open.

The extension popup toolbar gives you the main controls in one place: current cycle mode, tagged tab list, tag current, remove all, Previous / Next fallback buttons, a Refresh action for reconnecting TabWheel on the current page, and wheel tuning. Marked tabs show a subtle in-page Wheel List label and, when safe, a small favicon badge that preserves the site's original icon.

Presets include Precise, Balanced, Fast, and Custom. Editable-field control lets you allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs. TabWheel can also remember recent scroll positions and restore them when cycling back to the same URL, using URL checks to avoid stale scroll restores.

TabWheel tries to activate existing normal web tabs after install or update, and the popup Refresh action can reconnect TabWheel on the current page without reloading the page. Browser-reserved pages such as `chrome://`, extension pages, browser stores, devtools, PDF viewers, and some restricted pages do not allow page shortcuts; use the toolbar popup controls there.

Everything runs locally in your browser using extension storage. TabWheel stores settings, Wheel List entries, recent scroll positions, and URL checks locally. TabWheel does not use telemetry, tracking, analytics, remote code, or external data transfer.

Customize controls:

- Open the TabWheel extension popup toolbar
- Change the base modifier between Alt, Ctrl, and Meta
- Optionally require Shift to reduce accidental activation
- Pick a wheel preset: Precise, Balanced, Fast, or Custom
- Adjust sensitivity, cooldown, acceleration, horizontal wheel support, pinned-tab handling, wrap-around, and safe overshoot guard
- Use Previous / Next when page shortcuts are unavailable
- Use Refresh TabWheel when a normal page needs the content script reconnected

## Privacy

No data leaves your browser. TabWheel stores settings, Wheel List entries, recent scroll positions, and URL checks for scroll restore through browser storage.

## Permissions

- `tabs`: Read and activate tabs for cycling and Wheel List actions.
- `storage`: Store settings, Wheel List entries, scroll positions, and schema version locally.
- `scripting` (Chrome): Activate the content script on already-open normal web tabs after install or update.
- `<all_urls>`: Run the content script on pages so modifier-wheel cycling and scroll memory can work.

## Browser Support

Works on Firefox, Chrome, and Zen Browser.
