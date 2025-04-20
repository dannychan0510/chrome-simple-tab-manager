# Test Plan for Multi-Window Scope Bug Fix

## Epic 3: Testing and Verification

### Story: Test Functionality in Single Window Scenario

#### Test Setup
1. Open Chrome with only one window
2. Add the following tabs:
   - Multiple tabs with the same URL (for duplicate testing)
   - Mix of pinned and unpinned tabs (for sorting testing)
   - Tabs from different domains (for grouping testing)
   - Blank tabs (`about:blank`, `chrome://newtab/`) (for blank tab testing)

#### Test Cases

##### 1. Remove Duplicates
- [x] Test via popup
- [x] Test via keyboard shortcut (Alt+Shift+D)
- Expected: Only duplicates in the current window are removed

##### 2. Sort Tabs
- [x] Test via popup with "Preserve pinned" checked
- [x] Test via popup with "Preserve pinned" unchecked
- [x] Test via keyboard shortcut (Alt+Shift+S)
- Expected: Tabs are sorted correctly within the window

##### 3. Group by Domain
- [x] Test via popup
- Expected: Tabs are grouped by domain within the window

##### 4. Close Blank Tabs
- [x] Test via popup
- Expected: Blank tabs are closed within the window

##### 5. Clean Tabs
- [x] Test via popup
- [x] Test via keyboard shortcut (Alt+Shift+C)
- Expected: All operations (grouping, sorting, duplicate removal) work correctly

### Story: Test Functionality in Multi-Window Scenario

#### Test Setup
1. Open Chrome with two windows (Window A and Window B)
2. In Window A:
   - Add multiple tabs with duplicates
   - Add mix of pinned/unpinned tabs
   - Add tabs from different domains
   - Add blank tabs
3. In Window B:
   - Add different set of tabs with similar characteristics
   - Ensure no overlap with Window A's tabs

#### Test Cases

##### 1. Remove Duplicates (Window A)
- [x] Test via popup from Window A
- [x] Test via keyboard shortcut from Window A
- Expected: Only duplicates in Window A are removed, Window B unchanged

##### 2. Sort Tabs (Window A)
- [ ] Test via popup from Window A (with/without "Preserve pinned")
- [ ] Test via keyboard shortcut from Window A
- Expected: Only Window A's tabs are sorted, Window B unchanged

##### 3. Group by Domain (Window A)
- [ ] Test via popup from Window A
- Expected: Only Window A's tabs are grouped, Window B unchanged

##### 4. Close Blank Tabs (Window A)
- [ ] Test via popup from Window A
- Expected: Only Window A's blank tabs are closed, Window B unchanged

##### 5. Clean Tabs (Window A)
- [ ] Test via popup from Window A
- [ ] Test via keyboard shortcut from Window A
- Expected: All operations work on Window A only

##### 6. Repeat Tests for Window B
- [ ] Perform all above tests from Window B
- Expected: Operations affect Window B only, Window A unchanged

##### 7. Group All Tabs
- [ ] Test via popup from Window A
- [ ] Test via keyboard shortcut (Alt+Shift+G)
- Expected: All tabs from Window B move to Window A, Window B closes

### Story: Test Edge Cases

#### Test Cases

##### 1. Incognito Window
- [ ] Test with regular and incognito windows open
- Expected: Actions from regular window only affect regular window

##### 2. Empty/Single Tab Window
- [ ] Test with window containing no tabs
- [ ] Test with window containing one tab
- Expected: Functions handle gracefully

##### 3. Pinned Tabs Only
- [ ] Test with window containing only pinned tabs
- Expected: Sort works correctly with "Preserve pinned" option

##### 4. Special Chrome Pages
- [ ] Test with `chrome://extensions`, `chrome://settings` tabs
- Expected: Special pages handled appropriately

## Test Results Tracking

### Single Window Tests
- [ ] Remove Duplicates: 
- [ ] Sort Tabs: 
- [ ] Group by Domain: 
- [ ] Close Blank Tabs: 
- [ ] Clean Tabs: 

### Multi-Window Tests
- [ ] Remove Duplicates (Window A): 
- [ ] Sort Tabs (Window A): 
- [ ] Group by Domain (Window A): 
- [ ] Close Blank Tabs (Window A): 
- [ ] Clean Tabs (Window A): 
- [ ] Remove Duplicates (Window B): 
- [ ] Sort Tabs (Window B): 
- [ ] Group by Domain (Window B): 
- [ ] Close Blank Tabs (Window B): 
- [ ] Clean Tabs (Window B): 
- [ ] Group All Tabs: 

### Edge Cases
- [ ] Incognito Window: 
- [ ] Empty/Single Tab Window: 
- [ ] Pinned Tabs Only: 
- [ ] Special Chrome Pages: 