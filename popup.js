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
  document.getElementById('groupTabs').addEventListener('click', async () => {
    // Get the current window ID
    const currentWindow = await chrome.windows.getCurrent();
    chrome.runtime.sendMessage({ 
      action: 'groupTabs',
      targetWindowId: currentWindow.id
    });
  });

  document.getElementById('sortTabs').addEventListener('click', () => {
    chrome.runtime.sendMessage({ 
      action: 'sortTabs',
      preservePinned: preservePinnedToggle.checked
    });
  });

  document.getElementById('removeDuplicates').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'removeDuplicates' });
  });
}); 