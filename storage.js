/**
 * Database / Storage Layer using chrome.storage.local
 */

// Safe helper to resolve the URL normalizer dynamically in both extension runtime and Node test runner environments.
const getUrlNormalizer = () => {
  if (typeof normalizeUrl !== 'undefined') {
    return normalizeUrl;
  }
  if (typeof require !== 'undefined') {
    try {
      const utils = require('./utils.js');
      if (utils && utils.normalizeUrl) return utils.normalizeUrl;
    } catch (e) {}
  }
  // Comprehensive inline fallback matching exact utils.js normalization
  return (u => {
    if (!u) return '';
    let clean = u.trim().toLowerCase();
    
    // Strip trailing slashes
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    
    // Ignore hashes
    const hashIdx = clean.indexOf('#');
    if (hashIdx > -1) {
      clean = clean.substring(0, hashIdx);
    }
    
    return clean;
  });
};

const StorageManager = {
  /**
   * Fetches all imported raw article titles.
   * 
   * @returns {Promise<string[]>}
   */
  getTitles() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ titles: [] }, (result) => {
          resolve(result.titles || []);
        });
      } else {
        // Fallback for non-extension environment (testing)
        const titles = localStorage.getItem('arc_tracker_titles');
        resolve(titles ? JSON.parse(titles) : []);
      }
    });
  },

  /**
   * Saves a list of new titles, preventing duplicates, and updates metadata.
   * 
   * @param {string[]} newTitles 
   * @returns {Promise<{addedCount: number, totalCount: number, lastImportDate: string}>}
   */
  saveTitles(newTitles) {
    return new Promise(async (resolve) => {
      const existingTitles = await this.getTitles();
      
      // Store exact unique titles by comparing normalized variants or exact trim-matching
      const titleSet = new Set(existingTitles.map(t => t.trim()));
      let addedCount = 0;
      let skippedCount = 0;
      
      newTitles.forEach(title => {
        if (title && typeof title === 'string') {
          const trimmed = title.trim();
          if (trimmed) {
            if (!titleSet.has(trimmed)) {
              titleSet.add(trimmed);
              addedCount++;
            } else {
              skippedCount++;
            }
          }
        }
      });
      
      const updatedTitles = Array.from(titleSet);
      const lastImportDate = new Date().toISOString();
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          titles: updatedTitles,
          lastImportDate: lastImportDate
        }, () => {
          resolve({
            addedCount,
            skippedCount,
            totalCount: updatedTitles.length,
            lastImportDate
          });
        });
      } else {
        // Fallback for non-extension environment
        localStorage.setItem('arc_tracker_titles', JSON.stringify(updatedTitles));
        localStorage.setItem('arc_tracker_last_import', lastImportDate);
        resolve({
          addedCount,
          skippedCount,
          totalCount: updatedTitles.length,
          lastImportDate
        });
      }
    });
  },

  /**
   * Fetches all visited URL history objects.
   * 
   * @returns {Promise<Array<{url: string, title: string, visitedAt: string}>>}
   */
  getVisitedUrls() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ visitedUrls: [] }, (result) => {
          resolve(result.visitedUrls || []);
        });
      } else {
        const urls = localStorage.getItem('arc_tracker_visited_urls');
        resolve(urls ? JSON.parse(urls) : []);
      }
    });
  },

  /**
   * Automatically records a URL visit. If already exists, updates title & visited date.
   * 
   * @param {string} url 
   * @param {string} title 
   * @returns {Promise<Array<{url: string, title: string, visitedAt: string}>>}
   */
  saveVisitedUrl(url, title) {
    return new Promise(async (resolve) => {
      if (!url) {
        resolve([]);
        return;
      }
      
      const visitedUrls = await this.getVisitedUrls();
      const normFunc = getUrlNormalizer();
      const targetNorm = normFunc(url);
      const visitedAt = new Date().toISOString();
      
      const idx = visitedUrls.findIndex(item => normFunc(item.url) === targetNorm);
      
      if (idx > -1) {
        // Update details
        if (title) visitedUrls[idx].title = title.trim();
        visitedUrls[idx].visitedAt = visitedAt;
      } else {
        // Add new visit entry
        visitedUrls.push({
          url: url.trim(),
          title: (title || '').trim(),
          visitedAt: visitedAt
        });
      }
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ visitedUrls }, () => {
          resolve(visitedUrls);
        });
      } else {
        localStorage.setItem('arc_tracker_visited_urls', JSON.stringify(visitedUrls));
        resolve(visitedUrls);
      }
    });
  },

  /**
   * Merges imported URL history list into the database, skipping duplicates.
   * 
   * @param {Array<{url: string, title: string, visitedAt: string}>} importedList 
   * @returns {Promise<{importedCount: number, addedCount: number, skippedCount: number, totalCount: number}>}
   */
  importVisitedUrls(importedList) {
    return new Promise(async (resolve) => {
      const existingUrls = await this.getVisitedUrls();
      const normFunc = getUrlNormalizer();
      
      // Cache existing normalized URLs
      const existingNormSet = new Set(existingUrls.map(item => normFunc(item.url)));
      
      const importedCount = importedList.length;
      let addedCount = 0;
      let skippedCount = 0;
      
      importedList.forEach(item => {
        if (!item || !item.url) {
          skippedCount++;
          return;
        }
        
        const norm = normFunc(item.url);
        if (!existingNormSet.has(norm)) {
          existingUrls.push({
            url: item.url.trim(),
            title: (item.title || '').trim(),
            visitedAt: item.visitedAt || new Date().toISOString()
          });
          existingNormSet.add(norm);
          addedCount++;
        } else {
          skippedCount++;
        }
      });
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ visitedUrls: existingUrls }, () => {
          resolve({
            importedCount,
            addedCount,
            skippedCount,
            totalCount: existingUrls.length
          });
        });
      } else {
        localStorage.setItem('arc_tracker_visited_urls', JSON.stringify(existingUrls));
        resolve({
          importedCount,
          addedCount,
          skippedCount,
          totalCount: existingUrls.length
        });
      }
    });
  },

  /**
   * Clears all database titles and resets metadata.
   * 
   * @returns {Promise<void>}
   */
  clearDatabase() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          titles: [],
          visitedUrls: [],
          lastImportDate: null
        }, () => {
          resolve();
        });
      } else {
        // Fallback for non-extension environment
        localStorage.removeItem('arc_tracker_titles');
        localStorage.removeItem('arc_tracker_visited_urls');
        localStorage.removeItem('arc_tracker_last_import');
        resolve();
      }
    });
  },

  /**
   * Computes statistics for the dashboard.
   * 
   * @returns {Promise<{totalTitles: number, totalVisitedUrls: number, lastImportDate: string|null, storageBytes: number}>}
   */
  getStats() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ titles: [], visitedUrls: [], lastImportDate: null }, async (result) => {
          let bytesUsed = 0;
          
          if (chrome.storage.local.getBytesInUse) {
            bytesUsed = await new Promise((res) => {
              try {
                chrome.storage.local.getBytesInUse(null, (bytes) => {
                  res(bytes || 0);
                });
              } catch (e) {
                // Fallback size estimation if API error
                res(0);
              }
            });
          }
          
          // If bytesInUse returns 0 or fails, estimate size from serialized data
          if (bytesUsed === 0) {
            const dataString = JSON.stringify(result);
            bytesUsed = dataString.length * 2; // UTF-16 representation size
          }

          resolve({
            totalTitles: result.titles.length,
            totalVisitedUrls: result.visitedUrls.length,
            lastImportDate: result.lastImportDate,
            storageBytes: bytesUsed
          });
        });
      } else {
        // Fallback for non-extension environment
        const titles = JSON.parse(localStorage.getItem('arc_tracker_titles') || '[]');
        const visitedUrls = JSON.parse(localStorage.getItem('arc_tracker_visited_urls') || '[]');
        const lastImport = localStorage.getItem('arc_tracker_last_import');
        const estBytes = (JSON.stringify({ titles, visitedUrls, lastImport }).length) * 2;
        
        resolve({
          totalTitles: titles.length,
          totalVisitedUrls: visitedUrls.length,
          lastImportDate: lastImport,
          storageBytes: estBytes
        });
      }
    });
  },

  /**
   * Fetches whether auto-hide visited articles is globally enabled.
   * 
   * @returns {Promise<boolean>}
   */
  getHideVisitedState() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ hideVisitedEnabled: true }, (result) => {
          resolve(result.hideVisitedEnabled !== false);
        });
      } else {
        const state = localStorage.getItem('arc_tracker_hide_visited');
        resolve(state === null ? true : state === 'true');
      }
    });
  },

  /**
   * Saves the global hide visited toggle state.
   * 
   * @param {boolean} enabled 
   * @returns {Promise<void>}
   */
  setHideVisitedState(enabled) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ hideVisitedEnabled: enabled }, () => {
          resolve();
        });
      } else {
        localStorage.setItem('arc_tracker_hide_visited', String(enabled));
        resolve();
      }
    });
  },

  /**
   * Fetches the URL exceptions list patterns.
   * Default patterns:
   * 1. https://community.arc.io/home
   * 2. https://community.arc.io/home/contributors/my-contributions
   * 
   * @returns {Promise<string[]>}
   */
  getUrlExceptions() {
    return new Promise((resolve) => {
      const defaults = [
        "https://community.arc.io/home/contributors/my-contributions"
      ];
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ urlExceptions: defaults }, (result) => {
          resolve(result.urlExceptions || defaults);
        });
      } else {
        const listStr = localStorage.getItem('arc_tracker_url_exceptions');
        resolve(listStr ? JSON.parse(listStr) : defaults);
      }
    });
  },

  /**
   * Adds a specific URL pattern to the exclusion list.
   * 
   * @param {string} pattern 
   * @returns {Promise<string[]>} Upgraded list
   */
  addUrlException(pattern) {
    return new Promise(async (resolve) => {
      if (!pattern || typeof pattern !== 'string') {
        const current = await this.getUrlExceptions();
        resolve(current);
        return;
      }
      
      const list = await this.getUrlExceptions();
      const trimmed = pattern.trim();
      const normPattern = trimmed.toLowerCase();
      
      const exists = list.some(item => item.trim().toLowerCase() === normPattern);
      if (!exists) {
        list.push(trimmed);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ urlExceptions: list }, () => {
            resolve(list);
          });
        } else {
          localStorage.setItem('arc_tracker_url_exceptions', JSON.stringify(list));
          resolve(list);
        }
      } else {
        resolve(list);
      }
    });
  },

  /**
   * Removes a specific URL pattern from the exclusion list.
   * 
   * @param {string} pattern 
   * @returns {Promise<string[]>} Upgraded list
   */
  removeUrlException(pattern) {
    return new Promise(async (resolve) => {
      if (!pattern || typeof pattern !== 'string') {
        const current = await this.getUrlExceptions();
        resolve(current);
        return;
      }
      
      const list = await this.getUrlExceptions();
      const trimmed = pattern.trim().toLowerCase();
      
      const updated = list.filter(item => item.trim().toLowerCase() !== trimmed);
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ urlExceptions: updated }, () => {
          resolve(updated);
        });
      } else {
        localStorage.setItem('arc_tracker_url_exceptions', JSON.stringify(updated));
        resolve(updated);
      }
    });
  }
};

// Export for ES modules or attach to global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}

