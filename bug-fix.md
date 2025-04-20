# Project Plan: Fix Multi-Window Scope Bugs for Tab Management Functions

**Goal:** Ensure `Remove Duplicates`, `Sort Tabs`, `Group by Domain`, and `Close Blank Tabs` functions consistently operate on the *current* browser window, even when multiple windows are open.

**Context:** The user reported that these functions only seem to work correctly when only one window is open or after `Group All Tabs` has been executed. This suggests they are either failing to target the correct window or encountering errors when multiple windows exist. The fix involves making the target window explicit for these functions.

---

## Epic 1: Refactor Core Tab Management Functions for Explicit Window Scope

**User Story:** As a developer, I want to refactor the core tab management functions (`sortTabs`, `removeDuplicateTabs`, `groupTabsByDomain`, `closeBlankTabs`) so they explicitly operate on a specified window ID, improving clarity and reliability in multi-window environments.

### Story: Modify `sortTabs` to accept and use `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Modify the `sortTabs` function signature to accept `windowId` as the first argument: `async function sortTabs(windowId, preservePinned = false)`.
*   [x] **Task:** Replace the line `const window = await chrome.windows.getCurrent({ populate: true });` with `const window = await chrome.windows.get(windowId, { populate: true });` to fetch tabs from the specified window.
*   [x] **Task:** Add error handling immediately after fetching the window to check if the window was found (e.g., `if (!window) { throw new Error(`Window with ID ${windowId} not found.`); }`).
*   [x] **Task:** Review the rest of the `sortTabs` function to ensure all tab operations (like `chrome.tabs.move` and `chrome.tabs.update`) correctly reference tabs belonging to the fetched `window` object. (Note: `tab.id` is unique globally, so `chrome.tabs.move` should still work correctly, but ensure logic relies on the `tabs` array fetched from the specific `windowId`).
*   [x] **Task:** Update the JSDoc comment for `sortTabs` to reflect the new `windowId` parameter and clarify its scope. Change `@param {boolean} preservePinned...` to `@param {number} windowId - The ID of the window to sort tabs in.` and add the `preservePinned` param back.

### Story: Modify `removeDuplicateTabs` to accept and use `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Modify the `removeDuplicateTabs` function signature to accept `windowId` as the first argument: `async function removeDuplicateTabs(windowId)`.
*   [x] **Task:** Replace the line `const window = await chrome.windows.getCurrent({ populate: true });` with `const window = await chrome.windows.get(windowId, { populate: true });`.
*   [x] **Task:** Add error handling immediately after fetching the window to check if the window was found (e.g., `if (!window) { throw new Error(`Window with ID ${windowId} not found.`); }`).
*   [x] **Task:** Review the rest of the `removeDuplicateTabs` function to ensure it correctly processes the `tabs` array from the specified `window`. (The logic using `seenUrls` and `tabsToRemove` based on the fetched `tabs` should be correct).
*   [x] **Task:** Ensure the `chrome.tabs.remove(tabsToRemove)` call functions correctly as tab IDs are unique.
*   [x] **Task:** Update the JSDoc comment for `removeDuplicateTabs` to reflect the new `windowId` parameter and clarify its scope. Add `@param {number} windowId - The ID of the window to remove duplicate tabs from.`.

### Story: Modify `groupTabsByDomain` to accept and use `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Modify the `groupTabsByDomain` function signature to accept `windowId` as the first argument: `async function groupTabsByDomain(windowId)`.
*   [x] **Task:** Replace the line `const window = await chrome.windows.getCurrent({ populate: true });` with `const window = await chrome.windows.get(windowId, { populate: true });`.
*   [x] **Task:** Add error handling immediately after fetching the window to check if the window was found (e.g., `if (!window) { throw new Error(`Window with ID ${windowId} not found.`); }`).
*   [x] **Task:** Review the rest of the `groupTabsByDomain` function logic (`domainMap`, iterating through `tabs`, `chrome.tabs.group`, `chrome.tabGroups.update`) to ensure it operates correctly on the tabs from the specified `windowId`.
*   [x] **Task:** Specifically verify that `chrome.tabs.group({ tabIds })` correctly uses the `tabIds` collected from the target window.
*   [x] **Task:** Update the JSDoc comment for `groupTabsByDomain` to reflect the new `windowId` parameter and clarify its scope. Add `@param {number} windowId - The ID of the window to group tabs by domain in.`.

