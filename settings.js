/**
 * LinkMemory V4 - Settings Page Controller
 * Manages options tab selections, whitelisted domain scope lists,
 * direct bulk imports, CSV file transactions, and system metrics reporting.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.settings-panel');

  // General Panel Switches
  const toggleEnabled = document.getElementById('settings-toggle-enabled');

  // Website Scope Switches
  const radioScopeAll = document.getElementById('scope-mode-all');
  const radioScopeSelected = document.getElementById('scope-mode-selected');
  const domainWhitelistManager = document.getElementById('domain-whitelist-manager');
  const domainInput = document.getElementById('domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');
  const whitelistTable = document.getElementById('whitelist-table');

  // Title Database UI
  const bulkTextarea = document.getElementById('bulk-add-textarea');
  const btnClearTextarea = document.getElementById('btn-clear-textarea');
  const btnSaveBulk = document.getElementById('btn-save-bulk');
  const csvFileUploader = document.getElementById('csv-file-uploader');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnClearDbSettings = document.getElementById('btn-clear-db-settings');

  // Statistics Dashboard
  const statsTotalTitles = document.getElementById('stats-total-titles');
  const statsDbSize = document.getElementById('stats-db-size');
  const statsLastImport = document.getElementById('stats-last-import');
  const statsScopeStatus = document.getElementById('stats-scope-status');

  // Confirmation Modal
  const confirmModal = document.getElementById('confirm-modal');
  const modalBtnCancel = document.getElementById('modal-btn-cancel');
  const modalBtnConfirm = document.getElementById('modal-btn-confirm');

  // Feedback Toast
  const feedbackToast = document.getElementById('feedback-toast');

  // ----------------------------------------------------
  // 1. Initialization
  // ----------------------------------------------------
  initSettings();

  async function initSettings() {
    setupTabNavigation();
    await loadSettingsUI();
    await refreshStatistics();
    setupDatabaseActions();
  }

  // ----------------------------------------------------
  // 2. Navigation Tabs Logic
  // ----------------------------------------------------
  function setupTabNavigation() {
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Toggle Nav Tab Buttons
        navTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Toggle Content Panels
        const targetPanelId = tab.getAttribute('data-target');
        panels.forEach(panel => {
          if (panel.id === targetPanelId) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });
  }

  // ----------------------------------------------------
  // 3. Settings UI State Sync
  // ----------------------------------------------------
  async function loadSettingsUI() {
    const config = await StorageManager.getSettings();

    // Set enabled switch state
    toggleEnabled.checked = config.enabled;

    // Set Scope radio selectors
    if (config.scope === 'selected') {
      radioScopeSelected.checked = true;
      domainWhitelistManager.style.display = 'flex';
    } else {
      radioScopeAll.checked = true;
      domainWhitelistManager.style.display = 'none';
    }

    // Set Whitelist Table
    renderWhitelistTable(config.selectedDomains);

    // General toggle listener
    toggleEnabled.addEventListener('change', async () => {
      config.enabled = toggleEnabled.checked;
      await StorageManager.setSettings(config);
      triggerActiveTabRescan();
      showToast(config.enabled ? 'LinkMemory enabled globally.' : 'LinkMemory disabled globally.', 'success');
    });

    // Scope Selection Radios listeners
    [radioScopeAll, radioScopeSelected].forEach(radio => {
      radio.addEventListener('change', async () => {
        const selectedScope = document.querySelector('input[name="scope-mode"]:checked').value;
        config.scope = selectedScope;
        
        if (selectedScope === 'selected') {
          domainWhitelistManager.style.display = 'flex';
        } else {
          domainWhitelistManager.style.display = 'none';
        }

        await StorageManager.setSettings(config);
        triggerActiveTabRescan();
        refreshStatistics();
        showToast(`Website scope set to: ${selectedScope === 'all' ? 'All Websites' : 'Selected Websites Only'}.`, 'success');
      });
    });

    // Whitelist domain add listener
    btnAddDomain.addEventListener('click', async () => {
      const rawDomain = domainInput.value.trim();
      if (!rawDomain) {
        showToast('Please enter a valid website hostname or domain.', 'error');
        return;
      }
      
      // Basic hostname normalizer
      let cleanDomain = rawDomain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
      const slashIdx = cleanDomain.indexOf('/');
      if (slashIdx > -1) {
        cleanDomain = cleanDomain.substring(0, slashIdx);
      }

      if (!cleanDomain) {
        showToast('Please enter a valid domain (e.g. Medium.com).', 'error');
        return;
      }

      const updatedDomains = await StorageManager.addDomain(cleanDomain);
      domainInput.value = '';
      renderWhitelistTable(updatedDomains);
      triggerActiveTabRescan();
      showToast(`Whitelisted domain: ${cleanDomain}`, 'success');
    });

    // Enter key submit on domain textbox
    domainInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        btnAddDomain.click();
      }
    });
  }

  function renderWhitelistTable(domains) {
    if (!whitelistTable) return;
    if (domains.length === 0) {
      whitelistTable.innerHTML = `
        <div style="padding: 12px; font-size: 11px; color: var(--text-muted); text-align: center;">
          No selected websites added yet.
        </div>
      `;
      return;
    }

    whitelistTable.innerHTML = domains.map(domain => `
      <div class="whitelist-item">
        <span>${escapeHtml(domain)}</span>
        <button class="whitelist-delete-btn" data-domain="${escapeHtml(domain)}">&times;</button>
      </div>
    `).join('');

    // Bind Whitelist delete events
    whitelistTable.querySelectorAll('.whitelist-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const domain = e.target.getAttribute('data-domain');
        const updated = await StorageManager.removeDomain(domain);
        renderWhitelistTable(updated);
        triggerActiveTabRescan();
        showToast(`Removed whitelisted domain: ${domain}`, 'success');
      });
    });
  }

  // ----------------------------------------------------
  // 4. Database Actions Logic
  // ----------------------------------------------------
  function setupDatabaseActions() {
    // 1. Clear bulk add textarea
    btnClearTextarea.addEventListener('click', () => {
      bulkTextarea.value = '';
      bulkTextarea.focus();
    });

    // 2. Direct Bulk Add Titles
    btnSaveBulk.addEventListener('click', async () => {
      const rawText = bulkTextarea.value;
      const parsedTitles = rawText
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0 && t.toLowerCase() !== 'title');

      if (parsedTitles.length === 0) {
        showToast('Please paste at least one valid article title.', 'error');
        return;
      }

      updateImportProgress('titles', 30, 'Parsing pasted titles...');

      try {
        updateImportProgress('titles', 70, 'Storing in local database...');
        await new Promise(resolve => setTimeout(resolve, 300));

        const result = await StorageManager.saveTitles(parsedTitles);
        
        if (result.addedCount > 0) {
          updateImportProgress('titles', 100, `Done! Added ${result.addedCount.toLocaleString()} titles.`);
          showToast(`Added ${result.addedCount.toLocaleString()} new titles. (${result.skippedCount.toLocaleString()} duplicates skipped)`, 'success');
          bulkTextarea.value = '';
        } else {
          updateImportProgress('titles', 100, `Done! All titles already exist.`);
          showToast(`All ${result.skippedCount.toLocaleString()} titles already exist in database!`, 'success');
        }

        refreshStatistics();
        triggerActiveTabRescan();
      } catch (err) {
        console.error(err);
        updateImportProgress('titles', 100, 'Failed: Storing error');
        showToast('Failed to save bulk titles.', 'error');
      }
    });

    // 3. Clear file inputs on click to allow re-selection
    csvFileUploader.addEventListener('click', () => {
      csvFileUploader.value = '';
    });

    // 4. CSV File Uploader
    csvFileUploader.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      updateImportProgress('titles', 15, 'Reading CSV file...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        try {
          updateImportProgress('titles', 45, 'Parsing CSV headers...');
          const parsedTitles = CSVImporter.parse(text);

          if (parsedTitles.length === 0) {
            updateImportProgress('titles', 100, 'Failed: No titles found');
            showToast('No valid article titles found in CSV.', 'error');
            return;
          }

          updateImportProgress('titles', 75, 'Storing in database...');
          const result = await StorageManager.saveTitles(parsedTitles);

          if (result.addedCount > 0) {
            updateImportProgress('titles', 100, `Done! Added ${result.addedCount.toLocaleString()} titles.`);
            showToast(`Added ${result.addedCount.toLocaleString()} new titles. (${result.skippedCount.toLocaleString()} duplicates skipped)`, 'success');
          } else {
            updateImportProgress('titles', 100, `Done! All titles already exist.`);
            showToast(`All ${result.skippedCount.toLocaleString()} titles already exist in the database!`, 'success');
          }

          refreshStatistics();
          triggerActiveTabRescan();
        } catch (err) {
          console.error(err);
          updateImportProgress('titles', 100, 'Failed: Parsing error');
          showToast('Failed to parse Titles CSV file.', 'error');
        } finally {
          csvFileUploader.value = '';
        }
      };
      
      reader.onerror = () => {
        updateImportProgress('titles', 100, 'Failed: Read error');
        showToast('Error reading CSV file.', 'error');
        csvFileUploader.value = '';
      };
      reader.readAsText(file);
    });

    // 5. CSV File Exporter
    btnExportCsv.addEventListener('click', async () => {
      try {
        const titles = await StorageManager.getTitles();
        if (titles.length === 0) {
          showToast('Titles database is empty.', 'error');
          return;
        }

        const csvRows = ['title'];
        titles.forEach(title => {
          const escaped = title.replace(/"/g, '""');
          csvRows.push(`"${escaped}"`);
        });

        triggerDownload(csvRows.join('\r\n'), 'linkmemory-export.csv');
        showToast('Database exported successfully!', 'success');
      } catch (err) {
        showToast('Database export failed.', 'error');
      }
    });

    // 6. database Wipe triggers Modal confirmations
    btnClearDbSettings.addEventListener('click', () => {
      confirmModal.classList.add('active');
    });

    modalBtnCancel.addEventListener('click', () => {
      confirmModal.classList.remove('remove');
      confirmModal.classList.remove('active');
    });

    modalBtnConfirm.addEventListener('click', async () => {
      confirmModal.classList.remove('active');
      try {
        await StorageManager.clearDatabase();
        showToast('Database cleared successfully.', 'success');
        
        bulkTextarea.value = '';
        refreshStatistics();
        triggerActiveTabRescan();
      } catch (err) {
        showToast('Wiping database failed.', 'error');
      }
    });

    // Overlay tap-out close
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        confirmModal.classList.remove('active');
      }
    });
  }

  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ----------------------------------------------------
  // 5. Statistics Metrics Rendering
  // ----------------------------------------------------
  async function refreshStatistics() {
    try {
      const stats = await StorageManager.getStats();
      const config = await StorageManager.getSettings();

      // Set counts
      statsTotalTitles.textContent = stats.totalTitles.toLocaleString();
      statsDbSize.textContent = formatBytes(stats.storageBytes);
      statsLastImport.textContent = formatDate(stats.lastImportDate);

      // Set scope text highlights
      if (config.scope === 'selected') {
        statsScopeStatus.textContent = 'Selected Websites Only';
        statsScopeStatus.style.setProperty('color', '#ff9f0a', 'important');
      } else {
        statsScopeStatus.textContent = 'All Websites';
        statsScopeStatus.style.setProperty('color', 'var(--accent-green)', 'important');
      }
    } catch (e) {
      console.error('Error rendering database metrics:', e);
    }
  }

  // ----------------------------------------------------
  // 6. Messaging / Alert Helpers
  // ----------------------------------------------------
  function triggerActiveTabRescan() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          const url = tab.url || '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            chrome.tabs.sendMessage(tab.id, { action: 'reScanPage' }, () => {
              // Ignore standard runtime error exceptions on inactive tabs
              if (chrome.runtime.lastError) return;
            });
          }
        });
      });
    }
  }

  function showToast(msg, type = 'success') {
    feedbackToast.textContent = msg;
    feedbackToast.className = `feedback-toast ${type}`;
    feedbackToast.style.display = 'block';

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      feedbackToast.style.display = 'none';
      feedbackToast.className = 'feedback-toast';
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

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
