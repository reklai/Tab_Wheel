# TabWheel - Mouse Wheel Tab Switcher

TabWheel is a browser extension for switching tabs with the mouse scroll wheel. By default, hold `Alt` and scroll on a normal web page to move to the next or previous tab.

It is built for a small, reliable workflow:

- `Alt + Wheel`: switch tabs.
- `Alt + Left Click`: open the in-page search launcher by default, or the browser's normal new tab page when enabled.
- `Alt + Middle Click`: jump to the most recently used tab.
- `Alt + Right Click`: close the current tab and activate the most recently used tab when one is available.
- Toolbar popup: change mode, tune wheel behavior, and use fallback controls.

## Engineering Promise

TabWheel follows a fast, feature-rich, and browser-native promise, with reliability first.

- Fast: hot-path gestures do little work in the page, tab cycling serializes bursty wheel input, and scroll capture/restore is best-effort when it should not block activation.
- Feature-rich: the core workflow includes configurable wheel cycling, MRU mode, search, recent-tab, close-to-recent, popup fallbacks, and scroll memory without turning the page into a custom application shell.
- Browser-native: behavior is built on browser extension APIs, capture-phase DOM events, Shadow DOM overlays, and real browser lifecycle events such as fullscreen changes rather than trying to override reserved browser behavior.

## Features

- Mouse wheel tab switching with configurable modifier: `Alt / Option`, `Ctrl / Control`, or `Meta / Command`.
- In-page search launcher that uses the browser's default search provider first, with a fixed Google fallback if the browser search API is unavailable and an optional Browser Default left-click new tab mode.
- Optional `Shift` requirement to reduce accidental activation.
- General mode for normal tab-order cycling.
- MRU mode for most-recently-used cycling.
- Precise, Balanced, Fast, and Custom wheel presets.
- Sensitivity, cooldown, acceleration, horizontal wheel, wrap-around, pinned-tab, restricted-page skip, and overshoot guard settings.
- Scroll memory for restoring recent root scroll position and normalized page position when returning to the same URL.
- Editable-field setting for wheel-cycling inside text boxes, search fields, and editors/docs.
- Popup Refresh action that reconnects TabWheel on the current page without reloading it.
- Reliability guards for mouse gestures: middle-click recent-tab switching runs on the completed click, search panels close when leaving the tab, and close-to-recent does not close the current tab unless a recent-tab target is available.

## Browser Support

- Chrome and Chromium-based browsers use the Manifest V3 build.
- Firefox and Zen Browser use the Manifest V2 build.

Browser UI pages, extension pages, browser stores, devtools, PDF viewers, and some restricted pages may block content scripts. TabWheel skips those pages during wheel cycling by default. The popup fallback search field and tab buttons remain available where the toolbar popup can run.

## Privacy

TabWheel does not use telemetry, tracking, analytics, remote code, or developer-owned servers.

The extension stores settings, MRU tab order, recent scroll positions, page geometry, and URL checks in browser-local storage. Submitted TabWheel Search queries go to the browser's default search provider, with the fixed Google fallback used only if the browser search API is unavailable.

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

- `release/tabwheel-chrome-v1.0.2.zip`
- `release/tabwheel-firefox-v1.0.2.xpi`
- `release/tabwheel-source-v1.0.2.zip`

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
      toolbarPopup.css   # popup layout, responsive controls, and fallback actions
      toolbarPopup.ts    # popup state, fallback actions, mode switching, refresh
  lib/
    appInit/
      appInit.ts         # page-side listeners, search/click gestures, scroll memory, help overlay trigger
    adapters/runtime/
      runtimeClient.ts   # typed runtime messaging helpers and retry behavior
      tabWheelApi.ts     # content/popup API wrappers around runtime messages
    backgroundRuntime/
      domains/
        tabWheelDomain.ts        # tab cycling, MRU state, scroll memory, refresh/injection logic
      handlers/
        runtimeRouter.ts         # shared runtime message routing
        tabWheelMessageHandler.ts # TabWheel message handler
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
        searchLauncher/
          searchLauncher.ts  # in-page search launcher
          searchLauncher.css # search launcher styles
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