### Story: Modify `closeBlankTabs` to accept and use `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Modify the `closeBlankTabs` function signature to accept `windowId` as the first argument: `async function closeBlankTabs(windowId)`.
*   [x] **Task:** Replace the line `const window = await chrome.windows.getCurrent({ populate: true });` with `const window = await chrome.windows.get(windowId, { populate: true });`.
*   [x] **Task:** Add error handling immediately after fetching the window to check if the window was found (e.g., `if (!window) { throw new Error(`Window with ID ${windowId} not found.`); }`).
*   [x] **Task:** Review the rest of the `closeBlankTabs` function logic (filtering `blankTabs`, collecting `tabIds`, `chrome.tabs.remove`) to ensure it operates correctly on the tabs from the specified `windowId`.
*   [x] **Task:** Update the JSDoc comment for `closeBlankTabs` to reflect the new `windowId` parameter and clarify its scope. Add `@param {number} windowId - The ID of the window to close blank tabs in.`.

---

## Epic 2: Update Callers to Provide Correct Window Scope

**User Story:** As a developer, I want to update the background script's command listeners and message handlers to correctly determine the active window ID and pass it to the refactored core functions, ensuring actions apply to the intended window.

### Story: Update `background.js` Command Listeners to Pass `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Locate the `chrome.commands.onCommand.addListener` callback function.
*   [x] **Task:** Ensure the listener's callback function is `async`.
*   [x] **Task:** Inside the `case "execute_remove_duplicates":` block:
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` before calling the function.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window."); }`.
    *   [x] **Task:** Modify the function call to `await removeDuplicateTabs(currentWindow.id);`.
    *   [x] **Task:** Ensure the surrounding `try...catch` block properly handles potential errors from `getCurrent` or the function call.
*   [x] **Task:** Inside the `case "execute_sort_tabs":` block:
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` before calling the function.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window."); }`.
    *   [x] **Task:** Modify the function call to `await sortTabs(currentWindow.id, preservePinned);`.
    *   [x] **Task:** Ensure the surrounding `try...catch` block is robust.
*   [x] **Task:** Inside the `case "execute_group_by_domain":` block:
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` before calling the function.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window."); }`.
    *   [x] **Task:** Modify the function call to `await groupTabsByDomain(currentWindow.id);`.
    *   [x] **Task:** Ensure the surrounding `try...catch` block is robust.
*   [x] **Task:** Inside the `case "execute_close_blank_tabs":` block:
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` before calling the function.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window."); }`.
    *   [x] **Task:** Modify the function call to `await closeBlankTabs(currentWindow.id);`.
    *   [x] **Task:** Ensure the surrounding `try...catch` block is robust.
*   [x] **Task:** Review the `execute_clean_tabs` command handler:
    *   [x] **Task:** Confirm it already gets `currentWindow.id`.
    *   [x] **Task:** Ensure the calls `await sortTabs(preservePinned);` and `await removeDuplicateTabs();` are updated to `await sortTabs(currentWindow.id, preservePinned);` and `await removeDuplicateTabs(currentWindow.id);` respectively. (Note: `groupAllTabs` already consolidates tabs into `currentWindow.id`, so subsequent operations *should* target the correct window implicitly *after* grouping, but passing the ID explicitly is safer).

### Story: Update `background.js` Message Handlers to Pass `windowId`

