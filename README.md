# Simple Tab Manager

Simple Tab Manager is a small browser extension for bringing order to the
current browser window. It works with current desktop Chrome and Firefox.

It provides four actions:

- **Organize all tabs** brings tabs together, removes exact duplicate URLs, and
  sorts the result by domain.
- **Bring tabs together** moves tabs from other regular windows with the same
  private browsing state into the current window.
- **Sort by domain** orders pinned and unpinned tabs separately using their
  hostnames.
- **Remove duplicate URLs** removes exact URL copies. Query parameters,
  fragments, and Firefox container identities remain significant. A pinned
  copy wins over an unpinned copy.

Loading, pending, missing-URL, and split-view tabs are protected from duplicate
removal. A split view also makes the sort phase skip so its pair is not split.
By default, pinned tabs stay pinned and ordinary browser tab groups stay
together across movement and sorting; both preferences can be turned off in
the popup's settings panel, which restores today's fully-flattened behavior
of dissolving groups and mixing pinned tabs in with the rest. New tabs opened
after an action starts are left alone.

No browsing data leaves the browser. The extension has no accounts, analytics,
network requests, content scripts, or host permissions. It requests the
`tabs`, `tabGroups`, and `storage` permissions. Operation state stores action
and counts but never URLs or titles.

## Development

Use Node.js 22 or newer.

```sh
npm install
npm test
npm run build
npm run verify
```

`npm run build` creates separate packages in `dist/chrome` and
`dist/firefox`. The build bundles every script, style, font, and icon locally.

To try the Chrome package, open `chrome://extensions`, enable Developer mode,
choose **Load unpacked**, and select `dist/chrome`.

To try the Firefox package, open `about:debugging#/runtime/this-firefox`,
choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`.

## Release builds

Run `npm run verify` from a clean checkout before packaging either distribution.
It runs the Node test suite, rebuilds both browser folders, validates the
manifests and permissions, checks local asset references, verifies font and
license files, and checks all toolbar icon dimensions.

The extension uses the SIL Open Font License for the bundled IBM Plex Sans
font. The license text is included at `LICENSES/IBM-Plex-Sans.txt`.

## Store publishing

See `PUBLISHING.md` for the current Chrome Web Store and Mozilla Add-ons
submission checklist. Store copy is in `store-listing`, and privacy-safe listing
images are in `store-assets`.

Build the upload and Mozilla source archives with:

```sh
npm run release:package
```
