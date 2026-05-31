/**
 * ARC Content Tracker V2 - Popup Controller
 * Manages statistics dashboards, CSV upload integrations for both Titles & URLs,
 * live deduplicated history search, structured downloads, database wipes, and content script triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Stats Card Metrics
  const statVisitedCount = document.getElementById('stat-visited-count');
  const statImportedCount = document.getElementById('stat-imported-count');
  const statVisitedPageCount = document.getElementById('stat-visited-page-count');
  const statSeenCount = document.getElementById('stat-seen-count');
  
  const statDbSize = document.getElementById('stat-db-size');
  const statLastImport = document.getElementById('stat-last-import');
  
  // CSV File Uploader & Exporters
  const csvFileInput = document.getElementById('csv-file-input');
  const btnExport = document.getElementById('btn-export');
  
  const csvUrlFileInput = document.getElementById('csv-url-file-input');
  const btnExportUrls = document.getElementById('btn-export-urls');
  
  // Bulk Paste UI Elements
  const btnToggleBulkPaste = document.getElementById('btn-toggle-bulk-paste');
  const bulkPasteContainer = document.getElementById('bulk-paste-container');
  const bulkPasteTextarea = document.getElementById('bulk-paste-textarea');
  const btnImportBulkPaste = document.getElementById('btn-import-bulk-paste');
  const btnClearBulkPaste = document.getElementById('btn-clear-bulk-paste');
  
  // Clear Database button
  const btnClearDb = document.getElementById('btn-clear-db');
  
  // Search Box Inputs
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const resultsCountLabel = document.getElementById('results-count-label');
  const searchResultsList = document.getElementById('search-results-list');
  
  // Banner notifications
  const feedbackMessage = document.getElementById('feedback-message');
  
  // Custom Confirmation Modal Overlay
  const confirmModal = document.getElementById('confirm-modal');
  const modalBtnCancel = document.getElementById('modal-btn-cancel');
  const modalBtnConfirm = document.getElementById('modal-btn-confirm');

  // Preferences & Exceptions UI Elements
  const toggleHideVisited = document.getElementById('toggle-hide-visited');
  const btnExcludeCurrent = document.getElementById('btn-exclude-current');
  const exceptionsInput = document.getElementById('exceptions-input');
  const btnAddException = document.getElementById('btn-add-exception');
  const exceptionsList = document.getElementById('exceptions-list');

  // Initialize popup operations
  updateDashboardStats();
  updateMatchedCounts();
  setupSearch();
  setupFileImports();
  setupBulkPaste();
  setupExporters();
  setupClearDb();
  setupHidingExceptions();

  /**
   * Refreshes the database counts on the popup metrics screen.
   */
  async function updateDashboardStats() {
    try {
      const stats = await StorageManager.getStats();
      statVisitedCount.textContent = stats.totalVisitedUrls.toLocaleString();
      statImportedCount.textContent = stats.totalTitles.toLocaleString();
      statDbSize.textContent = formatBytes(stats.storageBytes);
      statLastImport.textContent = formatDate(stats.lastImportDate);
    } catch (e) {
      console.error('Error refreshing statistics cards:', e);
    }
  }

  /**
   * Messaging layer to poll matched Seen and Visited ratios from the active tab.
   */
  function updateMatchedCounts() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const url = tabs[0].url || '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getMatchedCount' }, (response) => {
              if (chrome.runtime.lastError) {
                statSeenCount.textContent = '0';
                statVisitedPageCount.textContent = '0';
                return;
              }
              if (response) {
                statSeenCount.textContent = (response.seenCount || 0).toLocaleString();
                statVisitedPageCount.textContent = (response.visitedCount || 0).toLocaleString();
              } else {
                statSeenCount.textContent = '0';
                statVisitedPageCount.textContent = '0';
              }
            });
          } else {
            statSeenCount.textContent = '0';
            statVisitedPageCount.textContent = '0';
          }
        }
      });
    }
  }

  /**
   * Requests the current active tab content script to clear caching flags and recheck DOM nodes.
   */
  function triggerActiveTabRescan() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const url = tabs[0].url || '';
          if (url.startsWith('http://') || url.startsWith('https://')) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'reScanPage' }, (response) => {
              if (chrome.runtime.lastError) return;
              setTimeout(updateMatchedCounts, 300);
            });
          }
        }
      });
    }
  }

  /**
   * Prompts success or failure messages under file operation groups.
   */
  function showToast(msg, type = 'success') {
    feedbackMessage.textContent = msg;
    feedbackMessage.className = `feedback-toast ${type}`;
    
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      feedbackMessage.className = 'feedback-toast';
    }, 4500);
  }

  /**
   * Implements live search indexing across Titles and Visited URLs databases.
   */
  function setupSearch() {
    let allTitles = [];
    let allVisited = [];

    // Cache database entries locally on typing starting to maximize speed
    searchInput.addEventListener('focus', async () => {
      allTitles = await StorageManager.getTitles();
      allVisited = await StorageManager.getVisitedUrls();
    });

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      
      if (!query) {
        searchClearBtn.style.display = 'none';
        resultsCountLabel.style.display = 'none';
        renderEmptySearchState();
        return;
      }
      
      searchClearBtn.style.display = 'block';
      const queryLower = query.toLowerCase();

      // Setup exact Title hash lookups to support Visited + Seen matching checks
      const seenTitlesSet = new Set(allTitles.map(t => normalizeTitle(t)));
      
      const results = [];
      const addedKeys = new Set(); // deduplication tracker

      // 1. Evaluate Visited URLs records
      allVisited.forEach(v => {
        const matchesTitle = v.title.toLowerCase().includes(queryLower);
        const matchesUrl = v.url.toLowerCase().includes(queryLower);

        if (matchesTitle || matchesUrl) {
          const normTitle = normalizeTitle(v.title);
          const isSeen = seenTitlesSet.has(normTitle);
          const key = 'url_' + normalizeUrl(v.url);

          results.push({
            type: 'url',
            title: v.title || 'Untitled Visit',
            url: v.url,
            status: isSeen ? 'both' : 'visited',
            key: key
          });

          addedKeys.add(key);
          if (normTitle) {
            addedKeys.add('title_' + normTitle);
          }
        }
      });

      // 2. Evaluate Seen Titles records
      allTitles.forEach(t => {
        const normTitle = normalizeTitle(t);
        const key = 'title_' + normTitle;

        if (t.toLowerCase().includes(queryLower) && !addedKeys.has(key)) {
          results.push({
            type: 'title',
            title: t,
            url: '',
            status: 'seen',
            key: key
          });
          addedKeys.add(key);
        }
      });

      // Report matches count
      resultsCountLabel.style.display = 'block';
      resultsCountLabel.textContent = `Found ${results.length.toLocaleString()} match${results.length === 1 ? '' : 'es'}`;

      // Limit rendered grid elements to top 50 matches for performance preservation
      const displaySubset = results.slice(0, 50);
      renderSearchResults(displaySubset, query);
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      resultsCountLabel.style.display = 'none';
      renderEmptySearchState();
      searchInput.focus();
    });
  }

  function renderEmptySearchState() {
    searchResultsList.innerHTML = `
      <div class="search-empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <p>Search results will display matches in titles or URLs.</p>
      </div>
    `;
  }

  function renderSearchResults(items, query) {
    if (items.length === 0) {
      searchResultsList.innerHTML = `
        <div class="search-empty-state">
          <p style="color: var(--text-secondary)">No matching titles or URLs found.</p>
        </div>
      `;
      return;
    }

    const html = items.map(item => {
      const highlightedTitle = highlightMatch(item.title, query);
      const highlightedUrl = item.url ? highlightMatch(item.url, query) : '';
      
      let badgeHtml = '';
      if (item.status === 'both') {
        badgeHtml = `<span class="search-tag both">Visited \u2022 Seen</span>`;
      } else if (item.status === 'visited') {
        badgeHtml = `<span class="search-tag visited">Visited</span>`;
      } else {
        badgeHtml = `<span class="search-tag seen">Seen</span>`;
      }

      return `
        <div class="search-item">
          <div class="search-item-header">
            <span class="search-item-title">${highlightedTitle}</span>
            ${badgeHtml}
          </div>
          ${item.url ? `<span class="search-item-url">${highlightedUrl}</span>` : ''}
        </div>
      `;
    }).join('');

    searchResultsList.innerHTML = html;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return escapeHtml(text);

    const left = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const right = text.substring(index + query.length);

    return escapeHtml(left) + `<mark>${escapeHtml(match)}</mark>` + escapeHtml(right);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Configures dual CSV file upload listeners for both Titles and URLs.
   */
  /**
   * Animates a progress bar inside the popup UI to keep the user informed.
   * 
   * @param {'titles'|'urls'} type 
   * @param {number} percentage 
   * @param {string} statusText 
   */
  function updateImportProgress(type, percentage, statusText) {
    const container = document.getElementById(`import-progress-${type}`);
    const fill = document.getElementById(`progress-fill-${type}`);
    const status = document.getElementById(`progress-status-${type}`);
    const pct = document.getElementById(`progress-pct-${type}`);
    
    if (!container || !fill || !status || !pct) return;
    
    // Show container
    container.style.display = 'flex';
    
    // Apply width & texts
    fill.style.width = `${percentage}%`;
    status.textContent = statusText;
    pct.textContent = `${percentage}%`;
    
    // Auto hide after 2.5 seconds if complete
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
  function setupFileImports() {
    // Clear input values on click so same-file selections always trigger change events
    csvFileInput.addEventListener('click', () => {
      csvFileInput.value = '';
    });
    csvUrlFileInput.addEventListener('click', () => {
      csvUrlFileInput.value = '';
    });

    // 1. Titles CSV upload
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      
      if (!file) return;

      // Initial progress: Reading file
      updateImportProgress('titles', 15, 'Reading CSV file...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        try {
          updateImportProgress('titles', 45, 'Parsing CSV titles...');
          const parsedTitles = CSVImporter.parse(text);
          if (parsedTitles.length === 0) {
            updateImportProgress('titles', 100, 'Failed: No titles found');
            showToast('No valid article titles found in CSV.', 'error');
            return;
          }

          updateImportProgress('titles', 75, 'Storing titles in database...');
          const result = await StorageManager.saveTitles(parsedTitles);
          
          if (result.addedCount > 0) {
            updateImportProgress('titles', 100, `Done! Added ${result.addedCount.toLocaleString()} titles.`);
            showToast(`Added ${result.addedCount.toLocaleString()} new titles. (${result.skippedCount.toLocaleString()} duplicates skipped)`, 'success');
          } else {
            updateImportProgress('titles', 100, `Done! All titles already exist.`);
            showToast(`All ${result.skippedCount.toLocaleString()} titles already exist in the database!`, 'success');
          }
          
          updateDashboardStats();
          triggerActiveTabRescan();
        } catch (err) {
          console.error(err);
          updateImportProgress('titles', 100, 'Failed: Parsing error');
          showToast('Failed to parse Titles CSV file.', 'error');
        } finally {
          csvFileInput.value = ''; // Safe cleanup after reading is fully complete
        }
      };
      reader.onerror = () => {
        updateImportProgress('titles', 100, 'Failed: Read error');
        showToast('Error reading CSV file.', 'error');
        csvFileInput.value = ''; // Safe cleanup
      };
      reader.readAsText(file);
    });

    // 2. Visited URLs CSV upload
    csvUrlFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      
      if (!file) return;

      // Initial progress: Reading file
      updateImportProgress('urls', 15, 'Reading URL history CSV...');

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        try {
          updateImportProgress('urls', 45, 'Parsing history columns...');
          const parsedUrls = CSVImporter.parseUrlHistory(text);
          if (parsedUrls.length === 0) {
            updateImportProgress('urls', 100, 'Failed: No records found');
            showToast('No valid URLs history found in CSV.', 'error');
            return;
          }

          updateImportProgress('urls', 75, 'Merging records dynamically...');
          const result = await StorageManager.importVisitedUrls(parsedUrls);
          
          updateImportProgress('urls', 100, `Done! Merged ${result.addedCount.toLocaleString()} URLs.`);
          // Standard V2 metrics display as required: Imported: 500 Added: 120 Skipped: 380
          showToast(`Imported: ${result.importedCount.toLocaleString()} | Added: ${result.addedCount.toLocaleString()} | Skipped: ${result.skippedCount.toLocaleString()}`, 'success');

          updateDashboardStats();
          triggerActiveTabRescan();
        } catch (err) {
          console.error(err);
          updateImportProgress('urls', 100, 'Failed: Parsing error');
          showToast('Failed to parse Visited URLs CSV file.', 'error');
        } finally {
          csvUrlFileInput.value = ''; // Safe cleanup after reading is fully complete
        }
      };
      reader.onerror = () => {
        updateImportProgress('urls', 100, 'Failed: Read error');
        showToast('Error reading CSV file.', 'error');
        csvUrlFileInput.value = ''; // Safe cleanup
      };
      reader.readAsText(file);
    });
  }

  /**
   * Configures standard CSV downloads for both database profiles.
   */
  function setupExporters() {
    // 1. Export Titles
    btnExport.addEventListener('click', async () => {
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

        triggerDownload(csvRows.join('\r\n'), 'arc-history-export.csv');
        showToast('Exported Titles successfully!', 'success');
      } catch (err) {
        showToast('Export titles failed.', 'error');
      }
    });

    // 2. Export Visited URLs
    btnExportUrls.addEventListener('click', async () => {
      try {
        const urls = await StorageManager.getVisitedUrls();
        if (urls.length === 0) {
          showToast('URLs database is empty.', 'error');
          return;
        }

        const csvRows = ['url,title,visitedAt'];
        urls.forEach(item => {
          const escUrl = item.url.replace(/"/g, '""');
          const escTitle = item.title.replace(/"/g, '""');
          const escDate = item.visitedAt.replace(/"/g, '""');
          
          csvRows.push(`"${escUrl}","${escTitle}","${escDate}"`);
        });

        triggerDownload(csvRows.join('\r\n'), 'arc-url-history.csv');
        showToast('Exported URL history successfully!', 'success');
      } catch (err) {
        showToast('Export URL history failed.', 'error');
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

  /**
   * Configures absolute database wipe with confirmation overlay.
   */
  function setupClearDb() {
    btnClearDb.addEventListener('click', () => {
      confirmModal.classList.add('active');
    });

    modalBtnCancel.addEventListener('click', () => {
      confirmModal.classList.remove('active');
    });

    modalBtnConfirm.addEventListener('click', async () => {
      confirmModal.classList.remove('active');
      try {
        await StorageManager.clearDatabase();
        showToast('Entire database cleared successfully.', 'success');
        
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        resultsCountLabel.style.display = 'none';
        renderEmptySearchState();
        
        updateDashboardStats();
        triggerActiveTabRescan();
      } catch (err) {
        showToast('Wipe database failed.', 'error');
      }
    });

    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) {
        confirmModal.classList.remove('active');
      }
    });
  }

  /**
   * Configures the Hide Visited global toggles and URLs exception lists.
   */
  async function setupHidingExceptions() {
    if (!toggleHideVisited) return;

    // Load initial global toggle state
    const isEnabled = await StorageManager.getHideVisitedState();
    toggleHideVisited.checked = isEnabled;

    // Load and render exceptions list
    const list = await StorageManager.getUrlExceptions();
    renderExceptionsList(list);

    // Toggle switch listener
    toggleHideVisited.addEventListener('change', async () => {
      await StorageManager.setHideVisitedState(toggleHideVisited.checked);
      triggerActiveTabRescan();
      showToast(toggleHideVisited.checked ? 'Auto-hide enabled.' : 'Auto-hide disabled.');
    });

    // Exclude current page listener
    btnExcludeCurrent.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            const url = tabs[0].url || '';
            if (url.startsWith('http://') || url.startsWith('https://')) {
              // Check if already contains
              StorageManager.getUrlExceptions().then(async (list) => {
                const exists = list.some(item => item.trim().toLowerCase() === url.trim().toLowerCase());
                if (exists) {
                  showToast('Current page is already excluded!', 'error');
                  return;
                }
                const updated = await StorageManager.addUrlException(url);
                renderExceptionsList(updated);
                triggerActiveTabRescan();
                showToast('Current page excluded successfully!');
              });
            } else {
              showToast('Cannot exclude this system page.', 'error');
            }
          }
        });
      }
    });

    // Manual exception add listener
    btnAddException.addEventListener('click', async () => {
      const pattern = exceptionsInput.value.trim();
      if (!pattern) {
        showToast('Please enter a valid URL or path.', 'error');
        return;
      }

      const updated = await StorageManager.addUrlException(pattern);
      exceptionsInput.value = '';
      renderExceptionsList(updated);
      triggerActiveTabRescan();
      showToast('Exception added successfully!');
    });

    // Enter key listener
    exceptionsInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        btnAddException.click();
      }
    });
  }

  function renderExceptionsList(list) {
    if (!exceptionsList) return;
    if (list.length === 0) {
      exceptionsList.innerHTML = `<div style="padding: 6px 12px; font-size: 10px; color: var(--text-muted); text-align: center;">No exceptions added yet.</div>`;
      return;
    }

    exceptionsList.innerHTML = list.map(item => `
      <div class="exception-item">
        <span class="exception-item-text" title="${escapeHtml(item)}">${escapeHtml(item)}</span>
        <button class="exception-item-delete" data-pattern="${escapeHtml(item)}">&times;</button>
      </div>
    `).join('');

    // Bind delete events
    exceptionsList.querySelectorAll('.exception-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const pattern = e.target.getAttribute('data-pattern');
        const updated = await StorageManager.removeUrlException(pattern);
        renderExceptionsList(updated);
        triggerActiveTabRescan();
        showToast('Exception removed successfully.');
      });
    });
  }

  /**
   * Configures the Bulk Title Paste accordion toggle, text area inputs, and saving operations.
   */
  function setupBulkPaste() {
    if (!btnToggleBulkPaste || !bulkPasteContainer) return;

    // Toggle slide-open accordion
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

    // Clear textarea button
    btnClearBulkPaste.addEventListener('click', () => {
      bulkPasteTextarea.value = '';
      bulkPasteTextarea.focus();
    });

    // Import pasted titles button
    btnImportBulkPaste.addEventListener('click', async () => {
      const rawText = bulkPasteTextarea.value;
      
      // Split by newlines, trim, and filter empty rows / headers
      const parsedTitles = rawText
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0 && t.toLowerCase() !== 'title');

      if (parsedTitles.length === 0) {
        showToast('Please paste at least one valid article title.', 'error');
        return;
      }

      // Initial progress: Parsing input
      updateImportProgress('titles', 25, 'Parsing pasted titles...');

      try {
        updateImportProgress('titles', 65, 'Storing titles in database...');
        
        // Wait a brief moment to show smooth transition
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const result = await StorageManager.saveTitles(parsedTitles);
        
        if (result.addedCount > 0) {
          updateImportProgress('titles', 100, `Done! Added ${result.addedCount.toLocaleString()} titles.`);
          showToast(`Added ${result.addedCount.toLocaleString()} new titles. (${result.skippedCount.toLocaleString()} duplicates skipped)`, 'success');
          // Clear textarea and hide accordion on success
          bulkPasteTextarea.value = '';
          bulkPasteContainer.style.display = 'none';
          btnToggleBulkPaste.classList.remove('active');
        } else {
          updateImportProgress('titles', 100, `Done! All titles already exist.`);
          showToast(`All ${result.skippedCount.toLocaleString()} titles already exist in the database!`, 'success');
        }

        updateDashboardStats();
        triggerActiveTabRescan();
      } catch (err) {
        console.error(err);
        updateImportProgress('titles', 100, 'Failed: Storing error');
        showToast('Failed to save pasted titles.', 'error');
      }
    });
  }
});
