# TabWheel - Mouse Wheel Tab Switcher

TabWheel is a browser extension for switching tabs with the mouse scroll wheel. By default, hold `Alt` and scroll on a normal web page to move to the next or previous tab.

It is built for a small, reliable workflow:

- `Alt + Wheel`: switch tabs.
- `Alt + Left Click`: tag or untag the current tab for the Wheel List.
- `Alt + Right Click`: switch between General cycling and Wheel List cycling.
- Toolbar popup: manage tagged tabs, change mode, tune wheel behavior, and use Previous / Next fallback controls.

## Features

- Mouse wheel tab switching with configurable modifier: `Alt`, `Ctrl`, or `Meta`.
- Optional `Shift` requirement to reduce accidental activation.
- General mode for normal tab-order cycling.
- Wheel List mode for cycling only tagged tabs.
- Precise, Balanced, Fast, and Custom wheel presets.
- Sensitivity, cooldown, acceleration, horizontal wheel, wrap-around, pinned-tab, and overshoot guard settings.
- Scroll memory for restoring recent scroll X/Y positions when returning to the same URL.
- Editable-field setting for wheel-cycling inside text boxes, search fields, and editors/docs.
- Subtle in-page Wheel List indicator for tagged tabs.
- Best-effort favicon badge for tagged tabs when the browser allows safe favicon composition.
- Popup Refresh action that reconnects TabWheel on the current page without reloading it.

## Browser Support

- Chrome and Chromium-based browsers use the Manifest V3 build.
- Firefox and Zen Browser use the Manifest V2 build.

Browser UI pages, extension pages, browser stores, devtools, PDF viewers, and some restricted pages may block content scripts. The popup Previous / Next buttons remain available as a fallback where the toolbar popup can run.

## Privacy

TabWheel does not use telemetry, tracking, analytics, remote code, or developer-owned servers.

The extension stores settings, Wheel List entries, recent scroll positions, and URL checks in browser-local storage. Wheel List entries include local tab metadata such as tab ID, window ID, URL, title, pinned state, and timestamps.

The optional favicon badge may request the page favicon URL with credentials omitted so the badge can be drawn locally. The favicon image is not sent to a TabWheel server.

See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

## Install For Development

Install dependencies:

```bash
npm ci
```

Build once:

```bash
npm run build:chrome
npm run build:firefox
```

Watch during extension development:

```bash
npm run watch:chrome
npm run watch:firefox
```

Load the generated `dist/` build in your browser:

- Chrome: open `chrome://extensions`, enable Developer mode, choose `Load unpacked`, and select `dist/chrome`.
- Firefox: open `about:debugging`, choose `This Firefox`, choose `Load Temporary Add-on`, and select the generated Firefox manifest or extension file.

## Quality Gate

Run the full local gate:

```bash
npm run ci
```

Individual checks:

```bash
npm run lint
npm run test
npm run typecheck
npm run verify:compat
npm run verify:upgrade
npm run verify:store
```

## Release Artifacts

Build Chrome, Firefox, and source packages into `release/`:

```bash
npm run release:package
```

Generated output:

- `release/tabwheel-chrome-v1.0.1.zip`
- `release/tabwheel-firefox-v1.0.1.xpi`
- `release/tabwheel-source-v1.0.1.zip`

## Project Structure

```text
src/
  entryPoints/
    backgroundRuntime/
      background.ts      # background bootstrap; creates the TabWheel domain and message router
    contentScript/
      contentScript.ts   # content script bootstrap; calls appInit
    optionsPage/
      optionsPage.html   # full settings page markup
      optionsPage.css    # settings page styles
      optionsPage.ts     # settings load/save and dynamic labels
    toolbarPopup/
      toolbarPopup.html  # browser action popup markup
      toolbarPopup.css   # popup layout, responsive controls, Wheel List styles
      toolbarPopup.ts    # popup state, fallback actions, tagging, mode switching, refresh
  lib/
    appInit/
      appInit.ts         # page-side listeners, indicators, scroll memory, help overlay trigger
    adapters/runtime/
      runtimeClient.ts   # typed runtime messaging helpers and retry behavior
      tabWheelApi.ts     # content/popup API wrappers around runtime messages
    backgroundRuntime/
      domains/
        tabWheelDomain.ts        # tab cycling, Wheel List, scroll memory, refresh/injection logic
      handlers/
        runtimeRouter.ts         # shared runtime message routing
        tabWheelMessageHandler.ts # TabWheel message handler and favicon fetch helper
    common/
      contracts/
        runtimeMessages.ts # background/content/popup message shapes
        tabWheel.ts        # settings, defaults, presets, storage keys, normalization
      utils/
        helpers.ts                  # shared UI/data helpers
        panelHost.ts                # shared Shadow DOM overlay host and tokens
        storageMigrations.ts        # pure storage migration logic
        storageMigrationsRuntime.ts # browser storage migration runner
    core/
      tabWheel/
        tabWheelCore.ts    # pure wheel delta normalization and tab target math
    ui/
      panels/
        help/
          help.ts          # in-page help overlay
          help.css         # help overlay styles
  icons/                   # extension icons and image assets
  types.d.ts               # shared global TypeScript declarations
esBuildConfig/
  build.mjs                # Chrome/Firefox bundle builder
  manifest_v2.json         # Firefox/Zen manifest
  manifest_v3.json         # Chrome manifest
  packageRelease.mjs       # release zip/xpi/source packager
  verifyCompat.mjs         # manifest compatibility checks
  verifyStore.mjs          # store/privacy documentation checks
  verifyUpgrade.mjs        # storage migration fixture checks
  lint.mjs                 # repository-specific architecture checks
test/
  *.test.mjs               # Node test suite
  fixtures/upgrade/        # storage upgrade fixtures
dist/                      # generated browser builds; not source
release/                   # generated release artifacts; not source
```

## Documentation

- [STORE.md](./STORE.md): store listing reference.
- [PRIVACY.md](./PRIVACY.md): privacy policy.
- [RELEASE.md](./RELEASE.md): release notes and packaging notes.
- [CONTRIBUTING.md](./CONTRIBUTING.md): contributor workflow.

## License

TabWheel is licensed under the [MIT License](./LICENSE).
