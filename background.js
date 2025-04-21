// Add command listener for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    // Get settings from storage
    const settings = await chrome.storage.sync.get(['preservePinned']);
    const preservePinned = settings.preservePinned ?? false;
    
    // Handle different commands
    switch (command) {
      case "execute_clean_tabs":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await groupAllTabs(currentWindow.id);
          await sortTabs(currentWindow.id, preservePinned);
          await removeDuplicateTabs(currentWindow.id);
          console.log('Clean Tabs command executed successfully.');
        } catch (error) {
          console.error('Error executing Clean Tabs command:', error);
        }
        break;
        
      case "execute_group_all_tabs":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await groupAllTabs(currentWindow.id);
          console.log('Group All Tabs command executed successfully.');
        } catch (error) {
          console.error('Error executing Group All Tabs command:', error);
        }
        break;
        
      case "execute_remove_duplicates":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await removeDuplicateTabs(currentWindow.id);
          console.log('Remove Duplicates command executed successfully.');
        } catch (error) {
          console.error('Error executing Remove Duplicates command:', error);
        }
        break;
        
      case "execute_sort_tabs":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await sortTabs(currentWindow.id, preservePinned);
          console.log('Sort Tabs command executed successfully.');
        } catch (error) {
          console.error('Error executing Sort Tabs command:', error);
        }
        break;
        
      case "execute_group_by_domain":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await groupTabsByDomain(currentWindow.id);
          console.log('Group by Domain command executed successfully.');
          console.log('Note: This command no longer has a default keyboard shortcut due to Chrome\'s 4-shortcut limit. You can still use it from the extension popup.');
        } catch (error) {
          console.error('Error executing Group by Domain command:', error);
        }
        break;
        
      case "execute_close_blank_tabs":
        try {
          const currentWindow = await chrome.windows.getCurrent();
          await closeBlankTabs(currentWindow.id);
          console.log('Close Blank Tabs command executed successfully.');
          console.log('Note: This command no longer has a default keyboard shortcut due to Chrome\'s 4-shortcut limit. You can still use it from the extension popup.');
        } catch (error) {
          console.error('Error executing Close Blank Tabs command:', error);
        }
        break;
        
      default:
        console.error('Unrecognized command:', command);
        break;
    }
  } catch (error) {
    console.error('Error in command handler:', error);
  }
});

// Set to track windows that are currently being processed
const processingWindows = new Set();

/**
 * Groups all tabs from other windows into the target window.
 * Pinned tabs are moved first, followed by unpinned tabs.
 * @param {number} targetWindowId - The ID of the window to group tabs into
 * @returns {Promise<boolean>} - True if successful, throws error if failed
 */
