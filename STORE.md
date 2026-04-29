# Store Reference — TabWheel

## Extension Names

- Firefox / Zen: TabWheel
- Chrome: TabWheel

## Summary (short, <=132 chars)

Cycle tagged tabs with Alt plus the scroll wheel by default. Falls back to all tabs when nothing is tagged.

## Description

TabWheel lets you tag browser tabs and cycle only those tabs with `Alt + Wheel` by default. If no tabs are tagged, the same gesture cycles through all tabs from left to right, with wheel down moving to the next tab and wheel up moving to the previous tab.

Use `Alt + T` to open the in-page tagged-tab panel, `Alt + M` to open help, `Alt + Left Click` to tag the current tab, `Alt + Right Click` to remove the current tab tag, and `Alt + Middle Click` to confirm clearing all tags in the current window. The options page can switch the base modifier between Alt, Ctrl, and Meta, require Shift in addition to that modifier, change the panel key, change the help key, and invert the wheel direction. Tagged tabs remember their scroll X/Y position when the page can run the content script.

The toolbar popup lists tagged tabs, opens settings, and opens the built-in help panel. The in-page panel also opens settings from its gear button and provides fuzzy search and per-row tag removal.

Tagged tabs are marked with a favicon indicator where page access allows it, a toolbar badge fallback, and a small in-page tagged pill while the page is active.

## Privacy

No data leaves your browser. TabWheel stores tagged tabs, scroll positions, and settings locally through browser storage.

## Permissions

- `tabs`: Read and activate tabs for cycling and tagging.
- `storage`: Store tagged tabs, scroll positions, settings, and schema version locally.
- `<all_urls>`: Run the content script on pages so wheel/click gestures and scroll memory can work.

## Browser Support

Works on Firefox, Chrome, and Zen Browser.
