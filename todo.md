# Project Plan: Tab Manager Chrome Extension Enhancements

## Phase 1: Core Bug Fixes & Refinements

### Story: Improve Tab Sorting Logic

*   **Goal:** Ensure tabs are sorted primarily by their full URL, not just hostname, and secondarily by title, while respecting the "Preserve pinned tabs" option. Handle potential URL parsing errors gracefully.
*   **Tasks:**
    *   `[x]` **Modify `sortTabs` function (`background.js`):** Locate the sorting logic within the `sort` method callback.
    *   `[x]` **Update Primary Sort Key:** Change the primary comparison logic from `new URL(a.url).hostname` to compare the full `a.url` and `b.url` strings using `localeCompare`.
        *   *Detail:* The comparison should look like `a.url.localeCompare(b.url)`.
    *   `[x]` **Update Secondary Sort Key:** Ensure the secondary comparison logic remains `a.title.localeCompare(b.title)` for tabs with identical URLs (though this is less likely than identical hostnames).
    *   `[x]` **Handle Sorting Edge Cases:** Verify the sorting logic works correctly for different URL schemes (e.g., `http:`, `https:`, `file:`, `chrome://`). String comparison should handle this naturally. Remove reliance on `new URL()` for the primary sort comparison to avoid potential errors with non-standard URLs.
    *   `[x]` **Verify Pinned Tab Logic (`preservePinned: true`):** Confirm that when `preservePinned` is true, only unpinned tabs are collected and sorted by URL/title, and then moved *after* all existing pinned tabs, preserving the original order *of the pinned tabs*.
    *   `[x]` **Verify Pinned Tab Logic (`preservePinned: false`):** Confirm that when `preservePinned` is false, *all* tabs are sorted together by URL/title, and their original pinned status is reapplied after moving. Double-check if reapplying pinned status via `chrome.tabs.update` is strictly necessary or if `chrome.tabs.move` preserves it (verify Chrome API documentation or test). *Correction:* `chrome.tabs.move` does *not* preserve the pinned state when moving between windows, but *does* within the same window. The existing logic to re-pin might be needed if extending sorting across windows, but for the current same-window sort, it might be redundant if `preservePinned` is false. Simplify if possible. Let's assume for now the current logic is safer: keep the `update` call for `!preservePinned`.

### Story: Refactor `groupAllTabs` for Clarity and Efficiency

*   **Goal:** Improve the logic for grouping tabs, especially handling pinned tabs, and make it more efficient by moving tabs in batches.
*   **Tasks:**
    *   `[x]` **Refactor Pinned Tab Handling:** Review the logic for collecting and moving pinned tabs from *other* windows to the target window in `groupAllTabs` (`background.js`). The current approach of finding the target index based on a pre-compiled list (`allPinnedTabs`) seems complex and potentially fragile.
        *   *Alternative:* Consider moving all pinned tabs from other windows to the *start* of the target window first, then moving all unpinned tabs from other windows to the *end* of the target window. This simplifies index management.
    *   `[x]` **Optimize Tab Movement:** Modify `groupAllTabs` to use a single `chrome.tabs.move` call per window where possible, instead of moving tabs one by one.
        *   *Detail:* Collect all tab IDs (pinned separately from unpinned if necessary for ordering) from a source window.
        *   *Detail:* Use `chrome.tabs.move(tabIdsArray, { windowId: targetWindowId, index: desiredPosition })`. Consult Chrome API docs for exact batch moving syntax and behavior regarding `index`. If batch moving requires a single index (e.g., moves all to that position sequentially), the one-by-one approach might still be necessary for precise ordering, *especially* for preserving pinned order. *Correction:* The API moves the tabs *as a block* to the specified index. So, moving pinned tabs first as a block, then unpinned tabs as a block should work.
    *   `[x]` **Implement Batch Move (Pinned Tabs):** In `groupAllTabs`, for each `window` in `windowsToProcess`, collect IDs of `pinnedTabs`. If any exist, move them as a batch to the `targetWindowId` at `index: 0` (or after existing pinned tabs in the target window).
    *   `[x]` **Implement Batch Move (Unpinned Tabs):** In `groupAllTabs`, for each `window` in `windowsToProcess`, collect IDs of `unpinnedTabs`. If any exist, move them as a batch to the `targetWindowId` at `index: -1` (append to the end).
    *   `[x]` **Ensure Window Closure:** Confirm that source windows are still closed correctly *after* all their tabs have been successfully moved. Add checks to ensure windows are actually empty before removal, or rely on the fact that Chrome might close them automatically if the last tab is moved (verify behavior).