*   [x] **Task:** Open `background.js`.
*   [x] **Task:** Locate the `chrome.runtime.onMessage.addListener` callback function.
*   [x] **Task:** Inside the handler for `request.action === 'removeDuplicates'`:
    *   [x] **Task:** Ensure the inner `async` function is defined.
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` at the beginning of the `try` block.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window for popup action."); }`.
    *   [x] **Task:** Modify the function call to `await removeDuplicateTabs(currentWindow.id);`.
    *   [x] **Task:** Verify the `catch` block correctly reports errors.
*   [x] **Task:** Inside the handler for `request.action === 'sortTabs'`:
    *   [x] **Task:** Ensure the inner `async` function is defined.
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` at the beginning of the `try` block.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window for popup action."); }`.
    *   [x] **Task:** Modify the function call to `await sortTabs(currentWindow.id, request.preservePinned);`.
    *   [x] **Task:** Verify the `catch` block correctly reports errors.
*   [x] **Task:** Inside the handler for `request.action === 'groupByDomain'`:
    *   [x] **Task:** Ensure the inner `async` function is defined.
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` at the beginning of the `try` block.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window for popup action."); }`.
    *   [x] **Task:** Modify the function call to `await groupTabsByDomain(currentWindow.id);`.
    *   [x] **Task:** Verify the `catch` block correctly reports errors.
*   [x] **Task:** Inside the handler for `request.action === 'closeBlankTabs'`:
    *   [x] **Task:** Ensure the inner `async` function is defined.
    *   [x] **Task:** Add `const currentWindow = await chrome.windows.getCurrent();` at the beginning of the `try` block.
    *   [x] **Task:** Add a check: `if (!currentWindow) { throw new Error("Could not get current window for popup action."); }`.
    *   [x] **Task:** Modify the function call to `await closeBlankTabs(currentWindow.id);`.
    *   [x] **Task:** Verify the `catch` block correctly reports errors.
*   [x] **Task:** Review the handler for `request.action === 'cleanTabsSequence'`:
    *   [x] **Task:** Confirm it correctly gets `currentWindow.id`.
    *   [x] **Task:** Ensure the calls `await sortTabs(request.preservePinned);` and `await removeDuplicateTabs();` are updated to `await sortTabs(currentWindow.id, request.preservePinned);` and `await removeDuplicateTabs(currentWindow.id);`. (Similar note as for the command listener applies).
*   [x] **Task:** Review the handler for `request.action === 'groupTabs'`:
    *   [x] **Task:** Confirm it correctly gets `currentWindow.id` and passes it to `groupAllTabs`. No changes needed here unless `groupAllTabs` signature changes (which is not planned).

---

## Epic 3: Testing and Verification

**User Story:** As a developer, I want to thoroughly test the refactored functions in single and multi-window scenarios to ensure they correctly and reliably operate only on the intended window.

### Story: Test Functionality in Single Window Scenario

*   [ ] **Task:** Open Chrome with only one window.
*   [ ] **Task:** Add multiple tabs, including duplicates, pinned tabs, and blank tabs (`about:blank`, `chrome://newtab/`).
*   [ ] **Task:** Test "Remove Duplicates" via popup: Verify only duplicates in this window are removed.
*   [ ] **Task:** Test "Sort Tabs" via popup (with and without "Preserve pinned" checked): Verify tabs in this window are sorted correctly.
*   [ ] **Task:** Test "Group by Domain" via popup: Verify tabs in this window are grouped by domain.
*   [ ] **Task:** Test "Close Blank Tabs" via popup: Verify blank tabs in this window are closed.
*   [ ] **Task:** Test "Clean Tabs" via popup: Verify grouping (if applicable, though only one window), sorting, and duplicate removal occur correctly in this window.
*   [ ] **Task:** Test all corresponding keyboard shortcuts (`Alt+Shift+D`, `Alt+Shift+S`, potentially `Alt+Shift+C` for the sequence): Verify they perform the correct action on the single window. (Note: `Group by Domain` and `Close Blank Tabs` might not have default shortcuts per `background.js` comments, test if assigned).

