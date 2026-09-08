# Group and Pin Preservation Design

## Purpose

Today, **Organize all tabs**, **Bring tabs together**, and **Sort by domain**
always dissolve any ordinary browser tab group the user created, and always
keep pinned tabs in their own section. The group-dissolving is disclosed in
the store listing, but it surprised the developer when observed live, and
there is no way to opt out of it. This design adds two user-controlled
switches so the extension keeps a user's tab groups and pin arrangement
intact by default, while still allowing today's fully-flattened behavior as
an explicit choice.

This does not change **Remove duplicate URLs**. That action never
repositions tabs, and its rule that a pinned tab always survives over an
unpinned duplicate is a data-safety guarantee, not a placement preference; it
stays unconditional regardless of these switches.

## New settings

Two switches, both **on by default**, stored in local extension storage the
same way the theme preference is stored today (persists across popup opens,
never synced, never leaves the device):

- **Keep pinned tabs pinned** — when on, pinned tabs keep their own section
  ahead of unpinned tabs, as today. When off, pinned tabs are unpinned first
  (via the browser's tab-update API) and are then treated as ordinary tabs
  for all placement purposes, ordered alongside the rest instead of being
  pinned to the front. This is not just a reordering: unpinning is an
  irreversible state change the extension makes on the user's behalf, and it
  cannot be undone by the extension afterward — the user would need to
  re-pin the affected tabs manually.
- **Keep tab groups together** — when on, an ordinary browser tab group (not
  a split view, which is always left untouched as before) is treated as one
  block: its member tabs stay contiguous and move together. When off, groups
  are dissolved exactly as they are today.

Both switches apply only to **Organize all tabs**, **Bring tabs together**,
and **Sort by domain**.

### Where the switches live

A new settings icon button appears in the popup header, to the left of the
existing theme button, following the same icon-button pattern. Clicking it
opens a small panel with the two switches. The main action list is
unchanged; the switches do not add permanent rows to it.

## Sort by domain

Pinned tabs cannot belong to a tab group in Chrome or Firefox, so a group's
members are always drawn from the unpinned tabs. Sorting proceeds as today
for pinned tabs (kept as their own section when the pin switch is on, mixed
into the general order when it is off).

For unpinned tabs, when the group switch is on:

1. Each ordinary tab group present in the target window becomes one ordered
   block. The tabs inside a group are not reordered relative to each other
   by domain; they keep their existing relative order within the group.
2. Blocks are ordered by the group's title, compared case-insensitively. A
   group with no title sorts using an empty title (so untitled groups sort
   before any named group). If two groups compare equal (both untitled, or
   identical titles), the group whose leftmost tab has the lower original
   tab index comes first — the same stable-tiebreak approach the existing
   sort already uses for individual tabs.
3. All group blocks, in that order, are placed before all ungrouped tabs.
   Ungrouped tabs are sorted by domain exactly as today.

A group is never split or reordered based on the domains of the tabs inside
it — only its title decides where the block sits. When the group switch is
off, this section does not apply; grouped tabs are ungrouped and sorted by
domain individually, as today.

## Organize all tabs / Bring tabs together

These actions can move tabs into a different browser window. A tab group
cannot span two windows, so "keeping a group together" here means: after its
member tabs arrive in the target window, they are placed in a group there
that has the same title and color as the source group, not that the literal
browser-level group object moves.

Rules:

1. Before moving, the extension reads each source group's title and color.
2. If the target window already contains a group whose title matches the
   source group's title case-insensitively (the same comparison rule used
   for sort ordering below), the incoming tabs are added to that existing
   group. Otherwise, a new group is created in the target window with the
   same title and color as the source, and the incoming tabs are added to
   it.
3. Tabs keep their relative order within the group across the move.
4. If some members of a group are removed as duplicates before the group's
   remaining tabs are moved (this can happen during Organize, which also
   runs duplicate removal), the surviving members are still grouped
   together in the destination, even if only one tab survives. A group is
   never specially collapsed back into an ungrouped tab just because it has
   one member.
