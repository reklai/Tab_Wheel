# Privacy Policy - TabWheel

TabWheel does not collect, transmit, or share user data with developer-owned services. Settings and extension state stay in your browser. Submitted TabWheel Search queries go to the browser's current default search provider, with the Google fallback used only if the browser search API is unavailable. The search launcher's as-you-type suggestions (your recent searches, open tabs, browser history, and bookmarks) are matched locally on your device and are never transmitted anywhere. Type `/tab`, `/hist`, or `/book` to narrow suggestions to one source.

## Data Stored Locally

- **Settings** (`tabWheelSettings`) - modifier, optional Shift requirement, direction, cycle scope, left/middle/right click action preferences, pinned-tab handling, hidden-tab handling, restricted-page skipping, wrap behavior, wheel preset, tab sensitivity, tab cooldown, page-scroll speed, viewport step cap, horizontal wheel support, overshoot guard, acceleration, and the editable-field preference: Allow wheel-cycling when cursor is inside text boxes, search fields, and editors/docs.
- **MRU state** (`tabWheelMruState`) - recent tab IDs grouped by window so MRU cycling and recent-tab gestures can work locally. This is cleared on browser startup.
- **Recent searches** (`tabWheelSearchHistory`) - your recent TabWheel Search queries, stored locally so the search launcher can autocomplete them. Deduplicated, most-recent-first, and bounded to 50 entries. These never leave your browser.
- **Scroll memory** (`tabWheelScrollMemory`) - recent tab IDs, window IDs, page URLs used only to validate scroll restore, root scroll X/Y positions, normalized page position, page and viewport dimensions, and update timestamps, bounded to 300 entries.
- **Schema version** (`storageSchemaVersion`) - local migration marker.

Legacy storage keys from earlier builds may remain in a browser profile until migration runs, but the TabWheel runtime does not use them.

## Permissions

| Permission | Purpose |
| --- | --- |
| `tabs` | Read, activate, create, and close browser tabs for cycling and click actions |
| `storage` | Save settings, MRU tab order, recent searches, scroll positions, page geometry, and schema version locally |
| `search` | Run searches with the browser's current default search provider, with Google fallback if the browser search API is unavailable |
| `history` | Match your browser history against search launcher queries, locally on your device; history is read on demand and never transmitted |
| `bookmarks` | Match your bookmarks against search launcher queries, locally on your device; bookmarks are read on demand and never transmitted |
| `scripting` | Chrome-only: activate or refresh the content script on normal web tabs after install, update, or popup Refresh |
| `tabGroups` | Chrome-only: detect collapsed tab groups so hidden-tab skipping can leave their tabs out of cycling |
| `<all_urls>` | Run the content script where supported so modifier-wheel cycling, page-scroll wheel tuning, and scroll memory work |

## Data Sharing

None by developer-owned services. TabWheel does not sell, rent, or disclose your data. Submitted search queries are handled by your browser's search provider, or by the Google fallback if the browser search API is unavailable.
