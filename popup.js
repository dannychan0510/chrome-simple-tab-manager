document.addEventListener('DOMContentLoaded', () => {
  const preservePinnedToggle = document.getElementById('preservePinned');
  
  // Load saved state
  chrome.storage.sync.get(['preservePinned'], (result) => {
    preservePinnedToggle.checked = result.preservePinned ?? false;
  });

  // Save state when toggle changes
  preservePinnedToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ preservePinned: preservePinnedToggle.checked });
  });

  // Add click handlers for each button
  document.getElementById('cleanTabs').addEventListener('click', async () => {
    try {
      // Get the current window ID
      const currentWindow = await chrome.windows.getCurrent();
      const targetWindowId = currentWindow.id;
      
      // Step 1: Group all tabs
      console.log('Step 1: Grouping tabs');
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'groupTabs',
          targetWindowId: targetWindowId
        }, (response) => {
          if (response && response.success) {
            console.log('Group tabs operation completed successfully');
            resolve();
          } else {
            console.error('Group tabs operation failed');
            resolve(); // Continue anyway
          }
        });
      });
      
      // Wait for a moment to ensure grouping is complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Remove duplicates
      console.log('Step 2: Removing duplicates');
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'removeDuplicates'
        }, (response) => {
          if (response && response.success) {
            console.log('Remove duplicates operation completed successfully');
            resolve();
          } else {
            console.error('Remove duplicates operation failed');
            resolve(); // Continue anyway
          }
        });
      });
      
      // Wait for a moment to ensure duplicates are removed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Sort tabs
      console.log('Step 3: Sorting tabs');
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ 
          action: 'sortTabs',
          preservePinned: preservePinnedToggle.checked
        }, (response) => {
          if (response && response.success) {
            console.log('Sort tabs operation completed successfully');
            resolve();
          } else {
            console.error('Sort tabs operation failed');
            resolve(); // Continue anyway
          }
        });
      });
      
      console.log('All operations completed successfully');
    } catch (error) {
      console.error('Error in cleanTabs operation:', error);
    }
  });

  document.getElementById('groupTabs').addEventListener('click', async () => {
    // Get the current window ID
    const currentWindow = await chrome.windows.getCurrent();
    chrome.runtime.sendMessage({ 
      action: 'groupTabs',
      targetWindowId: currentWindow.id
    }, (response) => {
      if (response && response.success) {
        console.log('Group tabs operation completed successfully');
      } else {
        console.error('Group tabs operation failed');
      }
    });
  });

  document.getElementById('removeDuplicates').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'removeDuplicates' }, (response) => {
      if (response && response.success) {
        console.log('Remove duplicates operation completed successfully');
      } else {
        console.error('Remove duplicates operation failed');
      }
    });
  });

  document.getElementById('sortTabs').addEventListener('click', () => {
    chrome.runtime.sendMessage({ 
      action: 'sortTabs',
      preservePinned: preservePinnedToggle.checked
    }, (response) => {
      if (response && response.success) {
        console.log('Sort tabs operation completed successfully');
      } else {
        console.error('Sort tabs operation failed');
      }
    });
  });
}); 