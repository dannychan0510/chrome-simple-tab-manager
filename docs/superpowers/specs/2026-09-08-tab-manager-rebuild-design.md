# Simple Tab Manager Rebuild Design

## Purpose

Rebuild the extension as a small, reliable tab organizer for Chrome and Firefox. The old source may inform behavior, but it does not constrain the new architecture.

The extension has four user actions:

1. **Organize tabs** runs duplicate removal, consolidation, and sorting as one operation.
2. **Bring tabs together** moves tabs from other regular windows into the window where the action started.
3. **Sort by domain** sorts the current window while keeping pinned and unpinned tabs in separate sections.
4. **Remove duplicates** removes tabs with the same exact URL across the regular windows the extension can access.

## Supported Browsers

The project produces separate Manifest V3 packages for current desktop Chrome and Firefox releases. Both packages use the same application code.

- Chrome uses `background.service_worker`.
- Firefox uses `background.scripts` and the fixed Gecko extension ID `{a69d42cb-0283-4e28-9a86-47e4274dc993}` for local and store builds.
- Firefox declares `browser_specific_settings.gecko.data_collection_permissions.required` as `["none"]` because the extension does not collect or transmit data.
- Application code selects `globalThis.browser` when available and otherwise uses `globalThis.chrome`.
- The extension contains no remotely hosted code, styles, fonts, or icons.

Separate manifests avoid unsupported background fields in either browser package. This follows the Chrome service-worker guidance and Mozilla's cross-browser background documentation:

- <https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers>
- <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background>
- <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings>

## Tab Behavior

### Scope

The window where the user starts an action is the target window. The popup resolves this window ID and passes it with the request; the background process never guesses the current window. Operations include regular browser windows with the same private-browsing state as that target. Private and regular windows are never mixed. Popup, developer-tools, and other special window types are excluded with `windowTypes: ["normal"]` because the Tabs API only moves tabs between normal windows.

At the start, the extension captures the target window ID, its active tab ID, and the IDs of the tabs and normal windows in scope. Tabs and windows opened later are left alone. Before every removal or move, the extension re-reads each captured tab and skips IDs that closed, were replaced, or moved out of scope. If the target window closes, the operation stops rather than silently choosing another target.

Tabs in a split view are skipped by consolidation and duplicate removal in the first release. Moving one split-view tab can move its partner or dissolve the split differently across browsers. If the target window contains a split view, the entire sort phase is skipped so moving another tab cannot be inserted between the pair. The result reports the skipped tabs and whether sorting was skipped.

### Exact duplicate rule

Two tabs are duplicates only when their complete URL strings are equal. Query parameters and fragments remain significant. The extension does not rewrite, normalize, or broaden URLs.

A tab with `status: "loading"`, `pendingUrl`, an empty URL, or no URL is not removed as a duplicate. Its navigation may not have reached its final address. It remains eligible for consolidation and sorting, where `pendingUrl || url` is a safe, non-destructive comparison value.

When `cookieStoreId` is present, it is part of the duplicate key. This prevents Firefox tabs in different containers from being treated as duplicates even when their URLs match.

For every duplicate set, the survivor is selected in this order:

1. A pinned tab always beats an unpinned tab.
2. If pinned state is equal, a tab in the target window wins.
3. If more than one candidate remains, the earliest tab by captured browser window order and tab index wins.

The pinned rule still wins when the unpinned copy is active, audible, muted, discarded, frozen, or carrying different in-memory page state. Exact URL equality cannot reveal unsaved form data or application state. A page may show its normal close-confirmation prompt; the extension never bypasses it. After removal, the extension checks which requested tabs remain and reports any copy that the browser or user kept open.

If the target window's active tab is removed, its survivor becomes active. Otherwise, the original target active tab is restored after all phases. Active tabs from source windows never determine the final selection. The extension does not refocus the target window if the user changes focus while work is running. Multiple highlighted-tab selections are not preserved.

The standalone duplicate-removal action protects the target window from disappearing. If every target tab would lose to a pinned survivor elsewhere, the first winning survivor is moved into the target before any target tab is removed. Other windows may close normally when removal leaves them empty.

### Bring tabs together

The extension queries all accessible normal windows in the captured scope. Before moving, it explicitly ungroups captured tabs in ordinary browser tab groups so movement behaves consistently across browsers. It then moves pinned tabs into the target window's pinned section and moves unpinned tabs to the end. Each tab keeps its pinned state, along with browser-managed states such as muted, discarded, and frozen. Relative order is preserved within each source window when this action runs by itself.

Pinned and unpinned tabs are moved in separate batches of at most 50 tabs. A single-tab move may return one tab object while a batch returns an array, so the adapter normalizes both forms before checking the result against the requested tab IDs. A pinned-boundary violation may return an empty result instead of throwing. A temporary `Tabs cannot be edited right now` error caused by user dragging is retried up to five times with a 50-millisecond delay. Permanent errors are reported without retrying.

The browser normally closes a source window after its last tab moves away. The extension does not make a separate window-removal call. A source window remains open when it contains a newly opened tab, a skipped split-view tab, or another tab outside the captured scope.

### Sort by domain

Sorting operates on the target window. Pinned tabs are sorted only among pinned tabs, and unpinned tabs are sorted only among unpinned tabs.

Before sorting, any captured tabs that remain in ordinary browser tab groups are explicitly ungrouped. Sorting cannot both preserve arbitrary group boundaries and produce one strict domain order. The result reports how many grouped tabs were ungrouped.

The comparison keys are:

1. Lowercase hostname labels in reverse order.
2. Lowercase complete hostname.
3. Complete effective URL, using `pendingUrl || url`.
4. Tab title.
5. Original tab index as a stable final tie-breaker.

