# Store Reference - TabWheel

## Extension Names

- Firefox / Zen: TabWheel
- Chrome: TabWheel

## Summary (short, <=132 chars)

Switch tabs quickly with Alt+Wheel, recent-tab mode, scroll memory, and wheel tuning.

## Description

TabWheel lets you switch browser tabs with `Alt + Wheel` by default. Wheel down moves forward and wheel up moves backward unless you invert the direction. You can cycle by left-right browser tab order or most-recently-used order, include or skip pinned tabs, keep wrap-around enabled or stop at the tab-list edge, and tune sensitivity, cooldown, and burst acceleration.

Use modifier + left click to open quick controls on pages where content scripts are available. The toolbar popup exposes the same controls for browser-reserved pages where page shortcuts may not run, such as `chrome://`, extension pages, browser stores, and devtools.

TabWheel can remember recent scroll positions and restore them when cycling back to a page. Scroll memory is stored locally and works only where the browser allows the content script to read and restore page scroll.

## Privacy

No data leaves your browser. TabWheel stores settings and recent scroll positions locally through browser storage.

## Permissions

- `tabs`: Read and activate tabs for cycling.
- `storage`: Store settings, scroll positions, and schema version locally.
- `<all_urls>`: Run the content script on pages so modifier-wheel cycling and scroll memory can work.

## Browser Support

Works on Firefox, Chrome, and Zen Browser.