async function groupAllTabs(targetWindowId) {
  try {
    console.log(`[groupAllTabs] Starting with target window ID: ${targetWindowId}`);
    
    // Verify the target window exists
    try {
      const targetWindow = await chrome.windows.get(targetWindowId);
      if (!targetWindow) {
        throw new Error(`Target window with ID ${targetWindowId} not found.`);
      }
      console.log(`[groupAllTabs] Target window found: ${targetWindowId}`);
    } catch (error) {
      throw new Error(`Target window with ID ${targetWindowId} not found: ${error.message}`);
    }
    
    // Get all windows
    const windows = await chrome.windows.getAll({ populate: true });
    console.log(`[groupAllTabs] Found ${windows.length} windows total`);
    
    // Filter out the target window
    const windowsToProcess = windows.filter(w => w.id !== targetWindowId);
    console.log(`[groupAllTabs] Processing ${windowsToProcess.length} windows (excluding target)`);
    
    // If there are no other windows to process, we're done
    if (windowsToProcess.length === 0) {
      console.log(`[groupAllTabs] No other windows to process, operation complete`);
      return true;
    }
    
    // First, collect all pinned tabs from other windows
    const pinnedTabsToMove = [];
    const unpinnedTabsToMove = [];
    
    for (const window of windowsToProcess) {
      const tabs = window.tabs;
      console.log(`[groupAllTabs] Window ${window.id} has ${tabs.length} tabs`);
      
      pinnedTabsToMove.push(...tabs.filter(tab => tab.pinned));
      unpinnedTabsToMove.push(...tabs.filter(tab => !tab.pinned));
    }
    
    console.log(`[groupAllTabs] Found ${pinnedTabsToMove.length} pinned tabs and ${unpinnedTabsToMove.length} unpinned tabs to move`);
    
    // Move all pinned tabs first, preserving their order
    if (pinnedTabsToMove.length > 0) {
      try {
        const pinnedTabIds = pinnedTabsToMove.map(tab => tab.id);
        console.log(`[groupAllTabs] Moving ${pinnedTabIds.length} pinned tabs to window ${targetWindowId}`);
        
        await chrome.tabs.move(pinnedTabIds, {
          windowId: targetWindowId,
          index: 0 // Move to the start of the window
        });
        
        // Ensure all moved tabs are pinned
        await Promise.all(pinnedTabIds.map(tabId => 
          chrome.tabs.update(tabId, { pinned: true })
        ));
        
        console.log(`[groupAllTabs] Successfully moved pinned tabs`);
      } catch (error) {
        console.error('[groupAllTabs] Error moving pinned tabs:', error);
        throw new Error(`Failed to move pinned tabs: ${error.message}`);
      }
    }
    
    // Then move all unpinned tabs to the end
    if (unpinnedTabsToMove.length > 0) {
      try {
        const unpinnedTabIds = unpinnedTabsToMove.map(tab => tab.id);
        console.log(`[groupAllTabs] Moving ${unpinnedTabIds.length} unpinned tabs to window ${targetWindowId}`);
        
        await chrome.tabs.move(unpinnedTabIds, {
          windowId: targetWindowId,
          index: -1 // Move to the end of the window
        });
        
        console.log(`[groupAllTabs] Successfully moved unpinned tabs`);
      } catch (error) {
        console.error('[groupAllTabs] Error moving unpinned tabs:', error);
        throw new Error(`Failed to move unpinned tabs: ${error.message}`);
      }
    }
    
    // After all tabs are moved, close the empty windows
    for (const window of windowsToProcess) {
      try {
        console.log(`[groupAllTabs] Closing empty window ${window.id}`);
        await chrome.windows.remove(window.id);
      } catch (error) {
        console.error(`[groupAllTabs] Error closing window ${window.id}:`, error);
        // Continue with other windows even if one fails
      }
    }
    
    console.log(`[groupAllTabs] Operation completed successfully`);
    return true;
  } catch (error) {
    console.error('[groupAllTabs] Error in groupAllTabs:', error);
    throw error;
  }
}

/**
 * Sorts tabs within the specified window by URL and title.
 * @param {number} windowId - The ID of the window to sort tabs in
 * @param {boolean} preservePinned - If true, keeps pinned tabs at the start in their original order
 * @returns {Promise<boolean>} - True if successful, throws error if failed
 */
async function sortTabs(windowId, preservePinned = false) {
  try {
    const window = await chrome.windows.get(windowId, { populate: true });
    if (!window) {
      throw new Error(`Window with ID ${windowId} not found.`);
    }
    const tabs = window.tabs;
    
    // Separate pinned and unpinned tabs
    const pinnedTabs = tabs.filter(tab => tab.pinned);
    const unpinnedTabs = tabs.filter(tab => !tab.pinned);
    
    // Helper function to safely compare URLs
    const compareUrls = (a, b) => {
      try {
        // First try direct URL comparison
        const urlCompare = a.url.localeCompare(b.url);
        if (urlCompare !== 0) return urlCompare;
        
        // If URLs are identical, compare by title
        return a.title.localeCompare(b.title);
      } catch (error) {
        console.error('Error comparing URLs:', error);
        // Fallback to title comparison if URL parsing fails
        return a.title.localeCompare(b.title);
      }
    };
    
    if (preservePinned) {
      // Keep pinned tabs exactly where they are
      // Only sort unpinned tabs
      unpinnedTabs.sort(compareUrls);
      
      // First, ensure pinned tabs are at the start
      for (let i = 0; i < pinnedTabs.length; i++) {
        try {
          await chrome.tabs.move(pinnedTabs[i].id, { index: i });
        } catch (error) {
          console.error(`Error moving pinned tab ${pinnedTabs[i].id}:`, error);
          throw new Error(`Failed to move pinned tab: ${error.message}`);
        }
      }
      
      // Then move unpinned tabs after the pinned ones
      for (let i = 0; i < unpinnedTabs.length; i++) {
        try {
          await chrome.tabs.move(unpinnedTabs[i].id, { index: pinnedTabs.length + i });
        } catch (error) {
          console.error(`Error moving unpinned tab ${unpinnedTabs[i].id}:`, error);
          throw new Error(`Failed to move unpinned tab: ${error.message}`);
        }
      }
    } else {
      // Sort all tabs together
      const allTabs = [...tabs]; // Create a copy of all tabs
      
      // Sort all tabs by URL and title
      allTabs.sort(compareUrls);
      
      // Move all tabs to their new positions
      for (let i = 0; i < allTabs.length; i++) {
        try {
          // First move the tab
          await chrome.tabs.move(allTabs[i].id, { index: i });
          
          // If preservePinned is false, we need to ensure the pinned state is correct
          // based on the new position
          if (!preservePinned) {
            // If the tab was pinned, keep it pinned
            if (allTabs[i].pinned) {
              await chrome.tabs.update(allTabs[i].id, { pinned: true });
            }
          }
        } catch (error) {
          console.error(`Error moving tab ${allTabs[i].id}:`, error);
          throw new Error(`Failed to move tab: ${error.message}`);
        }
      }
    }
    
    // Return true to indicate success
    return true;
  } catch (error) {
    console.error('Error in sortTabs:', error);
    throw error; // Re-throw to be caught by the caller
  }
}

