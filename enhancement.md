Okay, here is the detailed project plan checklist in Markdown format, with checkboxes for every point, including sub-bullets.

# Project Plan: Tab Manager Enhancements

**Project Goal:** Enhance the Tab Manager Chrome Extension with configurable keyboard shortcuts for all actions and a descriptive extension icon.

**Key Principles for AI Agent:**

-   [x] Implement exactly as specified in each task.
-   [x] Assume standard Chrome Extension development environment and tooling.
-   [x] Refer to the provided codebase context for existing function names, file structures, and logic.
-   [x] Create new files or modify existing ones as indicated.
-   [x] Pay close attention to `manifest.json` requirements.
-   [x] Ensure robust error handling.
-   [x] Maintain consistency with the existing coding style.

---

## Phase 1: Keyboard Shortcut Implementation

### Story: Define and Register Keyboard Shortcuts for Actions

*   **Goal:** Enable users to trigger extension actions using keyboard shortcuts by defining default commands in the manifest and handling them in the background script.
*   **Acceptance Criteria:**
    -   [x] `manifest.json` includes definitions for keyboard commands for all primary actions.
    -   [x] The background script listens for and correctly executes the corresponding action when a command is invoked.
    -   [x] The "Preserve pinned tabs" setting is correctly read from storage and applied when relevant actions are triggered via shortcuts.
*   **Tasks:**
    -   [x] **Modify `manifest.json`: Add `commands` Key:**
        -   [x] Locate the main JSON object in `manifest.json`.
        -   [x] Add a top-level key named `commands` with an empty JSON object `{}` as its value.
    -   [x] **Define Command: `cleanTabsSequence`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_clean_tabs"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+C" }` (*Note: This is a suggestion; users can change it*).
            -   [x] `description`: `"Clean Tabs (Group All, Remove Duplicates, Sort)"` (*This text appears in `chrome://extensions/shortcuts`*).
    -   [x] **Define Command: `groupTabs`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_group_all_tabs"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+G" }`.
            -   [x] `description`: `"Group All Tabs into Current Window"`.
    -   [x] **Define Command: `removeDuplicates`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_remove_duplicates"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+D" }`.
            -   [x] `description`: `"Remove Duplicate Tabs in Current Window"`.
    -   [x] **Define Command: `sortTabs`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_sort_tabs"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+S" }`.
            -   [x] `description`: `"Sort Tabs in Current Window"` (*Note: Will respect the pinned setting*).
    -   [x] **Define Command: `groupByDomain`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_group_by_domain"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+B" }` (*B for By Domain*).
            -   [x] `description`: `"Group Tabs by Domain in Current Window"`.
    -   [x] **Define Command: `closeBlankTabs`:**
        -   [x] Inside the `commands` object in `manifest.json`, add a key like `"execute_close_blank_tabs"`.
        -   [x] Set its value to a JSON object containing:
            -   [x] `suggested_key`: `{ "default": "Alt+Shift+X" }`.
            -   [x] `description`: `"Close Blank/New Tabs in Current Window"`.
    -   [x] **Modify `background.js`: Add Command Listener:**
        -   [x] At the top level of `background.js` (outside any existing functions or listeners), add the following listener:
        ```javascript
        chrome.commands.onCommand.addListener(async (command) => {
          // handler logic here
        });
        ```
    -   [x] **Implement Command Listener Logic: Get Settings:**
        -   [x] Inside the `chrome.commands.onCommand.addListener` callback, *before* the main logic (like a `switch` statement), retrieve the `preservePinned` setting from storage.
        -   [x] Use `const settings = await chrome.storage.sync.get(['preservePinned']);`.
        -   [x] Define `const preservePinned = settings.preservePinned ?? false;`.
    -   [x] **Implement Command Listener Logic: `switch` Statement:**
        -   [x] Inside the command listener callback, after getting settings, add a `switch (command)` statement to handle the different command names defined in `manifest.json`.
    -   [x] **Implement Command Handler: `execute_clean_tabs`:**
        -   [x] Add a `case "execute_clean_tabs":` block to the `switch` statement.
        -   [x] Inside this case, add a `try...catch` block for error handling.
        -   [x] Inside the `try` block:
            -   [x] Get the current window: `const currentWindow = await chrome.windows.getCurrent();`.
            -   [x] Call the existing sequence logic (similar to the message handler):
                -   [x] `await groupAllTabs(currentWindow.id);`
                -   [x] `await sortTabs(preservePinned);` // Use the retrieved setting
                -   [x] `await removeDuplicateTabs();`
            -   [x] Log success to the background console: `console.log('Clean Tabs command executed successfully.');`
        -   [x] Inside the `catch (error)` block:
            -   [x] Log the error: `console.error('Error executing Clean Tabs command:', error);`
        -   [x] Add `break;` after the case.
    -   [x] **Implement Command Handler: `execute_group_all_tabs`:**
        -   [x] Add a `case "execute_group_all_tabs":` block.
        -   [x] Add a `try...catch` block.
        -   [x] Inside `try`:
            -   [x] `const currentWindow = await chrome.windows.getCurrent();`
            -   [x] `await groupAllTabs(currentWindow.id);`
            -   [x] `console.log('Group All Tabs command executed successfully.');`
        -   [x] Inside `catch`: `console.error('Error executing Group All Tabs command:', error);`
        -   [x] Add `break;`.
    -   [x] **Implement Command Handler: `execute_remove_duplicates`:**
        -   [x] Add a `case "execute_remove_duplicates":` block.
        -   [x] Add a `try...catch` block.
        -   [x] Inside `try`:
            -   [x] `await removeDuplicateTabs();`
            -   [x] `console.log('Remove Duplicates command executed successfully.');`
        -   [x] Inside `catch`: `console.error('Error executing Remove Duplicates command:', error);`
        -   [x] Add `break;`.
    -   [x] **Implement Command Handler: `execute_sort_tabs`:**
        -   [x] Add a `case "execute_sort_tabs":` block.
        -   [x] Add a `try...catch` block.
        -   [x] Inside `try`:
            -   [x] `await sortTabs(preservePinned);` // Use the retrieved setting
            -   [x] `console.log('Sort Tabs command executed successfully.');`
        -   [x] Inside `catch`: `console.error('Error executing Sort Tabs command:', error);`
        -   [x] Add `break;`.
    -   [x] **Implement Command Handler: `execute_group_by_domain`:**
        -   [x] Add a `case "execute_group_by_domain":` block.
        -   [x] Add a `try...catch` block.
        -   [x] Inside `try`:
            -   [x] `await groupTabsByDomain();`
            -   [x] `console.log('Group by Domain command executed successfully.');`
        -   [x] Inside `catch`: `console.error('Error executing Group by Domain command:', error);`
        -   [x] Add `break;`.
    -   [x] **Implement Command Handler: `execute_close_blank_tabs`:**
        -   [x] Add a `case "execute_close_blank_tabs":` block.
        -   [x] Add a `try...catch` block.
        -   [x] Inside `try`:
            -   [x] `await closeBlankTabs();`
            -   [x] `console.log('Close Blank Tabs command executed successfully.');`
        -   [x] Inside `catch`: `console.error('Error executing Close Blank Tabs command:', error);`
        -   [x] Add `break;`.
    -   [x] **Implement Command Listener Logic: Default Case:**
        -   [x] Add a `default:` block to the `switch` statement.
        -   [x] Log an error for unrecognized commands: `console.error('Unrecognized command:', command);`
        -   [x] Add `break;`.
    -   [x] **Handle Chrome's 4-Shortcut Limit:**
        -   [x] Reduce the number of keyboard shortcuts in `manifest.json` to the maximum allowed (4).
        -   [x] Keep the most important shortcuts: Clean Tabs, Group All Tabs, Sort Tabs, and Remove Duplicates.
        -   [x] Update the command handlers in `background.js` to provide helpful messages for the actions that no longer have default shortcuts.

