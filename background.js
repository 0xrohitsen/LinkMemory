/**
 * Service Worker (background.js)
 * Manages extension initialization and background messaging.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('ARC Content History Tracker installed successfully!');
    
    // Initialize default storage schema if empty
    chrome.storage.local.get({ titles: [], lastImportDate: null }, (result) => {
      if (!result.titles) {
        chrome.storage.local.set({ titles: [], lastImportDate: null });
      }
    });
  } else if (details.reason === 'update') {
    console.log('ARC Content History Tracker updated to version: ' + chrome.runtime.getManifest().version);
  }
});
