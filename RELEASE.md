# Release Notes

Release packages are generated from `dist/` after browser builds complete.

Expected package names use the TabWheel brand:

- `tabwheel-firefox-v<version>.xpi`
- `tabwheel-chrome-v<version>.zip`
- `tabwheel-source-v<version>.zip`

Run `npm run ci` before preparing a release, then run:

```bash
npm run release:package
```

## 1.0.0

Initial public release focused on reliability over surface area:

- Modifier-wheel tab cycling on normal web pages.
- General and MRU wheel cycling modes.
- Modifier + left click opens an in-page search launcher using the browser's default search provider, with a configurable URL-template fallback.
- Modifier + middle click activates the most recently used tab.
- Modifier + right click closes the current tab and activates the most recently used tab.
- Popup fallback controls for restricted pages.
- Popup Refresh action that reconnects TabWheel without reloading the page.
- Local-only scroll memory with URL validation, normalized root position, layout-stability restore, and browser zoom restore.
- Wheel presets, sensitivity, cooldown, horizontal wheel support, restricted-page skipping, safe overshoot guard, and optional acceleration.
- Clear store/privacy language: no page content leaves the browser.
