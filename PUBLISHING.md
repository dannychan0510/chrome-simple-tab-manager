# Publishing Simple Tab Manager

This guide was checked against official Chrome and Mozilla documentation on
September 8, 2026. Store dashboards and policies can change, so verify the
linked pages again before each submission.

## Current readiness

The extension code, manifests, images, listing copy, privacy policy, release
notes, reviewer notes, and repeatable archive builder are prepared in this
repository. Store accounts, identity checks, agreements, final live-browser
tests, uploads, and review submission still require the account owner.

The project currently uses `all-rights-reserved` for the AMO version license,
which matches the repository's lack of a public software license. The owner can
replace this with MIT, MPL-2.0, or another license before submission.

## Build and package

Use Node.js 22 or newer for the full release workflow.

```sh
npm ci
npm run verify
npx -y web-ext@10.6.0 lint --source-dir dist/firefox --warnings-as-errors
npm run release:package
```

The last command creates:

- `artifacts/simple-tab-manager-chrome-v2.0.0.zip`
- `artifacts/simple-tab-manager-firefox-v2.0.0.zip`
- `artifacts/simple-tab-manager-source-v2.0.0.zip`
- `artifacts/SHA256SUMS.txt`

The Chrome and Firefox archives have `manifest.json` at their root. The source
archive is supplied to Mozilla because the build copies npm font files and
generates PNG icons.

The official Mozilla `web-ext@10.6.0` command is pinned in the command and CI
workflow but is not added to `package-lock.json`. Its current transitive
`image-size` dependency has a high-severity denial-of-service advisory. Keeping
it out of the project dependency tree preserves a clean `npm audit`; run it only
against this repository's trusted, locally generated images until Mozilla ships
a fixed dependency.

## Chrome Web Store

The account owner must:

1. Register as a Chrome Web Store developer and pay the one-time USD 5 fee.
2. Verify the contact email and enable Google Account 2-Step Verification.
3. Accept the current developer agreement.
4. Declare trader or non-trader status. Chrome may require traders to verify a
   legal name, address, and SMS-capable phone number and may display that data
   publicly. Do not enter these details anywhere except Google's own form.
5. Create the first store item manually and upload the Chrome ZIP.
6. Copy the fields from `store-listing/chrome/listing.md` into Store listing and
   Privacy practices.
7. Upload the 128×128 icon, five 1280×800 screenshots, and required 440×280
   small promotional tile from `store-assets`.
8. Choose distribution regions and visibility.
9. Test the draft package, then submit it for review.

Official references:

- [Register a developer account](https://developer.chrome.com/docs/webstore/register)
- [Prepare an extension](https://developer.chrome.com/docs/webstore/prepare)
- [Complete the listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [July 2026 privacy-policy update](https://developer.chrome.com/blog/cws-policy-updates-2026)

Chrome requires at least one 1280×800 or 640×400 screenshot and a 440×280 PNG
or JPEG small tile. Up to five screenshots are allowed. The 1400×560 marquee
tile is optional. The official listing and image pages disagree about whether
a YouTube video URL is mandatory; follow the live dashboard if it blocks the
submission.

Chrome treats locally processed open-tab URLs as browsing activity. The
listing, popup, and `PRIVACY.md` disclose this. Select the matching browsing
activity and user activity categories in the current Privacy practices form.
Do not select “no user data” merely because nothing leaves the device.

## Mozilla Add-ons

The account owner must:

1. Sign in to AMO with a confirmed Mozilla Account and enable two-factor
   authentication.
2. Accept the Firefox Add-on Distribution Agreement.
3. Submit the extension as a listed desktop Firefox add-on.
4. Upload the Firefox ZIP and the source ZIP.
5. Confirm that `{a69d42cb-0283-4e28-9a86-47e4274dc993}` is available. Only an
   AMO submission can prove that the ID is not reserved by an unlisted add-on.
6. Use the `tabs` category and the metadata in
   `store-listing/firefox/amo-metadata.json`.
7. Use a distinct slug. `simple-tab-manager-organize-tabs` returned no public
   AMO listing on September 8, 2026, but the live form is authoritative.
8. Paste `store-listing/firefox/reviewer-notes.md` into Notes for Reviewers.
9. Upload the store icon and screenshots from `store-assets`.
10. Submit the version for Mozilla signing and review.

Official references:

- [Developer accounts](https://extensionworkshop.com/documentation/publish/developer-accounts/)
- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
- [Packaging](https://extensionworkshop.com/documentation/publish/package-your-extension/)
- [Source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Current web-ext reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [Firefox data declarations](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

Firefox release and beta builds require Mozilla signing. The current
`data_collection_permissions.required: ["none"]` declaration is accurate
because Mozilla defines this field around data sent outside the add-on or local
browser. The privacy policy is still useful on the public listing.

## Manual test checklist

Run these checks with fresh temporary browser profiles. Do not use a personal
profile when recording screenshots or review evidence.

- Load `dist/chrome` unpacked in current desktop Chrome.
- Load `dist/firefox/manifest.json` as a temporary Firefox add-on.
- Verify all four actions in each browser.
- Verify pinned and unpinned exact duplicates keep the pinned copy.
- Verify query strings and fragments remain distinct.
- Verify regular and private windows do not mix.
- Verify Firefox container tabs with the same URL remain distinct.
- Verify ordinary tab groups are dissolved when required.
- Verify split-view tabs are not moved or removed and cause sorting to skip.
- Verify a page with a close confirmation can retain a duplicate without the
  extension reporting it as removed.
- Verify an operation reports a partial result if its target window closes.
- Verify operation status survives closing and reopening the popup.
- Verify system, light, and dark themes, keyboard focus, and 200% zoom.
- Recheck all screenshots against the final submitted UI.

## Safe automation path

`.github/workflows/release-artifacts.yml` builds and checks release archives.
It does not publish to either store and does not need store credentials.

For later Chrome automation, use Chrome Web Store API v2. The initial item and
its listing must be created manually. Prefer a dedicated service account with
GitHub OpenID Connect and Workload Identity Federation instead of a long-lived
JSON key. Keep the publisher ID and item ID as repository or environment
variables. Put any credential in a protected GitHub environment and require a
reviewer before release jobs can access it.

For later Firefox automation, use current `web-ext sign --channel=listed` with
`--amo-metadata` and `--upload-source-code`. Store `WEB_EXT_API_KEY` and
`WEB_EXT_API_SECRET` only in a protected GitHub environment. Never paste them
into issues, logs, prompts, screenshots, or committed config files.

Official automation references:

- [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api)
- [Chrome service accounts](https://developer.chrome.com/docs/webstore/service-accounts)
- [Mozilla web-ext signing](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
- [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)

## Community skills reviewed

The community skill
`brianlovin/agent-config@chrome-webstore-release-blueprint` is a useful Chrome
API v2 reference, but it should not be installed blindly. Its instructions ask
for secrets in conversation, which should be ignored. It does not cover the
full listing, Chrome's current local-data disclosure rule, or Firefox.

The community skill
`quangpl/browser-extension-skills@extension-publish` is outdated for this
project. It uses Chrome API v1.1, packages the wrong directory shape for this
repository, and treats the required Chrome small promotional tile as optional.

Use official Google and Mozilla documentation as the source of truth.
