# TabWheel

TabWheel is a browser extension for cycling tabs with `Alt` plus the scroll wheel by default. It can run in two modes:

- With no tagged tabs, `Alt + Wheel` cycles all tabs from left to right.
- With one or more tagged tabs, `Alt + Wheel` cycles only the tagged tabs and skips everything else.

Wheel down means next tab and wheel up means previous tab by default. TabWheel uses `Alt` by default, can switch the base modifier to `Ctrl` or `Meta`, and can require `Shift` on top of any of those modifiers. The options page can also change the in-page panel key, the help key, and the wheel direction.

TabWheel claims matching page events as early as the browser allows, but browser-reserved or OS-reserved shortcuts may not reach content scripts.

## Features

- Tag up to 15 tabs per browser window.
- Open the in-page tagged-tab panel with `Alt + T` by default.
- Open the help menu with `Alt + M` by default.
- Use `Alt`, `Ctrl`, or `Meta` as the base modifier, with optional `Shift`.
- Fuzzy-search tagged tabs live from the in-page panel.
- Remove individual tags from the in-page panel.
- Show tagged state with a favicon marker, toolbar badge fallback, and small in-page pill.
- Cycle tagged tabs with `Alt + Wheel` by default.
- Fall back to all-tab cycling when no tabs are tagged.
- `Alt + Left Click` tags the current tab by default.
- `Alt + Right Click` removes the current tab tag by default.
- `Alt + Middle Click` asks before clearing all tags in the current window by default.
- Remember scroll X/Y for each tagged tab and restore it when cycling back.
- Keep a help panel available from the toolbar popup.
- Open settings from the in-page panel gear or the toolbar popup.

## Development

- `npm ci`: install lockfile-pinned dependencies.
- `npm run watch:firefox` / `npm run watch:chrome`: rebuild on change for local extension development.
- `npm run build:firefox` / `npm run build:chrome`: emit production bundles into `dist/`.
- `npm run lint`: run architecture and naming checks.
- `npm run test`: execute `node --test test/*.test.mjs`.
- `npm run typecheck`: run strict TypeScript validation.
- `npm run ci`: run the full local gate.

## Structure

```text
src/
  entryPoints/
    backgroundRuntime/   # background service/domain bootstrap
    contentScript/       # content script entry
    optionsPage/         # modifier, panel/help key, and invert-scroll settings
    toolbarPopup/        # tag/help/settings controls
  lib/
    adapters/runtime/    # runtime-message client APIs
    backgroundRuntime/   # TabWheel domain and message handler
    common/              # contracts, migrations, shared helpers
    core/                # pure TabWheel cycling logic
    ui/panels/help/      # retained help overlay
    ui/panels/tabWheel/  # in-page tagged-tab panel
```