### Story: Allow User Customization of Shortcuts

*   **Goal:** Enable users to change the default keyboard shortcuts via the standard Chrome Extensions shortcut page.
*   **Acceptance Criteria:**
    -   [x] The descriptions defined in `manifest.json` appear clearly on the `chrome://extensions/shortcuts` page for this extension.
    -   [x] Changing a shortcut on the `chrome://extensions/shortcuts` page correctly updates the trigger for the corresponding action.
*   **Tasks:**
    -   [x] **Verify Manifest Descriptions:** Double-check that the `description` field for *each* command defined in `manifest.json` is clear, concise, and accurately reflects the action performed. (*Covered by previous tasks, but verification step*).
    -   [x] **Test Shortcut Customization:** (*Manual Step/Assumption for AI*) After loading the extension, manually navigate to `chrome://extensions/shortcuts`, find the "Tab Manager" extension, and verify all defined commands and their descriptions are listed and editable. Test changing a shortcut and invoking the action. *AI cannot perform this, but the setup enables it.*
    -   [x] **Ensure No Custom UI Needed:** Confirm that no custom settings page or UI within the extension popup is required for *changing* the shortcuts, as the standard Chrome page (`chrome://extensions/shortcuts`) handles this.

---

## Phase 2: Extension Icon Implementation

### Story: Add Extension Icon

*   **Goal:** Provide visual identity for the extension in the Chrome toolbar and extension management pages using a custom icon.
*   **Acceptance Criteria:**
    -   [x] The extension displays a custom icon in the Chrome toolbar.
    -   [x] The extension displays appropriate icons on the `chrome://extensions` page.
    -   [x] Icon files are included in the extension package.
