# Chrome Web Store listing

## Name

Simple Tab Manager

## Manifest summary

Bring tabs together, remove duplicate URLs, and sort them by domain.

## Category

Productivity

## Detailed description

Simple Tab Manager brings order to your open tabs from one small toolbar
popup.

- Organize all tabs combines every tool in one action.
- Bring tabs together moves tabs from other matching browser windows into the
  current window.
- Sort by domain keeps related sites together while sorting pinned and
  unpinned tabs separately.
- Remove duplicate URLs closes exact URL copies. Query strings and page
  fragments remain significant.

Pinned tabs stay pinned. When a pinned and unpinned tab have the same URL, the
pinned copy is kept. In Firefox, tabs in different containers remain separate.

Loading tabs and tabs without a usable URL are protected from duplicate
removal. Split-view tabs are left untouched. Ordinary tab groups may be
dissolved before tabs are moved or sorted.

Open-tab URLs are processed only inside your browser when you choose an action.
The extension has no analytics, accounts, advertising, remote code, or network
requests. It never sends or stores tab URLs or titles.

## Single purpose

Organize a user's open tabs through user-triggered actions that bring matching
windows together, remove exact URL duplicates, and sort tabs by domain.

## Permission justification: tabs

Simple Tab Manager reads open-tab URLs and tab state only when the user chooses
an action. It uses this information to move tabs between matching windows,
sort tabs by domain, dissolve ordinary tab groups when needed, and identify and
close exact duplicate URLs. URLs, titles, and page content are never
transmitted or stored.

## Permission justification: storage

Storage keeps the user's local theme preference and short regular-window
operation state such as the selected action, timestamps, target window
identifier, and result counts. Private-window operation state stays in memory
and is not written to storage. Storage never contains URLs, page titles, or
page content.

## Permission justification: tabGroups

Simple Tab Manager reads a tab group's title and color, and creates or
extends a matching group, only when the user's chosen action moves grouped
tabs into a different window and the "Keep tab groups together" setting is
on. It never reads, modifies, or removes a tab group the user did not just
ask the extension to touch.

## Privacy practices answers

- Remote code: No, this extension does not use remote code.
- Data handled: Web browsing activity. The extension reads open-tab URLs and
  domains locally to perform a user-requested action.
- User activity: For regular windows, the extension locally stores the selected
  action and result counts so the popup can show progress and the final result.
- Personally identifiable information: Not collected.
- Authentication information: Not collected.
- Financial information: Not collected.
- Health information: Not collected.
- Personal communications: Not collected.
- Location: Not collected.
- Website content: Not collected.
- Data sale, transfer, advertising, creditworthiness, or lending: None.
- Limited Use certifications: Confirm each statement, because all handled data
  is used only for the disclosed tab-organizing purpose.
- Privacy policy URL:
  https://github.com/dannychan0510/chrome-simple-tab-manager/blob/main/PRIVACY.md

The live dashboard labels may change. Match these answers to the closest
current dashboard categories and do not claim that the extension handles no
user data. Chrome treats locally processed open-tab URLs as browsing activity.

## Assets

- Store icon: `store-assets/store-icon-128.png`
- Screenshots: upload `store-assets/screenshots/01-...` through `05-...` in
  filename order.
- Small promotional tile:
  `store-assets/promotional/small-promo-440x280.png`
- Optional marquee tile:
  `store-assets/promotional/marquee-1400x560.png`

All screenshots were generated from the real popup markup with fixed example
domains. They contain no browser profile, account, login, history, bookmark,
or personal data.
