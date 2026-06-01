/**
 * Service Worker (background.js)
 * Manages extension initialization and background messaging.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('LinkMemory V4 installed successfully!');
    
    // Initialize default storage schema if empty
    chrome.storage.local.get({
      titles: [],
      enabled: true,
      scope: 'all',
      selectedDomains: [],
      lastImportDate: null
    }, (result) => {
      chrome.storage.local.set({
        titles: result.titles || [],
        enabled: result.enabled !== false,
        scope: result.scope || 'all',
        selectedDomains: result.selectedDomains || [],
        lastImportDate: result.lastImportDate || null
      });
    });
  } else if (details.reason === 'update') {
    console.log('LinkMemory updated to version: ' + chrome.runtime.getManifest().version);
  }
});