Reversing hostname labels turns `docs.google.com` into `com.google.docs`, `mail.google.com` into `com.google.mail`, and `docs.microsoft.com` into `com.microsoft.docs`. This keeps related domains together while retaining meaningful subdomain order, without adding a public-suffix database. `example.com` and `www.example.com` therefore remain adjacent rather than becoming equal. A final hostname dot is ignored for sorting only. IPv4 and IPv6 addresses remain whole instead of having their segments reversed.

For browser pages and other URLs without a hostname, the lowercase protocol and complete effective URL form the domain key. Malformed or missing URLs sort after parseable URLs. Moves respect the browser rule that pinned tabs must remain before unpinned tabs, and every move result is verified.

### Organize tabs

The main action performs the work in this order:

1. Capture the target, active tab, windows, and tabs in scope.
2. Re-read captured tabs and ungroup ordinary tab groups.
3. Move captured, non-split tabs into the target window.
4. Re-read captured tabs and remove confirmed duplicate copies.
5. Re-read the remaining captured tabs and sort the pinned and unpinned sections by domain.
6. Restore the intended active tab without stealing window focus.
7. Re-read the final state and return actual moved, removed, ungrouped, skipped, changed, and failed counts.

Consolidation happens before duplicate removal so removing the only tab in the target window cannot close that window. Fresh reads between phases protect against navigation, pinning, closing, prerender replacement, and manual movement during the operation.

## Architecture

The implementation separates decisions from browser effects.

- `src/core/tab-rules.js` contains pure functions for domain keys, duplicate selection, and sort order.
- `src/core/tab-planner.js` converts a tab snapshot into an ordered operation plan.
- `src/background.js` runs plans through the WebExtensions Tabs and Windows APIs and receives popup messages.
- `src/popup/popup.html`, `popup.css`, and `popup.js` render the controls, theme state, progress, and results.
- `manifests/chrome.json` and `manifests/firefox.json` contain browser-specific configuration.
- `scripts/build.mjs` creates `dist/chrome/` and `dist/firefox/` from shared source and assets.

The popup disables actions while a request is running. The background process allows the operation to continue when the popup closes. A cross-browser message adapter uses `sendResponse` and keeps the message channel open, avoiding differences in promise-returning message listeners.

Only one operation runs at a time for each private-browsing state. A small operation lease is stored in `storage.session` under separate regular and private keys, with the action name, target window ID, start time, last-update time, and counts. It never stores URLs or titles. Each batch refreshes the lease. An in-memory operation always owns its lease, even when a close prompt takes longer than 10 minutes. After a background restart, a lease older than 10 minutes with no in-memory owner is marked interrupted and may be replaced. A newly opened popup reads the matching state so it can show work in progress or the last result without exposing private-window activity in a regular popup.

Browser tab changes are not transactional. Work is divided into batches of at most 50 tab IDs so large sessions continue making extension API calls and no single request carries the full workload. If an API call fails after earlier calls succeeded, the extension reports the exact failure and the completed counts. It does not attempt a risky automatic rollback.

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

The toolbar icon is a simpler filled tab-stack mark designed separately for clarity at 16, 32, 48, and 128 pixels. It uses a transparent background and a high-contrast outline that remains legible on light and dark browser toolbars. Raster sizes are generated from one vector source and checked at their real display sizes.

### Theme and interaction states

A compact theme control cycles through **System**, **Light**, and **Dark**. The choice is stored locally. System mode follows `prefers-color-scheme` immediately, including changes made while the popup is open. Operation state uses session storage and never shares browsing details with the theme setting.

Buttons have visible hover, pressed, disabled, and keyboard-focus states. Motion is limited to action feedback and is removed when `prefers-reduced-motion` requests it. Forced-colors mode keeps native focus and control outlines, and inline SVG icons use `currentColor`. The layout remains usable without horizontal scrolling at 200% browser text scaling and falls back to the system sans-serif stack if the bundled font cannot load.

A polite live status region reports concrete results such as `Moved 12 tabs · Removed 4 duplicates`. It also reports skipped split-view tabs, tabs changed during the operation, groups dissolved for predictable movement and sorting, close prompts that retained tabs, and any partial failure. Reopening the popup restores the current or most recent matching session result.

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

Edge-case tests also cover:

- A target window containing only an unpinned copy of a pinned tab in another window.
- Pending, empty, malformed, browser-internal, file, extension, discarded, and frozen tabs.
- Firefox containers with identical URLs.
- User navigation, closing, opening, pinning, dragging, and prerender tab replacement during each phase.
- Empty move results at pinned boundaries and bounded retry of transient drag failures.
- Close-confirmation prompts that retain a duplicate.
- Ordinary tab groups and skipped split-view tabs.
- Domain ordering across base domains, subdomains, `www` hosts, and non-host URLs.
- Target-window closure, source windows that remain non-empty, and active-tab restoration.
- More than 50 tabs, batch boundaries, interrupted leases, and reopening the popup mid-operation.
- Theme changes, reduced motion, forced colors, keyboard-only use, and missing font assets.

Build verification parses both manifests, rejects remote asset references, checks that every listed file exists, confirms Firefox's `data_collection_permissions.required: ["none"]`, and creates both distribution folders. Final manual checks load the unpacked builds in Chrome and Firefox, exercise all four actions, inspect light and dark themes, test tab groups and split views, and view each toolbar icon at its real size.

## Out of Scope

- Tab groups or saved tab sessions.
- URL normalization or tracking-parameter removal.
- Rules, exclusions, allowlists, or automatic background cleanup.
- Cloud sync, analytics, or accounts.
- Combining regular and private-browsing windows.
- Preserving browser-native tab groups or split-view layouts while reorganizing tabs.
- Preserving multiple highlighted-tab selections.
