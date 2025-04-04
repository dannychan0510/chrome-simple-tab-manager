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
  
  // Move all tabs from other windows to the target window
  for (const window of windows) {
    if (window.id !== targetWindowId) {
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
      
      // Close the empty window
      await chrome.windows.remove(window.id);
    }
  }
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
    const allTabs = [...pinnedTabs, ...unpinnedTabs];
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
      await chrome.tabs.move(allTabs[i].id, { index: i });
    }
  }
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
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'groupTabs':
      groupAllTabs(request.targetWindowId);
      break;
    case 'sortTabs':
      sortTabs(request.preservePinned);
      break;
    case 'removeDuplicates':
      removeDuplicateTabs();
      break;
  }
}); 