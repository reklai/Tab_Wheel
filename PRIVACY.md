# Privacy Policy — TabWheel

TabWheel does not collect, transmit, or share any user data. Everything stays in your browser.

## Data Stored Locally

- **Tagged tabs** (`tabWheelTaggedTabs`) — live tagged tab metadata and scroll X/Y positions for the current browser window, up to 15 tabs.
- **Settings** (`tabWheelSettings`) — the invert-scroll preference, base modifiers, optional Shift requirements, panel shortcut, and help shortcut.
- **Schema version** (`storageSchemaVersion`) — local migration marker.

Legacy storage keys from earlier builds may remain in a browser profile, but the TabWheel runtime does not use them.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read, activate, tag, and restore browser tabs |
| `storage` | Save tagged tabs, scroll positions, settings, and schema version locally |
| `<all_urls>` | Run the content script where supported so page gestures and scroll memory work |

## Data Sharing

None. TabWheel does not sell, rent, transfer, or disclose your data to third parties.