## Phase 2: Robustness and User Experience

### Story: Improve "Clean Tabs" Workflow Orchestration

*   **Goal:** Make the multi-step "Clean Tabs" process more robust by removing arbitrary delays and handling the sequence reliably in the background script.
*   **Tasks:**
    *   `[x]` **Remove `setTimeout` Calls:** Delete the `await new Promise(resolve => setTimeout(resolve, 500));` lines from the `cleanTabs` event listener in `popup.js`.
    *   `[x]` **Create Combined Background Action:** Define a new message action name, e.g., `cleanTabsSequence`.
    *   `[x]` **Modify `popup.js`:** Update the `cleanTabs` event listener in `popup.js`.
        *   *Detail:* It should now send a *single* message to the background script with `action: 'cleanTabsSequence'`, `targetWindowId`, and `preservePinned`.
    *   `[x]` **Implement Background Handler:** Add a new `else if (request.action === 'cleanTabsSequence')` block in the `chrome.runtime.onMessage.addListener` in `background.js`.
    *   `[x]` **Implement Sequential Logic in Background:** Inside the new handler, perform the operations sequentially using `await`:
        1.  `await groupAllTabs(request.targetWindowId);` (or a refactored version)
        2.  `await removeDuplicateTabs();` (Ensure this operates on the now-grouped window)
        3.  `await sortTabs(request.preservePinned);`
    *   `[x]` **Add Error Handling to Sequence:** Wrap the sequence in `try...catch` within the background handler. If any step fails, catch the error and send a response `{ success: false, error: error.message }`.
    *   `[x]` **Send Final Response:** If all steps succeed, send `{ success: true }`. Ensure `sendResponse` is called correctly in all paths (success and error). Remember to `return true;` from the `onMessage` listener for this new action to indicate asynchronous response.
    *   `[x]` **Update `removeDuplicateTabs` Context:** Ensure `removeDuplicateTabs` correctly identifies the target window after grouping. Since it uses `chrome.windows.getCurrent()`, this *should* work correctly if the popup was triggered from the target window, but relying on the `targetWindowId` passed into the sequence might be more robust.
        *   *Refinement:* Modify `removeDuplicateTabs` to optionally accept a `windowId`. Update the `cleanTabsSequence` handler to pass the `targetWindowId` to `removeDuplicateTabs`. The standalone 'Remove Duplicates' button can continue using `getCurrent()`.

### Story: Provide User Feedback in Popup

*   **Goal:** Inform the user about the status (in progress, success, failure) of operations directly in the popup UI.
*   **Tasks:**
    *   `[x]` **Add Status Display Area:** Add a `div` element (e.g., `<div id="statusMessage" class="status"></div>`) to `popup.html` to display messages.
    *   `[x]` **Add Basic CSS for Status:** Add styling for the `#statusMessage` div in `styles.css` (e.g., padding, margins, different colors for success/error).
    *   `[x]` **Implement Feedback Function:** Create a helper function in `popup.js`, e.g., `displayStatus(message, isError = false)`, that updates the text content and CSS class of the status div.
    *   `[x]` **Show "In Progress" Message:** When a button (like "Clean Tabs" or "Sort Tabs") is clicked in `popup.js`, immediately call `displayStatus("Processing...")`.
    *   `[x]` **Disable Buttons During Operation:** Add logic to disable all action buttons when an operation starts and re-enable them when it finishes (successfully or with an error). Store button elements in variables for easy access.
    *   `[x]` **Show Success/Error Message:** In the `chrome.runtime.sendMessage` response callbacks in `popup.js`, use the response status (`response.success`) and potential error message (`response.error`) to call `displayStatus`.
        *   *Example (Success):* `displayStatus("Operation completed successfully!");`
        *   *Example (Error):* `displayStatus(\`Error: ${response.error || 'Unknown error'}\`, true);`
    *   `[x]` **Clear Status:** Consider clearing the status message after a few seconds or when another action is initiated.

### Story: Enhance Error Handling

