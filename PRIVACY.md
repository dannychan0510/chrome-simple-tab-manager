# Privacy policy for Simple Tab Manager

Effective date: September 8, 2026

Simple Tab Manager organizes tabs inside your browser. It does not send data
to the developer or any third party.

## Data the extension accesses

When you choose a tab action, the extension reads the open tabs in normal
browser windows that match the current window's regular or private browsing
state. It may read:

- tab URLs, domains, and titles;
- pinned, active, loading, group, and split-view state;
- browser window and tab identifiers; and
- Firefox container identifiers.

This information is used only to perform the action you requested: moving
tabs, sorting them by domain, dissolving ordinary tab groups when needed, or
removing exact URL duplicates. It is processed locally inside the browser.

## Data stored locally

The extension stores your light, dark, or system theme preference, and your
"keep pinned tabs pinned" and "keep tab groups together" preferences, in
local extension storage. For regular windows, it also stores short-lived
operation information in browser session storage, including the selected
action, its status, timestamps, window identifier, and result counts.
Private-window operation status remains only in background-process memory and
is never written to browser storage.

The extension does not store tab URLs, page titles, page content, or browsing
history. Regular-window session operation information is removed when the
browser session ends. Private-window operation information disappears when the
background process stops. The theme preference and the two tab-handling
preferences remain until you clear extension storage or remove the extension.
None of them are personally identifiable and none are ever transmitted.

## Data transmission and sharing

The extension has no analytics, advertising, accounts, remote services, or
external network requests. It does not transmit, sell, rent, disclose, or
share user data. No person can review your open tabs through this extension.

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements.

## Your choices

Tab actions run only after you select one in the extension popup. You can stop
using the extension at any time by disabling or removing it. Removing it also
removes its locally stored theme and tab-handling preferences.

## Changes

If this policy changes, the effective date above will be updated. Any change
to the extension's data practices will also be disclosed through the browser
store and, when required, inside the extension before the changed practice
starts.

## Contact

Questions and privacy requests can be filed through the project's public issue
tracker:

https://github.com/dannychan0510/chrome-simple-tab-manager/issues
