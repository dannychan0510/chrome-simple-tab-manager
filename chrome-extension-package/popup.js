document.addEventListener('DOMContentLoaded', () => {
  // Get UI elements
  const preservePinnedToggle = document.getElementById('preservePinned');
  const statusMessage = document.getElementById('statusMessage');
  
  // Get action buttons
  const buttons = {
    cleanTabs: document.getElementById('cleanTabs'),
    groupTabs: document.getElementById('groupTabs'),
    removeDuplicates: document.getElementById('removeDuplicates'),
    sortTabs: document.getElementById('sortTabs'),
    closeBlankTabs: document.getElementById('closeBlankTabs')
  };
  
  // Load saved state
  chrome.storage.sync.get(['preservePinned'], (result) => {
    preservePinnedToggle.checked = result.preservePinned ?? false;
  });

  // Save state when toggle changes
  preservePinnedToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ preservePinned: preservePinnedToggle.checked });
  });

  /**
   * Displays a status message in the popup UI.
   * @param {string} message - The message to display
   * @param {string} type - The type of message ('success', 'error', or 'processing')
   */
  function displayStatus(message, type = 'processing') {
    statusMessage.textContent = message;
    statusMessage.className = 'status ' + type;
  }

  /**
   * Disables or enables all action buttons in the popup.
   * @param {boolean} enabled - Whether to enable the buttons
   */
  function setButtonsEnabled(enabled) {
    Object.values(buttons).forEach(button => {
      if (button) {
        button.disabled = !enabled;
      }
    });
    if (preservePinnedToggle) {
      preservePinnedToggle.disabled = !enabled;
    }
  }

  /**
   * Handles the response from a background operation.
   * @param {Object} response - The response from the background script
   * @param {string} successMessage - The message to display on success
   */
  function handleResponse(response, successMessage) {
    if (response && response.success) {
      displayStatus(successMessage, 'success');
      console.log(successMessage);
    } else {
      const errorMessage = response?.error || 'Unknown error';
      displayStatus(`Error: ${errorMessage}`, 'error');
      console.error('Operation failed:', errorMessage);
    }
    setButtonsEnabled(true);
  }

  // Add click handlers for each button
  if (buttons.cleanTabs) {
    buttons.cleanTabs.addEventListener('click', async () => {
      try {
        setButtonsEnabled(false);
        displayStatus('Cleaning tabs (grouping, sorting, removing duplicates, closing blank tabs)...', 'processing');
        
        // Get the current window ID
        const currentWindow = await chrome.windows.getCurrent();
        const targetWindowId = currentWindow.id;
        
        // Send a single message to execute the entire sequence
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ 
            action: 'cleanTabsSequence',
            targetWindowId: targetWindowId,
            preservePinned: preservePinnedToggle.checked
          }, (response) => {
            handleResponse(response, 'Tabs cleaned successfully!');
            resolve();
          });
        });
      } catch (error) {
        displayStatus(`Error: ${error.message}`, 'error');
        console.error('Error in cleanTabs operation:', error);
        setButtonsEnabled(true);
      }
    });
  }

  if (buttons.groupTabs) {
    buttons.groupTabs.addEventListener('click', async () => {
      try {
        // Get the current window ID
        const currentWindow = await chrome.windows.getCurrent();
        
        // Send message to background script with the current window ID
        const response = await chrome.runtime.sendMessage({
          action: 'groupTabs',
          targetWindowId: currentWindow.id
        });
        
        if (response.success) {
          displayStatus('Tabs grouped successfully!', 'success');
        } else {
          displayStatus(`Error: ${response.error || 'Failed to group tabs'}`, 'error');
        }
      } catch (error) {
        console.error('Error in groupTabs click handler:', error);
        displayStatus(`Error: ${error.message || 'Failed to group tabs'}`, 'error');
      }
    });
  }

  if (buttons.removeDuplicates) {
    buttons.removeDuplicates.addEventListener('click', async () => {
      try {
        setButtonsEnabled(false);
        displayStatus('Removing duplicates...', 'processing');
        
        // Get the current window ID
        const currentWindow = await chrome.windows.getCurrent();
        chrome.runtime.sendMessage({ 
          action: 'removeDuplicates',
          targetWindowId: currentWindow.id
        }, (response) => {
          handleResponse(response, 'Duplicates removed successfully!');
        });
      } catch (error) {
        displayStatus(`Error: ${error.message}`, 'error');
        console.error('Error in removeDuplicates operation:', error);
        setButtonsEnabled(true);
      }
    });
  }

  if (buttons.sortTabs) {
    buttons.sortTabs.addEventListener('click', async () => {
      try {
        setButtonsEnabled(false);
        displayStatus('Sorting tabs...', 'processing');
        
        // Get the current window ID
        const currentWindow = await chrome.windows.getCurrent();
        chrome.runtime.sendMessage({ 
          action: 'sortTabs',
          targetWindowId: currentWindow.id,
          preservePinned: preservePinnedToggle.checked
        }, (response) => {
          handleResponse(response, 'Tabs sorted successfully!');
        });
      } catch (error) {
        displayStatus(`Error: ${error.message}`, 'error');
        console.error('Error in sortTabs operation:', error);
        setButtonsEnabled(true);
      }
    });
  }

  if (buttons.closeBlankTabs) {
    buttons.closeBlankTabs.addEventListener('click', async () => {
      try {
        setButtonsEnabled(false);
        displayStatus('Closing blank tabs...', 'processing');
        
        // Get the current window ID
        const currentWindow = await chrome.windows.getCurrent();
        chrome.runtime.sendMessage({ 
          action: 'closeBlankTabs',
          targetWindowId: currentWindow.id
        }, (response) => {
          handleResponse(response, 'Blank tabs closed successfully!');
        });
      } catch (error) {
        displayStatus(`Error: ${error.message}`, 'error');
        console.error('Error in closeBlankTabs operation:', error);
        setButtonsEnabled(true);
      }
    });
  }
}); 