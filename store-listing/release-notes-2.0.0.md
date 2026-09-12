# Simple Tab Manager 2.0.0

Version 2.0.0 is a complete rebuild for current Chrome and Firefox.

- Added one-click organization that brings tabs together, removes exact URL
  duplicates, and sorts by domain.
- Added separate actions for moving, sorting, and duplicate removal.
- Kept pinned and unpinned tabs in separate sections.
- Made pinned URL copies win over unpinned copies.
- Kept Firefox containers separate during duplicate detection.
- Added protection for loading, changing, grouped, split-view, and newly opened
  tabs.
- Added light, dark, and system themes.
- Added local progress and result reporting without storing URLs or titles.
- Updated the extension to Manifest V3 with separate Chrome and Firefox builds.
- Added a settings panel with "Keep pinned tabs pinned" and "Keep tab groups
  together" preferences, both on by default.
- Kept a tab group's tabs together as one unit when moving, organizing, or
  sorting, instead of dissolving the group.
- Sorted the tabs inside a kept-together group by domain too, not just the
  groups relative to each other.
- Fixed several edge cases in group and pin handling: a group staying intact
  when Sort by domain repositions it, a group's batch move landing at the
  right position, group membership being reasserted after every move so the
  browser can't silently fold a tab into the wrong group, an empty tab group
  title no longer matching by accident, and a pinned tab recovering its
  pinned state (and correct position) if the browser drops it mid-move.