/**
 * Removes duplicate tabs from the specified window.
 * A duplicate is defined as having the same URL as another tab.
 * @param {number} windowId - The ID of the window to remove duplicate tabs from
 * @returns {Promise<boolean>} - True if successful, throws error if failed
 */
async function removeDuplicateTabs(windowId) {
  try {
    console.log(`[removeDuplicateTabs] Starting with windowId: ${windowId}`);
    
    const window = await chrome.windows.get(windowId, { populate: true });
    if (!window) {
      throw new Error(`Window with ID ${windowId} not found.`);
    }
    console.log(`[removeDuplicateTabs] Found window with ${window.tabs.length} tabs`);
    
    const tabs = window.tabs;
    const seenUrls = new Map(); // Map to store URL -> first tab ID that has this URL
    const tabsToRemove = [];
    const firstOccurrences = new Set();
    
    // First pass: identify all duplicate tabs and mark first occurrences
    for (const tab of tabs) {
      console.log(`[removeDuplicateTabs] Processing tab ${tab.id} with URL: ${tab.url}`);
      
      if (seenUrls.has(tab.url)) {
        // This is a duplicate, add it to the list to remove
        console.log(`[removeDuplicateTabs] Found duplicate URL: ${tab.url}`);
        console.log(`[removeDuplicateTabs] Original tab ID: ${seenUrls.get(tab.url)}`);
        console.log(`[removeDuplicateTabs] Duplicate tab ID: ${tab.id}`);
        tabsToRemove.push(tab.id);
      } else {
        // First time seeing this URL, store the tab ID and mark as first occurrence
        console.log(`[removeDuplicateTabs] First occurrence of URL: ${tab.url}`);
        seenUrls.set(tab.url, tab.id);
        firstOccurrences.add(tab.id);
      }
    }
    
    console.log(`[removeDuplicateTabs] Found ${tabsToRemove.length} tabs to remove`);
    
    // Then remove them in batch if any exist
    if (tabsToRemove.length > 0) {
      try {
        // Get the active tab
        const activeTab = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTabId = activeTab[0]?.id;
        
        // If the active tab is a duplicate (not a first occurrence), we need to switch to the first occurrence
        if (activeTabId && tabsToRemove.includes(activeTabId)) {
          // Find the first occurrence of this URL
          const activeTabUrl = tabs.find(t => t.id === activeTabId)?.url;
          if (activeTabUrl) {
            const firstOccurrenceId = seenUrls.get(activeTabUrl);
            if (firstOccurrenceId) {
              console.log(`[removeDuplicateTabs] Switching from active tab ${activeTabId} to first occurrence ${firstOccurrenceId}`);
              await chrome.tabs.update(firstOccurrenceId, { active: true });
            }
          }
        }
        
        console.log(`[removeDuplicateTabs] Removing tabs: ${tabsToRemove.join(', ')}`);
        
        // Add a small delay before removing tabs
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await chrome.tabs.remove(tabsToRemove);
        console.log('[removeDuplicateTabs] Successfully removed duplicate tabs');
      } catch (error) {
        console.error('[removeDuplicateTabs] Error removing duplicate tabs:', error);
        throw new Error(`Failed to remove duplicate tabs: ${error.message}`);
      }
    } else {
      console.log('[removeDuplicateTabs] No duplicate tabs found to remove');
    }
    
    // Return true to indicate success
    return true;
  } catch (error) {
    console.error('[removeDuplicateTabs] Error in removeDuplicateTabs:', error);
    throw error; // Re-throw to be caught by the caller
  }
}