5. If every member of a group is already in the target window and does not
   need to move, the group is left untouched.
6. When the group switch is off, source groups are dissolved before moving,
   exactly as today.

This section does not define a group's position relative to other groups or
ungrouped tabs in the target window for Organize/Bring-tabs-together, beyond
"tabs keep their relative order" — because Organize finishes with a sort
phase, which is where the ordering rules above take over. Bring-tabs-together
alone does not sort. Instead, it moves tabs in phases: grouped tabs move
first, as whole units (one group at a time), then pinned tabs, then the
remaining unpinned tabs — matching `consolidatePhase`'s phase order in
`src/tab-manager.js`. This means relative order between a group and nearby
loose tabs is not preserved by Bring-tabs-together alone: a group always
lands ahead of the ordinary batch-moved tabs regardless of their original
relative order. Only Organize, whose final sort phase reorders everything
anyway, makes this invisible.

## Permission change

Recreating a group with the correct title and color in a different window
requires reading and writing tab-group metadata, which needs the
`tabGroups` permission back in the manifest (`manifests/chrome.json` and
`manifests/firefox.json`). Reading a tab's `groupId` and calling
`tabs.group()` / `tabs.ungroup()` do not require it — that was already
confirmed empirically before this feature existed, which is why the
permission could be dropped after the last rejection. This time the
permission is used by real code, so the store listing's permission
justification needs a genuine explanation rather than a removal. Draft text
for `store-listing/chrome/listing.md`:

> **Permission justification: tabGroups**
> Simple Tab Manager reads a tab group's title and color, and creates or
> extends a matching group, only when the user's chosen action moves grouped
> tabs into a different window and the "Keep tab groups together" setting is
> on. It never reads, modifies, or removes a tab group the user did not just
> ask the extension to touch.

Updating the actual listing file, the Chrome dashboard's Privacy tab
answers, and re-testing against the dashboard's review flow are
implementation/submission tasks, not part of this design.

## Firefox compatibility

The same source tree builds both browsers. Firefox has been adding native
tab-group support, but this design does not assume feature parity with
Chrome's `tabGroups` API — that must be checked directly against a current
Firefox build during implementation, not assumed from either browser's
documentation. The existing code already guards against a missing API
(`browser-adapter.js:72`, `if (... || !api.tabs.ungroup) continue;`); this
design extends the same pattern to the new group-creation and
group-metadata calls, so that on a Firefox version lacking full support, the
"Keep tab groups together" switch silently has no effect (tabs behave as if
the switch were off) rather than failing the operation. The switch itself
stays visible and does not need per-browser hiding.

## Testing and verification

- Unit tests (`test/`) extend the existing fake browser
  (`test/support/fake-browser.js`) to simulate `tabGroups.get`,
  `tabGroups.update`, and group-aware `tabs.group`, covering: sort with
  mixed grouped/ungrouped tabs, sort with two same-titled groups, sort with
  an untitled group, Organize moving a group into a window with no matching
  group, Organize moving a group into a window with an existing
  same-titled group, a group losing all-but-one member to duplicate
  removal during Organize, and both switches turned off reproducing
  today's exact behavior (regression coverage for the current 65 tests).
- Manual test: reproduce the original report (create a Chrome tab group,
  run "Organize all tabs" with both switches on, confirm the group survives
  with its members together in the target window) using the same
  `dist/chrome` load-unpacked flow used earlier in this project.
- Manual test: repeat the above in Firefox against `dist/firefox`, and
  record whatever the actual API support turns out to be.
- Store assets: screenshots and the detailed description are updated only
  after the feature is implemented and manually verified, not as part of
  this design.

## Out of scope

- Auto-creating new tab groups from domain matches. Only groups the user
  already made are preserved; the extension never invents groups.
- Making the pinned-copy-always-wins duplicate rule conditional on the pin
  switch. It stays unconditional.
- Per-window or per-action settings. Both switches are global preferences,
  same storage model as the theme preference.
- Syncing settings across devices or browsers.
- Changing split-view handling. Split-view tabs remain always skipped by
  every action, unaffected by either switch.
