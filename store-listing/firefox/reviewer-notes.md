# Notes for Mozilla reviewers

Simple Tab Manager has no account, server, analytics, advertising, remote code,
or network requests. No credentials are needed for review.

## Build instructions

Requirements:

- Node.js 20 or newer for the extension build.
- npm, using the committed `package-lock.json`.

Commands:

```sh
npm ci
npm run build
npm run verify
```

The Firefox extension is produced in `dist/firefox`. The submitted source
archive includes the source files, manifests, build and verification scripts,
package files, and full IBM Plex Sans font license. The build downloads only
the exact npm packages recorded in `package-lock.json` and creates PNG toolbar
icons from `src/assets/icon.svg` with Sharp.

## Suggested review steps

1. Open two normal Firefox windows with several tabs.
2. Pin one tab and open an exact copy of its URL as an unpinned tab.
3. Open the extension popup in the window that should receive the tabs.
4. Select **Organize all tabs**.
5. Confirm that eligible tabs move into the current window, the pinned copy is
   kept, the unpinned duplicate is removed, and pinned and unpinned tabs are
   sorted separately by domain.
6. Repeat with the three individual actions if desired.
7. Use the theme button to check system, light, and dark themes.

Firefox container identities are included in duplicate keys, so identical URLs
in different containers are deliberately retained. Split-view tabs are left
untouched, and sorting is skipped when a split view is present.

The extension declares `data_collection_permissions.required: ["none"]`
because no data is sent outside the extension or local browser.
