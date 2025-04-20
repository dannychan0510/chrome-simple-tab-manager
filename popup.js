document.addEventListener('DOMContentLoaded', () => {
  const preservePinnedToggle = document.getElementById('preservePinned');
  const statusMessage = document.getElementById('statusMessage');
  const buttons = {
    cleanTabs: document.getElementById('cleanTabs'),
    groupTabs: document.getElementById('groupTabs'),
    removeDuplicates: document.getElementById('removeDuplicates'),
    sortTabs: document.getElementById('sortTabs'),
    groupByDomain: document.getElementById('groupByDomain'),
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
   * @param {boolean} disabled - Whether to disable the buttons
   */
  function setButtonsEnabled(enabled) {
    Object.values(buttons).forEach(button => {
      button.disabled = !enabled;
    });
    preservePinnedToggle.disabled = !enabled;
  }

  /**
   * Handles the response from a background operation.
   * @param {Object} response - The response from the background script
   * @param {boolean} response.success - Whether the operation was successful
   * @param {string} [response.error] - Error message if the operation failed
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
  buttons.cleanTabs.addEventListener('click', async () => {
    try {
      setButtonsEnabled(false);
      displayStatus('Cleaning tabs...', 'processing');
      
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

  buttons.groupTabs.addEventListener('click', async () => {
    try {
      setButtonsEnabled(false);
      displayStatus('Grouping tabs...', 'processing');
      
      // Get the current window ID
      const currentWindow = await chrome.windows.getCurrent();
      chrome.runtime.sendMessage({ 
        action: 'groupTabs',
        targetWindowId: currentWindow.id
      }, (response) => {
        handleResponse(response, 'Tabs grouped successfully!');
      });
    } catch (error) {
      displayStatus(`Error: ${error.message}`, 'error');
      console.error('Error in groupTabs operation:', error);
      setButtonsEnabled(true);
    }
  });

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

  buttons.groupByDomain.addEventListener('click', () => {
    try {
      setButtonsEnabled(false);
      displayStatus('Grouping tabs by domain...', 'processing');
      
      chrome.runtime.sendMessage({ action: 'groupByDomain' }, (response) => {
        handleResponse(response, 'Tabs grouped by domain successfully!');
      });
    } catch (error) {
      displayStatus(`Error: ${error.message}`, 'error');
      console.error('Error in groupByDomain operation:', error);
      setButtonsEnabled(true);
    }
  });

  buttons.closeBlankTabs.addEventListener('click', () => {
    try {
      setButtonsEnabled(false);
      displayStatus('Closing blank tabs...', 'processing');
      
      chrome.runtime.sendMessage({ action: 'closeBlankTabs' }, (response) => {
        handleResponse(response, 'Blank tabs closed successfully!');
      });
    } catch (error) {
      displayStatus(`Error: ${error.message}`, 'error');
      console.error('Error in closeBlankTabs operation:', error);
      setButtonsEnabled(true);
    }
  });
}); 