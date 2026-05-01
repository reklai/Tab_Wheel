# Privacy Policy - TabWheel

TabWheel does not collect, transmit, or share any user data. Everything stays in your browser.

## Data Stored Locally

- **Settings** (`tabWheelSettings`) - modifier, optional Shift requirement, direction, cycle scope, pinned-tab handling, wrap behavior, wheel preset, sensitivity, cooldown, horizontal wheel support, overshoot guard, acceleration, and the editable-field preference: Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs.
- **Wheel List** (`tabWheelWheelList`) - tab IDs, window IDs, URLs, titles, pinned state, and timestamps for tabs the user marked for Wheel List cycling. This is local tab metadata only.
- **Scroll memory** (`tabWheelScrollMemory`) - recent tab IDs, window IDs, page URLs used only to validate scroll restore, scroll X/Y positions, and update timestamps, bounded to 300 entries.
- **Schema version** (`storageSchemaVersion`) - local migration marker.

Legacy storage keys from earlier builds may remain in a browser profile until migration runs, but the TabWheel runtime does not use them.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read and activate browser tabs for cycling and Wheel List actions |
| `storage` | Save settings, Wheel List entries, scroll positions, and schema version locally |
| `scripting` | Chrome-only: activate the content script on already-open normal web tabs after install or update |
| `<all_urls>` | Run the content script where supported so modifier-wheel cycling and scroll memory work |

## Data Sharing

None. TabWheel does not sell, rent, transfer, or disclose your data to third parties.