*   **Goal:** Catch potential errors in background functions more effectively and provide meaningful error information.
*   **Tasks:**
    *   `[x]` **Wrap Core Logic in `try...catch`:** Ensure the main logic within `groupAllTabs`, `sortTabs`, and `removeDuplicateTabs` in `background.js` is wrapped in `try...catch` blocks if not already implicitly handled by the async structure feeding into the `onMessage` handler's catch block.
    *   `[x]` **Handle Specific API Errors:** Check for potential errors from specific Chrome API calls (e.g., `chrome.tabs.move` failing if a tab ID is invalid or the tab was closed). Log these specific errors.
    *   `[x]` **Improve Error Messages:** Make error messages sent back to the popup more descriptive (e.g., "Error sorting tabs: Invalid URL encountered" instead of just "Error in sortTabs").

## Phase 3: Code Quality & Documentation

### Story: Improve Code Documentation and Readability

*   **Goal:** Add JSDoc comments and potentially refactor for better understanding and maintenance.
*   **Tasks:**
    *   `[x]` **Add JSDoc to Background Functions:** Add JSDoc comments to `groupAllTabs`, `sortTabs`, and `removeDuplicateTabs` in `background.js`, explaining what they do, their parameters (`@param`), and what they return (`@returns`).
    *   `[x]` **Add JSDoc to Popup Functions:** Add comments to the event listeners and any helper functions (like `displayStatus`) in `popup.js`.
    *   `[x]` **Review Variable Names:** Ensure variable names are clear and descriptive.
    *   `[x]` **Minor Refactoring (Optional):** Look for opportunities to extract small, reusable pieces of logic into helper functions within `background.js` if it improves clarity (e.g., the URL/title comparison logic).

## Phase 4: Potential New Features (Optional)

### Story: Add Tab Grouping by Domain

*   **Goal:** Allow users to automatically group tabs within the current window based on their domain using Chrome's Tab Groups API.
*   **Tasks:**
    *   `[x]` **Add UI Element:** Add a new button "Group Tabs by Domain" to `popup.html`.
    *   `[x]` **Request `tabGroups` Permission:** Ensure the `tabGroups` permission is listed in `manifest.json` (it already is).
    *   `[x]` **Add Popup Listener:** Add an event listener for the new button in `popup.js` that sends a message like `{ action: 'groupTabsByDomain' }` to the background script.
    *   `[x]` **Implement Background Logic:**
        *   `[x]` Create a new function `groupTabsByDomain` in `background.js`.
        *   `[x]` Get the current window's tabs using `chrome.tabs.query({ currentWindow: true })`.
        *   `[x]` Create a map or object to store tabs keyed by their hostname (`new URL(tab.url).hostname`). Handle potential errors parsing URLs.
        *   `[x]` Iterate through the map of domains. For each domain with multiple tabs:
            *   `[x]` Create a new tab group using `chrome.tabs.group({ tabIds: tabIdsForDomain })`.
            *   `[x]` Optionally, name the group based on the domain using `chrome.tabGroups.update(groupId, { title: domain })`.
    *   `[x]` **Add Message Handler:** Add a handler for `groupTabsByDomain` in the `onMessage` listener in `background.js` that calls the new function and sends a response.
    *   `[x]` **Add User Feedback:** Update `popup.js` to show status messages for this new action.

### Story: Add Option to Close Blank/New Tabs

*   **Goal:** Provide a quick way to close all tabs that are `about:blank` or default "New Tab" pages.
*   **Tasks:**
    *   `[x]` **Add UI Element:** Add a new button "Close Blank Tabs" to `popup.html`.
    *   `[x]` **Add Popup Listener:** Add an event listener in `popup.js` sending `{ action: 'closeBlankTabs' }`.
    *   `[x]` **Implement Background Logic:**
        *   `[x]` Create a function `closeBlankTabs` in `background.js`.
        *   `[x]` Get tabs in the current window: `chrome.tabs.query({ currentWindow: true })`.
        *   `[x]` Filter tabs where `tab.url` is exactly `about:blank` or matches the Chrome New Tab page URL (`chrome://newtab/`).
        *   `[x]` Collect the IDs of these tabs.
        *   `[x]` If any IDs are found, close them using `chrome.tabs.remove(tabIdsArray)`.
    *   `[x]` **Add Message Handler:** Add handler in `onMessage` listener.
    *   `[x]` **Add User Feedback:** Update `popup.js`.

## Final Review

*   `[x]` **Test All Features:** Manually test all button actions (Clean, Group All, Remove Duplicates, Sort, Group by Domain, Close Blank) in various scenarios (different numbers of windows/tabs, pinned tabs, different URLs, edge cases).
*   `[x]` **Review Console Logs:** Check the browser console and the extension's background service worker console for any errors during testing.
*   `[x]` **Code Review:** Read through the final code for clarity, efficiency, and adherence to the plan.
