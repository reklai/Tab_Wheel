# TabWheel

TabWheel is a reliable, mouse-first tab switcher for people who want fast wheel-based navigation without sending page data outside the browser.

Wheel down or right means next tab, and wheel up or left means previous tab by default. TabWheel can switch the base modifier to `Ctrl` or `Meta`, can require `Shift`, can invert direction, and can tune presets, sensitivity, cooldown, acceleration, pinned-tab handling, wrap-around, horizontal wheel support, and safe overshoot guarding.

Use `Alt + Left Click` to add or remove the current tab from the Wheel List. Use `Alt + Right Click` to switch between General cycling and Wheel List cycling. TabWheel claims matching page events as early as the browser allows, refreshes its content script from the popup, and tries to activate existing normal web tabs after install or update. Browser-reserved pages such as `chrome://`, extension pages, browser stores, and devtools do not expose content-script shortcuts. The toolbar popup keeps the scrollable Wheel List panel, settings, and Previous / Next tab buttons available as a fallback.

## Features

- Cycle tabs with `Alt + Wheel` by default.
- Use popup Previous / Next buttons when page shortcuts are blocked.
- Add or remove the current tab from the Wheel List with modifier + left click.
- Switch between General and Wheel List cycling with modifier + right click.
- Configure Precise, Balanced, Fast, or Custom wheel presets.
- Configure sensitivity, cooldown, safe overshoot guard, horizontal wheel support, and burst acceleration.
- Include or skip pinned tabs.
- Keep wrap-around on or stop at tab-list edges.
- Show tagged state with a subtle in-page Wheel List mark and, when safe, a small favicon badge that preserves the site's original icon.
- Remember recent scroll X/Y positions per URL and restore them when cycling back to the same page.
- Editable-field setting: Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs.
- Open help and settings from the toolbar popup.
- Refresh TabWheel on the current tab without reloading the page.

## Development

- `npm ci`: install lockfile-pinned dependencies.
- `npm run watch:firefox` / `npm run watch:chrome`: rebuild on change for local extension development.
- `npm run build:firefox` / `npm run build:chrome`: emit production bundles into `dist/`.
- `npm run lint`: run architecture and naming checks.
- `npm run test`: execute `node --test test/*.test.mjs`.
- `npm run typecheck`: run strict TypeScript validation.
- `npm run ci`: run the full local gate.
- `npm run release:package`: build Firefox, Chrome, and source release artifacts into `release/`.

## Structure

```text
src/
  entryPoints/
    backgroundRuntime/   # background service/domain bootstrap
    contentScript/       # content script entry
    optionsPage/         # modifier-wheel and performance settings
    toolbarPopup/        # scrollable Wheel List panel and fallback controls
  lib/
    adapters/runtime/    # runtime-message client APIs
    backgroundRuntime/   # TabWheel domain and message handler
    common/              # contracts, migrations, shared helpers
    core/                # pure TabWheel cycling logic
    ui/panels/help/      # help overlay
```