### Story: Test Functionality in Multi-Window Scenario

*   [ ] **Task:** Open Chrome with two or more windows (e.g., Window A and Window B).
*   [ ] **Task:** In Window A, create a set of tabs: duplicates, sortable items, domain-groupable items, blank tabs, pinned tabs.
*   [ ] **Task:** In Window B, create a *different* set of tabs with similar characteristics, ensuring no overlap that could cause confusion during testing.
*   [ ] **Task:** Make Window A the *active* window (last interacted with). Open the extension popup from Window A's toolbar.
*   [ ] **Task:** Test "Remove Duplicates" via popup: Verify duplicates are removed *only* in Window A. Window B should remain unchanged.
*   [ ] **Task:** Test "Sort Tabs" via popup (with/without "Preserve pinned"): Verify tabs are sorted *only* in Window A. Window B should remain unchanged.
*   [ ] **Task:** Test "Group by Domain" via popup: Verify tabs are grouped *only* in Window A. Window B should remain unchanged.
*   [ ] **Task:** Test "Close Blank Tabs" via popup: Verify blank tabs are closed *only* in Window A. Window B should remain unchanged.
*   [ ] **Task:** Repeat the popup tests, but this time activate Window B, open the popup from Window B's toolbar, and verify the actions affect *only* Window B, leaving Window A unchanged.
*   [ ] **Task:** Test keyboard shortcuts (`Alt+Shift+D`, `Alt+Shift+S`): Activate Window A, use the shortcut, verify it affects Window A only. Activate Window B, use the shortcut, verify it affects Window B only.
*   [ ] **Task:** Test "Clean Tabs" (popup and `Alt+Shift+C`): Activate Window A, execute Clean Tabs. Verify *all* tabs from Window B are moved to Window A, and *then* sorting and duplicate removal happen within the combined set in Window A. Window B should be closed.
*   [ ] **Task:** Test "Group All Tabs" (popup and `Alt+Shift+G`): Activate Window A, execute Group All Tabs. Verify all tabs from Window B move to Window A. Window B should be closed.

### Story: Test Edge Cases

*   [ ] **Task:** Test with an Incognito window open alongside a regular window. Verify actions initiated from the regular window's popup/shortcut only affect the regular window (unless it's "Group All" which might behave differently with Incognito - document observed behavior). *Note: Extensions might have limited access/visibility to Incognito tabs unless explicitly allowed by the user.*
*   [ ] **Task:** Test actions when the target window has only one tab or no tabs (e.g., Sort, Remove Duplicates should ideally do nothing gracefully).
*   [ ] **Task:** Test actions when the target window has only pinned tabs. Verify "Sort Tabs" with "Preserve pinned" checked leaves them untouched, and unchecked sorts them.
*   [ ] **Task:** Test actions with special Chrome pages (e.g., `chrome://extensions`, `chrome://settings`). Verify they are handled reasonably (e.g., sorted, ignored by duplicate removal if URL is unique, not closed by "Close Blank Tabs").

---

## Epic 4: Documentation and Cleanup (Optional but Recommended)

**User Story:** As a developer, I want to update documentation and comments to reflect the changes and ensure the codebase is clean.

### Story: Update Documentation and Comments

*   [ ] **Task:** Review all JSDoc comments in `background.js` for the modified functions and ensure they are accurate.
*   [ ] **Task:** Add comments in `background.js` where `chrome.windows.getCurrent()` is used in the listeners/handlers, explaining *why* it's being used (to target the window of interaction).
*   [ ] **Task:** Review `README.md`: Ensure feature descriptions accurately reflect that most actions apply to the *current window* by default, while "Clean Tabs" and "Group All Tabs" consolidate windows. Clarify the scope of each action.
*   [ ] **Task:** Review `popup.html` and `popup.js`: Ensure UI elements or status messages don't imply actions affect all windows unless intended (like "Group All Tabs"). Consider adding a tooltip or small text clarifying scope if confusion persists.

---
