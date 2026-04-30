# TabWheel

TabWheel is a browser extension for fast tab switching with `Alt` plus the scroll wheel by default.

Wheel down means next tab and wheel up means previous tab by default. TabWheel can switch the base modifier to `Ctrl` or `Meta`, can require `Shift`, can invert direction, and can tune sensitivity, cooldown, acceleration, pinned-tab handling, wrap-around, and left-right versus recent-tab cycling.

TabWheel claims matching page events as early as the browser allows, but browser-reserved pages such as `chrome://`, extension pages, browser stores, and devtools may not expose content-script shortcuts. The toolbar popup keeps the same controls available as a fallback.

## Features

- Cycle tabs with `Alt + Wheel` by default.
- Open quick controls with modifier + left click.
- Switch between left-right and most-recently-used cycling.
- Configure sensitivity, cooldown, and burst acceleration.
- Include or skip pinned tabs.
- Keep wrap-around on or stop at tab-list edges.
- Remember recent scroll X/Y positions and restore them when cycling back.
- Allow modifier-wheel cycling in editable fields by default, with a setting to turn it off for text boxes and rich editors.
- Open help and settings from quick controls or the toolbar popup.

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
    optionsPage/         # modifier-wheel and performance settings
    toolbarPopup/        # quick controls fallback
  lib/
    adapters/runtime/    # runtime-message client APIs
    backgroundRuntime/   # TabWheel domain and message handler
    common/              # contracts, migrations, shared helpers
    core/                # pure TabWheel cycling logic
    ui/panels/help/      # help overlay
    ui/panels/quickControls/ # in-page quick controls
```
