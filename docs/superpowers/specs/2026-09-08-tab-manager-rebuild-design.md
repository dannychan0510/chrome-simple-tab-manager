# Simple Tab Manager Rebuild Design

## Purpose

Rebuild the extension as a small, reliable tab organizer for Chrome and Firefox. The old source may inform behavior, but it does not constrain the new architecture.

The extension has four user actions:

1. **Organize tabs** runs duplicate removal, consolidation, and sorting as one operation.
2. **Bring tabs together** moves tabs from other regular windows into the window where the action started.
3. **Sort by domain** sorts the current window while keeping pinned and unpinned tabs in separate sections.
4. **Remove duplicates** removes tabs with the same exact URL across the regular windows the extension can access.

## Supported Browsers

The project produces separate Manifest V3 packages for current Chrome and Firefox releases. Both packages use the same application code.

- Chrome uses `background.service_worker`.
- Firefox uses `background.scripts` and the fixed Gecko extension ID `{a69d42cb-0283-4e28-9a86-47e4274dc993}` for local and store builds.
- Application code selects `globalThis.browser` when available and otherwise uses `globalThis.chrome`.
- The extension contains no remotely hosted code, styles, fonts, or icons.

Separate manifests avoid unsupported background fields in either browser package. This follows the Chrome service-worker guidance and Mozilla's cross-browser background documentation:

- <https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers>
- <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background>

## Tab Behavior

### Scope

The window where the user starts an action is the target window. Operations include regular browser windows with the same private-browsing state as that target. Private and regular windows are never mixed. Popup, developer-tools, and other special window types are ignored because the Tabs API only moves tabs between normal windows.

### Exact duplicate rule

Two tabs are duplicates only when their complete URL strings are equal. Query parameters and fragments remain significant. The extension does not rewrite, normalize, or broaden URLs.

For every duplicate set, the survivor is selected in this order:

1. A pinned tab always beats an unpinned tab.
2. If pinned state is equal, a tab in the target window wins.
3. If more than one candidate remains, the earliest tab by browser window order and tab index wins.

If the active tab is removed, the survivor becomes active after it reaches the target window. Tabs without a usable URL are retained.

### Bring tabs together

The extension queries all accessible normal windows. It moves pinned tabs into the target window's pinned section and moves unpinned tabs to the end. Each tab keeps its pinned state. Relative order is preserved within each source window when this action runs by itself.

The browser normally closes a source window after its last tab moves away. The extension does not make a separate window-removal call.

### Sort by domain

Sorting operates on the target window. Pinned tabs are sorted only among pinned tabs, and unpinned tabs are sorted only among unpinned tabs.

The comparison keys are:

1. Lowercase hostname, including meaningful subdomains.
2. Complete URL.
3. Tab title.
4. Original tab index as a stable final tie-breaker.

For browser pages and other URLs without a hostname, the lowercase protocol and complete URL form the domain key. Moves respect the browser rule that pinned tabs must remain before unpinned tabs.

### Organize tabs

The main action performs the work in this order:

1. Build one fresh snapshot of accessible tabs.
2. Select duplicate survivors and remove the other copies.
3. Move the survivors into the target window.
4. Sort the pinned and unpinned sections by domain.
5. Restore the intended active tab when necessary.

Removing duplicates before moving avoids moving tabs that will immediately be deleted.

## Architecture

The implementation separates decisions from browser effects.

- `src/core/tab-rules.js` contains pure functions for domain keys, duplicate selection, and sort order.
- `src/core/tab-planner.js` converts a tab snapshot into an ordered operation plan.
- `src/background.js` runs plans through the WebExtensions Tabs and Windows APIs and receives popup messages.
- `src/popup/popup.html`, `popup.css`, and `popup.js` render the controls, theme state, progress, and results.
- `manifests/chrome.json` and `manifests/firefox.json` contain browser-specific configuration.
- `scripts/build.mjs` creates `dist/chrome/` and `dist/firefox/` from shared source and assets.

The popup disables actions while a request is running. The background process allows the operation to continue when the popup closes. Only one operation runs at a time in one background context.