/**
 * Returns a random color from the available tab group colors.
 * @returns {string} - A color name from chrome.tabGroups.ColorValue
 */
function getRandomColor() {
  const colors = [
    'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Closes all blank and new tab pages in the specified window.
 * @param {number} windowId - The ID of the window to close blank tabs in
 * @returns {Promise<boolean>} - True if successful, throws error if failed
 */
async function closeBlankTabs(windowId) {
  try {
    // Get all tabs in the specified window
    const window = await chrome.windows.get(windowId, { populate: true });
    if (!window) {
      throw new Error(`Window with ID ${windowId} not found.`);
    }
    const tabs = window.tabs;
    
    // Filter tabs that are blank or new tab pages
    const blankTabs = tabs.filter(tab => {
      return tab.url === 'about:blank' || 
             tab.url === 'chrome://newtab/' || 
             tab.url === 'chrome://new-tab-page/';
    });
    
    // If there are blank tabs to close
    if (blankTabs.length > 0) {
      try {
        // Get the IDs of the blank tabs
        const tabIds = blankTabs.map(tab => tab.id);
        
        // Close all blank tabs at once
        await chrome.tabs.remove(tabIds);
        
        console.log(`Closed ${tabIds.length} blank tabs`);
      } catch (error) {
        console.error('Error closing blank tabs:', error);
        throw new Error(`Failed to close blank tabs: ${error.message}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in closeBlankTabs:', error);
    throw error;
  }
}

/**
 * Ungroups all tabs in the specified window.
 * @param {number} windowId - The ID of the window to ungroup tabs in
 * @returns {Promise<boolean>} - True if successful, throws error if failed
 */
async function ungroupTabs(windowId) {
  try {
    console.log(`[ungroupTabs] Starting with windowId: ${windowId}`);
    
    // Get all tabs in the specified window
    const window = await chrome.windows.get(windowId, { populate: true });
    if (!window) {
      throw new Error(`Window with ID ${windowId} not found.`);
    }
    console.log(`[ungroupTabs] Found window with ${window.tabs.length} tabs`);
    
    const tabs = window.tabs;
    
    // Ungroup all non-pinned tabs that are in groups
    for (const tab of tabs) {
      if (!tab.pinned && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        try {
          await chrome.tabs.ungroup(tab.id);
          console.log(`[ungroupTabs] Ungrouped tab ${tab.id}`);
        } catch (error) {
          console.warn(`[ungroupTabs] Failed to ungroup tab ${tab.id}:`, error);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[ungroupTabs] Error in ungroupTabs:', error);
    throw error;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'cleanTabsSequence') {
    // Handle the clean tabs sequence
    (async () => {
      try {
        // Get the current window
        const currentWindow = await chrome.windows.getCurrent();
        
        // First group all tabs into the current window
        await groupAllTabs(currentWindow.id);
        
        // Then sort the tabs
        await sortTabs(currentWindow.id, request.preservePinned);
        
        // Remove duplicates
        await removeDuplicateTabs(currentWindow.id);
        
        // Close blank tabs
        await closeBlankTabs(currentWindow.id);
        
        // Send success response
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error in cleanTabsSequence:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'An unknown error occurred'
        });
      }
    })();
    return true; // Keep the message channel open for async response
  } else if (request.action === 'groupTabs') {
    // Handle group tabs action
    (async () => {
      try {
        console.log('[Message Handler] Starting groupTabs action');
        
        // Use the window ID from the sender if provided, otherwise get current window
        let targetWindowId;
        if (request.targetWindowId) {
          targetWindowId = request.targetWindowId;
          console.log(`[Message Handler] Using provided target window ID: ${targetWindowId}`);
        } else {
          const currentWindow = await chrome.windows.getCurrent();
          targetWindowId = currentWindow.id;
          console.log(`[Message Handler] Using current window ID: ${targetWindowId}`);
        }
        
        // Verify the window exists
        try {
          const window = await chrome.windows.get(targetWindowId);
          if (!window) {
            throw new Error(`Window with ID ${targetWindowId} not found.`);
          }
        } catch (error) {
          throw new Error(`Window with ID ${targetWindowId} not found: ${error.message}`);
        }
        
        await groupAllTabs(targetWindowId);
        console.log('[Message Handler] groupAllTabs completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Message Handler] Error in groupTabs:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to group tabs'
        });
      }
    })();
    return true;
  } else if (request.action === 'sortTabs') {
    // Handle sort tabs action
    (async () => {
      try {
        console.log('[Message Handler] Starting sortTabs action');
        const targetWindowId = request.targetWindowId;
        if (!targetWindowId) {
          throw new Error("No target window ID provided for sortTabs action.");
        }
        console.log('[Message Handler] Using target window ID:', targetWindowId);
        await sortTabs(targetWindowId, request.preservePinned);
        console.log('[Message Handler] sortTabs completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Message Handler] Error in sortTabs:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to sort tabs'
        });
      }
    })();
    return true;
  } else if (request.action === 'removeDuplicates') {
    // Handle remove duplicates action
    (async () => {
      try {
        console.log('[Message Handler] Starting removeDuplicates action');
        const targetWindowId = request.targetWindowId;
        if (!targetWindowId) {
          throw new Error("No target window ID provided for removeDuplicates action.");
        }
        console.log('[Message Handler] Using target window ID:', targetWindowId);
        await removeDuplicateTabs(targetWindowId);
        console.log('[Message Handler] removeDuplicateTabs completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Message Handler] Error in removeDuplicates:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to remove duplicate tabs'
        });
      }
    })();
    return true;
  } else if (request.action === 'closeBlankTabs') {
    // Handle close blank tabs action
    (async () => {
      try {
        console.log('[Message Handler] Starting closeBlankTabs action');
        const targetWindowId = request.targetWindowId;
        if (!targetWindowId) {
          throw new Error("No target window ID provided for closeBlankTabs action.");
        }
        
        // Verify the window still exists
        try {
          const window = await chrome.windows.get(targetWindowId);
          if (!window) {
            throw new Error(`Window with ID ${targetWindowId} no longer exists.`);
          }
        } catch (error) {
          throw new Error(`Window with ID ${targetWindowId} not found: ${error.message}`);
        }
        
        console.log('[Message Handler] Using target window ID:', targetWindowId);
        
        // Get the current window to verify we're not operating on the wrong window
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow.id !== targetWindowId) {
          console.log(`[Message Handler] Warning: Target window (${targetWindowId}) is not the current window (${currentWindow.id})`);
          // We'll continue anyway, but log a warning
        }
        
        await closeBlankTabs(targetWindowId);
        console.log('[Message Handler] closeBlankTabs completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Message Handler] Error in closeBlankTabs:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to close blank tabs'
        });
      }
    })();
    return true;
  } else if (request.action === 'ungroupTabs') {
    // Handle ungroup tabs action
    (async () => {
      try {
        console.log('[Message Handler] Starting ungroupTabs action');
        const targetWindowId = request.targetWindowId;
        if (!targetWindowId) {
          throw new Error("No target window ID provided for ungroupTabs action.");
        }
        
        // Verify the window still exists
        try {
          const window = await chrome.windows.get(targetWindowId);
          if (!window) {
            throw new Error(`Window with ID ${targetWindowId} no longer exists.`);
          }
        } catch (error) {
          throw new Error(`Window with ID ${targetWindowId} not found: ${error.message}`);
        }
        
        console.log('[Message Handler] Using target window ID:', targetWindowId);
        
        // Get the current window to verify we're not operating on the wrong window
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow.id !== targetWindowId) {
          console.log(`[Message Handler] Warning: Target window (${targetWindowId}) is not the current window (${currentWindow.id})`);
          // We'll continue anyway, but log a warning
        }
        
        // Check if tabs are already ungrouped to prevent unnecessary operations
        const tabs = await chrome.tabs.query({ windowId: targetWindowId });
        const hasGroupedTabs = tabs.some(tab => !tab.pinned && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE);
        
        if (!hasGroupedTabs) {
          console.log('[Message Handler] Tabs are already ungrouped, skipping ungroupTabs operation');
          sendResponse({ success: true, message: 'Tabs are already ungrouped' });
          return;
        }
        
        await ungroupTabs(targetWindowId);
        console.log('[Message Handler] ungroupTabs completed successfully');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[Message Handler] Error in ungroupTabs:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to ungroup tabs'
        });
      }
    })();
    return true;
  }
}); 