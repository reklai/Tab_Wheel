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
- Wheel List tagging with modifier + left click.
- General/Wheel List mode switching with modifier + right click.
- Popup Previous / Next fallback for restricted pages.
- Popup Refresh action that reconnects TabWheel without reloading the page.
- Local-only scroll memory with URL validation.
- Wheel presets, sensitivity, cooldown, horizontal wheel support, safe overshoot guard, and optional acceleration.
- Clear store/privacy language: no page content leaves the browser.