Browser tab changes are not transactional. If an API call fails after earlier calls succeeded, the extension reports the exact failure and the completed counts. It does not attempt a risky automatic rollback.

## Popup Design

The popup is a compact tool tray about 360 pixels wide. Its primary job is to make the full cleanup action obvious while keeping the three individual tools close at hand.

```text
+----------------------------------+
| Simple Tab Manager          theme|
| Bring order to this window       |
|                                  |
| +------------------------------+ |
| |      Organize all tabs       | |
| +------------------------------+ |
|                                  |
|  Bring tabs together             |
|  Sort by domain                  |
|  Remove duplicate URLs           |
|                                  |
|  Ready                           |
+----------------------------------+
```

The layout uses one surface with clear spacing and dividers. It avoids a grid of repeated cards. A stacked-tab detail appears near the main action and in the toolbar mark; the rest of the interface stays quiet.

### Color tokens

Light theme:

- `canvas`: `#F4F7FB`
- `surface`: `#FFFFFF`
- `ink`: `#17202A`
- `muted`: `#667282`
- `accent`: `#2563EB`
- `success`: `#087F5B`

Dark theme:

- `canvas`: `#151A21`
- `surface`: `#1E2530`
- `ink`: `#F2F5F9`
- `muted`: `#9BA8B8`
- `accent`: `#78A9FF`
- `success`: `#53D6AD`

Errors use `#C92A2A` in the light theme and `#FF8787` in the dark theme. Their contrast is checked against each theme surface during implementation.

### Type and iconography

IBM Plex Sans is bundled locally in regular and semibold weights under the SIL Open Font License 1.1. Its compact shapes suit a browser utility while remaining clear at popup sizes. The copy uses sentence case and direct action names.

Popup icons use a consistent 24-pixel SVG grid, a 1.75-pixel rounded stroke, and simple open shapes. The set covers organize, consolidate, domain sort, duplicate removal, theme, success, and error states. Icons include visible text labels and never carry meaning alone.

The toolbar icon is a simpler filled tab-stack mark designed separately for clarity at 16, 32, 48, and 128 pixels. Raster sizes are generated from one vector source and checked at their real display sizes.

### Theme and interaction states

A compact theme control cycles through **System**, **Light**, and **Dark**. The choice is stored locally. System mode follows `prefers-color-scheme` immediately.

Buttons have visible hover, pressed, disabled, and keyboard-focus states. Motion is limited to action feedback and is removed when `prefers-reduced-motion` requests it. A polite live status region reports concrete results such as `Moved 12 tabs · Removed 4 duplicates` and gives a useful error when an operation cannot finish.

## Permissions and Privacy

The extension requests only:

- `tabs`, to read complete URLs and move, update, and remove tabs.
- `storage`, to remember the theme choice.

No browsing data leaves the browser. There are no analytics, network requests, accounts, content scripts, or host permissions.

## Testing and Verification

Tests use the built-in test runner in Node.js 20 or newer and require no test framework. Work follows test-driven development.

Pure unit tests cover:

- Exact URL duplicate matching.
- Pinned copies winning over unpinned copies.
- Target-window and stable-order tie-breakers.
- Domain extraction for HTTP, extension, browser, and malformed URLs.
- Independent ordering of pinned and unpinned tabs.
- Complete organize-operation plans.

Integration tests use a small in-memory browser API fake. They verify call order, requested tab positions, result counts, active-tab handoff, partial failures, and the single-operation guard.

Build verification parses both manifests, rejects remote asset references, checks that every listed file exists, and creates both distribution folders. Final manual checks load the unpacked builds in Chrome and Firefox, exercise all four actions, inspect light and dark themes, and view each toolbar icon at its real size.

## Out of Scope

- Tab groups or saved tab sessions.
- URL normalization or tracking-parameter removal.
- Rules, exclusions, allowlists, or automatic background cleanup.
- Cloud sync, analytics, or accounts.
- Combining regular and private-browsing windows.
- Preserving browser-native tab groups when moving tabs between windows.
