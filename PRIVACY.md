# Privacy Policy - TabWheel

TabWheel does not collect, transmit, or share any user data. Everything stays in your browser.

## Data Stored Locally

- **Settings** (`tabWheelSettings`) - modifier, optional Shift requirement, direction, cycling order, pinned-tab handling, wrap behavior, sensitivity, cooldown, acceleration, and editable-field preference.
- **Scroll memory** (`tabWheelScrollMemory`) - recent tab IDs, window IDs, scroll X/Y positions, and update timestamps, bounded to 300 entries.
- **Schema version** (`storageSchemaVersion`) - local migration marker.

Legacy storage keys from earlier builds may remain in a browser profile until migration runs, but the TabWheel runtime does not use them.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read and activate browser tabs for cycling |
| `storage` | Save settings, scroll positions, and schema version locally |
| `<all_urls>` | Run the content script where supported so modifier-wheel cycling and scroll memory work |

## Data Sharing

None. TabWheel does not sell, rent, transfer, or disclose your data to third parties.
