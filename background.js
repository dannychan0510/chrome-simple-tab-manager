// Function to group all tabs into a single window
async function groupAllTabs(targetWindowId) {
  const windows = await chrome.windows.getAll({ populate: true });
  
  // Find the target window
  const targetWindow = windows.find(w => w.id === targetWindowId);
  if (!targetWindow) {
    console.error('Target window not found');
    return;
  }

  // Get all pinned tabs from the target window
  const targetPinnedTabs = targetWindow.tabs.filter(tab => tab.pinned);
  
  // First, collect all pinned tabs from all windows
  let allPinnedTabs = [...targetPinnedTabs];
  for (const window of windows) {
    if (window.id !== targetWindowId) {
      const pinnedTabs = window.tabs.filter(tab => tab.pinned);
      allPinnedTabs = [...allPinnedTabs, ...pinnedTabs];
    }
  }
  
  // Collect all windows that need to be processed (excluding target window)
  const windowsToProcess = windows.filter(w => w.id !== targetWindowId);
  
  // Process each window separately
  for (const window of windowsToProcess) {
    const tabs = window.tabs;
    
    // First, move pinned tabs to preserve their order
    const pinnedTabs = tabs.filter(tab => tab.pinned);
    for (let i = 0; i < pinnedTabs.length; i++) {
      const tab = pinnedTabs[i];
      // Find the position of this tab in the allPinnedTabs array
      const targetIndex = allPinnedTabs.findIndex(t => t.id === tab.id);
      if (targetIndex !== -1) {
        // First move the tab
        await chrome.tabs.move(tab.id, {
          windowId: targetWindowId,
          index: targetIndex // Place at the correct position
        });
        // Then ensure it's pinned
        await chrome.tabs.update(tab.id, { pinned: true });
      }
    }
    
    // Then move unpinned tabs
    const unpinnedTabs = tabs.filter(tab => !tab.pinned);
    for (const tab of unpinnedTabs) {
      await chrome.tabs.move(tab.id, {
        windowId: targetWindowId,
        index: -1 // Add to the end
      });
    }
  }
  
  // After all tabs are moved, close the empty windows
  for (const window of windowsToProcess) {
    await chrome.windows.remove(window.id);
  }
  
  // Return true to indicate success
  return true;
}

// Function to sort tabs by domain and title
async function sortTabs(preservePinned = false) {
  const window = await chrome.windows.getCurrent({ populate: true });
  const tabs = window.tabs;
  
  // Separate pinned and unpinned tabs
  const pinnedTabs = tabs.filter(tab => tab.pinned);
  const unpinnedTabs = tabs.filter(tab => !tab.pinned);
  
  if (preservePinned) {
    // Keep pinned tabs exactly where they are
    // Only sort unpinned tabs
    unpinnedTabs.sort((a, b) => {
      const domainA = new URL(a.url).hostname;
      const domainB = new URL(b.url).hostname;
      
      if (domainA !== domainB) {
        return domainA.localeCompare(domainB);
      }
      return a.title.localeCompare(b.title);
    });
    
    // First, ensure pinned tabs are at the start
    for (let i = 0; i < pinnedTabs.length; i++) {
      await chrome.tabs.move(pinnedTabs[i].id, { index: i });
    }
    
    // Then move unpinned tabs after the pinned ones
    for (let i = 0; i < unpinnedTabs.length; i++) {
      await chrome.tabs.move(unpinnedTabs[i].id, { index: pinnedTabs.length + i });
    }
  } else {
    // Sort all tabs together
    const allTabs = [...tabs]; // Create a copy of all tabs
    
    // Sort all tabs by domain and title
    allTabs.sort((a, b) => {
      const domainA = new URL(a.url).hostname;
      const domainB = new URL(b.url).hostname;
      
      if (domainA !== domainB) {
        return domainA.localeCompare(domainB);
      }
      return a.title.localeCompare(b.title);
    });
    
    // Move all tabs to their new positions
    for (let i = 0; i < allTabs.length; i++) {
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
    }
  }
  
  // Return true to indicate success
  return true;
}

// Function to remove duplicate tabs
async function removeDuplicateTabs() {
  const window = await chrome.windows.getCurrent({ populate: true });
  const tabs = window.tabs;
  const seenUrls = new Set();
  
  for (const tab of tabs) {
    if (seenUrls.has(tab.url)) {
      await chrome.tabs.remove(tab.id);
    } else {
      seenUrls.add(tab.url);
    }
  }
  
  // Return true to indicate success
  return true;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action);
  
  // Handle each action asynchronously
  if (request.action === 'groupTabs') {
    groupAllTabs(request.targetWindowId)
      .then(success => {
        console.log('Group tabs completed with success:', success);
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error in groupTabs:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates we'll respond asynchronously
  } 
  else if (request.action === 'sortTabs') {
    sortTabs(request.preservePinned)
      .then(success => {
        console.log('Sort tabs completed with success:', success);
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error in sortTabs:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } 
  else if (request.action === 'removeDuplicates') {
    removeDuplicateTabs()
      .then(success => {
        console.log('Remove duplicates completed with success:', success);
        sendResponse({ success });
      })
      .catch(error => {
        console.error('Error in removeDuplicates:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
}); 