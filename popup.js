/**
 * LinkMemory V4 - Popup Controller
 * Manages statistics dashboard, quick bulk title pasting,
 * settings redirection, and active tab content script rescan triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Stats Dashboard Metrics
  const statTotalCount = document.getElementById('stat-total-count');
  const statMatchedPageCount = document.getElementById('stat-matched-page-count');
  const statDbSize = document.getElementById('stat-db-size');
  const statScopeStatus = document.getElementById('stat-scope-status');
  
  // General switch Toggle
  const toggleEnabled = document.getElementById('toggle-enabled');

  // Popup Actions & Open Settings redirect
  const btnToggleBulkPaste = document.getElementById('btn-toggle-bulk-paste');
  const btnOpenSettings = document.getElementById('btn-open-settings');

  // Bulk Paste Area Elements
  const bulkPasteContainer = document.getElementById('bulk-paste-container');
  const bulkPasteTextarea = document.getElementById('bulk-paste-textarea');
  const btnImportBulkPaste = document.getElementById('btn-import-bulk-paste');
  const btnClearBulkPaste = document.getElementById('btn-clear-bulk-paste');

  // Feedback messages
  const feedbackMessage = document.getElementById('feedback-message');

  // ----------------------------------------------------
  // 1. Initialization
  // ----------------------------------------------------
  initPopup();

  async function initPopup() {
    await updateDashboardStats();
    await updateMatchedCounts();
    setupGlobalToggle();
    setupBulkPasteActions();
    
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          // Fallback if standalone tab open is required
          window.open(chrome.runtime.getURL('settings.html'));
        }
      });
    }
  }

  // ----------------------------------------------------
  // 2. Statistics & UI State Sync
  // ----------------------------------------------------
  async function updateDashboardStats() {
    try {
      const stats = await StorageManager.getStats();
      const config = await StorageManager.getSettings();

      statTotalCount.textContent = stats.totalTitles.toLocaleString();
      statDbSize.textContent = formatBytes(stats.storageBytes);
      toggleEnabled.checked = config.enabled;

      // Set scope text highlights
      if (config.scope === 'selected') {
        statScopeStatus.textContent = 'Selected Only';
        statScopeStatus.style.setProperty('color', '#ff9f0a', 'important');
      } else {
        statScopeStatus.textContent = 'All Websites';
        statScopeStatus.style.setProperty('color', 'var(--accent-green)', 'important');
      }
    } catch (e) {
      console.error('Error refreshing statistics cards:', e);
    }
  }

  /**
   * Syncs with active page content script to render matched Seen ratios.
   */
  function updateMatchedCounts() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const url = tabs[0].url || '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getMatchedCount' }, (response) => {
              if (chrome.runtime.lastError) {
                statMatchedPageCount.textContent = '0';
                return;
              }
              if (response && response.count !== undefined) {
                statMatchedPageCount.textContent = response.count.toLocaleString();
              } else {
                statMatchedPageCount.textContent = '0';
              }
            });
          } else {
            statMatchedPageCount.textContent = '0';
          }
        }
      });
    }
  }

  function setupGlobalToggle() {
    toggleEnabled.addEventListener('change', async () => {
      const config = await StorageManager.getSettings();
      config.enabled = toggleEnabled.checked;
      await StorageManager.setSettings(config);
      
      triggerActiveTabRescan();
      showToast(config.enabled ? 'LinkMemory enabled.' : 'LinkMemory disabled.', 'success');
      await updateDashboardStats();
    });
  }

  // ----------------------------------------------------
  // 3. Quick Bulk Paste Integration
  // ----------------------------------------------------
  function setupBulkPasteActions() {
    if (!btnToggleBulkPaste || !bulkPasteContainer) return;

    // Toggle slide open accordion
    btnToggleBulkPaste.addEventListener('click', () => {
      const isHidden = bulkPasteContainer.style.display === 'none' || bulkPasteContainer.style.display === '';
      if (isHidden) {
        bulkPasteContainer.style.display = 'flex';
        btnToggleBulkPaste.classList.add('active');
        bulkPasteTextarea.focus();
      } else {
        bulkPasteContainer.style.display = 'none';
        btnToggleBulkPaste.classList.remove('active');
      }
    });

    // Clear textarea
    btnClearBulkPaste.addEventListener('click', () => {
      bulkPasteTextarea.value = '';
      bulkPasteTextarea.focus();
    });

    // Import pasted titles
    btnImportBulkPaste.addEventListener('click', async () => {
      const rawText = bulkPasteTextarea.value;
      const parsedTitles = rawText
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0 && t.toLowerCase() !== 'title');

      if (parsedTitles.length === 0) {
        showToast('Please paste at least one valid article title.', 'error');
        return;
      }

      updateImportProgress('titles', 25, 'Parsing pasted titles...');

      try {
        updateImportProgress('titles', 65, 'Storing in local database...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const result = await StorageManager.saveTitles(parsedTitles);
        
        if (result.addedCount > 0) {
          updateImportProgress('titles', 100, `Done! Added ${result.addedCount.toLocaleString()} titles.`);
          showToast(`Added ${result.addedCount.toLocaleString()} new titles. (${result.skippedCount.toLocaleString()} duplicates skipped)`, 'success');
          
          bulkPasteTextarea.value = '';
          bulkPasteContainer.style.display = 'none';
          btnToggleBulkPaste.classList.remove('active');
        } else {
          updateImportProgress('titles', 100, `Done! All titles already exist.`);
          showToast(`All ${result.skippedCount.toLocaleString()} titles already exist in database!`, 'success');
        }

        await updateDashboardStats();
        triggerActiveTabRescan();
      } catch (err) {
        console.error(err);
        updateImportProgress('titles', 100, 'Failed: Storing error');
        showToast('Failed to save pasted titles.', 'error');
      }
    });
  }

  // ----------------------------------------------------
  // 4. Messaging Port Alerts
  // ----------------------------------------------------
  function triggerActiveTabRescan() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const url = tabs[0].url || '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'reScanPage' }, () => {
              if (chrome.runtime.lastError) return;
              setTimeout(updateMatchedCounts, 300);
            });
          }
        }
      });
    }
  }

  function showToast(msg, type = 'success') {
    feedbackMessage.textContent = msg;
    feedbackMessage.className = `feedback-toast ${type}`;
    feedbackMessage.style.display = 'block';
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      feedbackMessage.style.display = 'none';
      feedbackMessage.className = 'feedback-toast';
    }, 4500);
  }

  function updateImportProgress(type, percentage, statusText) {
    const container = document.getElementById(`import-progress-${type}`);
    const fill = document.getElementById(`progress-fill-${type}`);
    const status = document.getElementById(`progress-status-${type}`);
    const pct = document.getElementById(`progress-pct-${type}`);
    
    if (!container || !fill || !status || !pct) return;
    
    container.style.display = 'flex';
    fill.style.width = `${percentage}%`;
    status.textContent = statusText;
    pct.textContent = `${percentage}%`;
    
    if (percentage >= 100) {
      setTimeout(() => {
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          container.style.display = 'none';
          container.style.opacity = '1';
          container.style.removeProperty('transition');
          fill.style.width = '0%';
          pct.textContent = '0%';
          status.textContent = 'Ready';
        }, 500);
      }, 2500);
    }
  }
});