*   **Tasks:**
    -   [x] **Create Icon Files (Placeholders):**
        -   [x] *Assumption:* Actual icon design is out of scope for the AI. The AI will create simple, identifiable placeholder PNG files. If actual icons are provided, skip this task and use the provided filenames.
        -   [x] Create a placeholder file named `icon16.png` (16x16 pixels). *Suggestion: A simple blue square with a white "T".*
        -   [x] Create a placeholder file named `icon32.png` (32x32 pixels). *Suggestion: Similar design.*
        -   [x] Create a placeholder file named `icon48.png` (48x48 pixels). *Suggestion: Similar design.*
        -   [x] Create a placeholder file named `icon128.png` (128x128 pixels). *Suggestion: Similar design.*
        -   [x] Place these four `.png` files in the root directory of the extension (alongside `manifest.json`).
    -   [x] **Modify `manifest.json`: Add `icons` Key:**
        -   [x] Locate the main JSON object in `manifest.json`.
        -   [x] Add a top-level key named `icons` with a JSON object as its value.
        -   [x] Populate the `icons` object with mappings from size (string) to file path (string):
        ```json
        "icons": {
          "16": "icon16.png",
          "32": "icon32.png",
          "48": "icon48.png",
          "128": "icon128.png"
        }
        ```
    -   [x] **Modify `manifest.json`: Update `action` Icon:**
        -   [x] Locate the `action` key in `manifest.json`.
        -   [x] Add a `default_icon` key *within* the `action` object.
        -   [x] Set its value to a JSON object specifying paths for different sizes (Chrome will choose the best fit):
        ```json
         "action": {
           "default_popup": "popup.html",
           "default_icon": {
             "16": "icon16.png",
             "32": "icon32.png"
           }
         }
        ```
        -   [x] *Note:* The existing `action.default_popup` should remain unchanged.
    -   [x] **Verify Icon Paths:** Double-check that the file paths specified in the `icons` and `action.default_icon` sections of `manifest.json` exactly match the names and locations of the created/provided icon files (e.g., they are in the root directory).

---

## Phase 3: Testing and Finalization

### Story: Test All New Functionality

*   **Goal:** Ensure the keyboard shortcuts and icon are implemented correctly and do not introduce regressions.
*   **Acceptance Criteria:**
    -   [ ] All defined keyboard shortcuts trigger the correct actions.
    -   [ ] Actions triggered by shortcuts correctly respect the "Preserve pinned tabs" setting.
    -   [ ] The extension icon displays correctly in the toolbar and extensions page.
    -   [ ] Existing popup functionality remains unaffected.
*   **Tasks:**
    -   [ ] **Test: Load Extension:** Load/reload the unpacked extension in Chrome.
    -   [ ] **Test: Icon Display:** Verify the custom icon appears in the Chrome toolbar next to the address bar. Navigate to `chrome://extensions` and verify the icon appears correctly there (check different sizes if possible).
    -   [ ] **Test: Default Shortcuts:**
        -   [ ] Open multiple windows with various tabs (including pinned, duplicates, blank).
        -   [ ] Press `Alt+Shift+C` (Clean Tabs). Verify tabs are grouped, duplicates removed, and sorted (respecting the current toggle state in the popup for `preservePinned`). Check the background console for success/error logs.
        -   [ ] Reset tab state. Press `Alt+Shift+G` (Group All). Verify tabs are grouped. Check logs.
        -   [ ] Reset tab state. Press `Alt+Shift+D` (Remove Duplicates). Verify duplicates removed. Check logs.
        -   [ ] Reset tab state. Press `Alt+Shift+S` (Sort Tabs). Verify sorted (respecting toggle). Check logs.
        -   [ ] Reset tab state (add tabs from same domain). Press `Alt+Shift+B` (Group by Domain). Verify groups created. Check logs.
        -   [ ] Reset tab state (add blank/new tabs). Press `Alt+Shift+X` (Close Blank). Verify blank tabs closed. Check logs.
    -   [ ] **Test: Shortcut Customization (Manual):** Navigate to `chrome://extensions/shortcuts`. Change one of the default shortcuts (e.g., change Sort Tabs to `Alt+Shift+1`). Verify the *new* shortcut triggers the Sort Tabs action and the *old* one (`Alt+Shift+S`) no longer does. Change it back.
    -   [ ] **Test: `preservePinned` Setting:**
        -   [ ] Open the popup, check the "Preserve pinned tabs order" checkbox.
        -   [ ] Use the `Alt+Shift+S` (Sort) shortcut. Verify pinned tabs are preserved.
        -   [ ] Open the popup, uncheck the checkbox.
        -   [ ] Use the `Alt+Shift+S` (Sort) shortcut again. Verify pinned tabs are sorted along with others.
        -   [ ] Repeat this test for `Alt+Shift+C` (Clean Tabs).
    -   [ ] **Test: Popup Functionality:** Click each button in the popup (`Clean Tabs`, `Group All Tabs`, etc.) and verify they still work as expected, including UI feedback (status messages, button disabling).
    -   [ ] **Test: Edge Cases:** Test shortcuts with no tabs open, only one tab open, only pinned tabs, etc. Check background console for errors.
    -   [ ] **Review Console Logs:** Check both the background script's console (Service Worker) and the popup's console (inspect popup) for any errors logged during testing.

---
