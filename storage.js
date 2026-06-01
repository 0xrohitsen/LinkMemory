/**
 * LinkMemory V4 - Local Storage Manager using chrome.storage.local
 */

const StorageManager = {
  /**
   * Fetches all imported raw article titles.
   * @returns {Promise<string[]>}
   */
  getTitles() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ titles: [] }, (result) => {
          resolve(result.titles || []);
        });
      } else {
        const titles = localStorage.getItem('linkmemory_titles');
        resolve(titles ? JSON.parse(titles) : []);
      }
    });
  },

  /**
   * Saves a list of new titles, preventing duplicates, and updates metadata.
   * @param {string[]} newTitles 
   * @returns {Promise<{addedCount: number, skippedCount: number, totalCount: number, lastImportDate: string}>}
   */
  saveTitles(newTitles) {
    return new Promise(async (resolve) => {
      const existingTitles = await this.getTitles();
      
      // Safe inline normalizer matching utils.js exactly
      const normTitle = (t) => {
        if (!t || typeof t !== 'string') return '';
        return t.toLowerCase().trim().replace(/\s+/g, ' ');
      };

      const existingNormSet = new Set(existingTitles.map(t => normTitle(t)));
      const uniqueNewTitles = [];
      let addedCount = 0;
      let skippedCount = 0;
      
      newTitles.forEach(title => {
        if (title && typeof title === 'string') {
          const trimmed = title.trim();
          const norm = normTitle(trimmed);
          if (norm) {
            if (!existingNormSet.has(norm)) {
              existingNormSet.add(norm);
              uniqueNewTitles.push(trimmed);
              addedCount++;
            } else {
              skippedCount++;
            }
          }
        }
      });
      
      const updatedTitles = existingTitles.concat(uniqueNewTitles);
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
        localStorage.setItem('linkmemory_titles', JSON.stringify(updatedTitles));
        localStorage.setItem('linkmemory_last_import', lastImportDate);
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
   * Clears the titles database and resets the last import date.
   * @returns {Promise<void>}
   */
  clearDatabase() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          titles: [],
          lastImportDate: null
        }, () => {
          resolve();
        });
      } else {
        localStorage.removeItem('linkmemory_titles');
        localStorage.removeItem('linkmemory_last_import');
        resolve();
      }
    });
  },

  /**
   * Computes statistics for the dashboard.
   * @returns {Promise<{totalTitles: number, lastImportDate: string|null, storageBytes: number}>}
   */
  getStats() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ titles: [], lastImportDate: null }, async (result) => {
          let bytesUsed = 0;
          if (chrome.storage.local.getBytesInUse) {
            bytesUsed = await new Promise((res) => {
              try {
                chrome.storage.local.getBytesInUse(null, (bytes) => {
                  res(bytes || 0);
                });
              } catch (e) {
                res(0);
              }
            });
          }
          if (bytesUsed === 0) {
            bytesUsed = JSON.stringify(result).length * 2;
          }
          resolve({
            totalTitles: result.titles.length,
            lastImportDate: result.lastImportDate,
            storageBytes: bytesUsed
          });
        });
      } else {
        const titles = JSON.parse(localStorage.getItem('linkmemory_titles') || '[]');
        const lastImport = localStorage.getItem('linkmemory_last_import');
        const estBytes = JSON.stringify({ titles, visitedUrls: [], lastImport }).length * 2;
        resolve({
          totalTitles: titles.length,
          lastImportDate: lastImport,
          storageBytes: estBytes
        });
      }
    });
  },

  /**
   * Fetches general extension configuration.
   * @returns {Promise<{enabled: boolean, scope: 'all'|'selected', selectedDomains: string[]}>}
   */
  getSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ enabled: true, scope: 'all', selectedDomains: [] }, (result) => {
          resolve({
            enabled: result.enabled !== false,
            scope: result.scope || 'all',
            selectedDomains: result.selectedDomains || []
          });
        });
      } else {
        const enabled = localStorage.getItem('linkmemory_enabled');
        const scope = localStorage.getItem('linkmemory_scope');
        const selectedDomains = localStorage.getItem('linkmemory_selected_domains');
        resolve({
          enabled: enabled === null ? true : enabled === 'true',
          scope: scope || 'all',
          selectedDomains: selectedDomains ? JSON.parse(selectedDomains) : []
        });
      }
    });
  },

  /**
   * Saves general extension configuration settings.
   * @param {{enabled: boolean, scope: 'all'|'selected', selectedDomains: string[]}} config 
   * @returns {Promise<void>}
   */
  setSettings(config) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          enabled: config.enabled,
          scope: config.scope,
          selectedDomains: config.selectedDomains
        }, () => {
          resolve();
        });
      } else {
        localStorage.setItem('linkmemory_enabled', String(config.enabled));
        localStorage.setItem('linkmemory_scope', config.scope);
        localStorage.setItem('linkmemory_selected_domains', JSON.stringify(config.selectedDomains));
        resolve();
      }
    });
  },

  /**
   * Adds a domain to the whitelisted domain scope list.
   * @param {string} domain 
   * @returns {Promise<string[]>} Updated domains list
   */
  addDomain(domain) {
    return new Promise(async (resolve) => {
      if (!domain || typeof domain !== 'string') {
        const settings = await this.getSettings();
        resolve(settings.selectedDomains);
        return;
      }
      const settings = await this.getSettings();
      const trimmed = domain.trim().toLowerCase();
      if (trimmed && !settings.selectedDomains.includes(trimmed)) {
        settings.selectedDomains.push(trimmed);
        await this.setSettings(settings);
      }
      resolve(settings.selectedDomains);
    });
  },

  /**
   * Removes a domain from the whitelisted domain scope list.
   * @param {string} domain 
   * @returns {Promise<string[]>} Updated domains list
   */
  removeDomain(domain) {
    return new Promise(async (resolve) => {
      if (!domain || typeof domain !== 'string') {
        const settings = await this.getSettings();
        resolve(settings.selectedDomains);
        return;
      }
      const settings = await this.getSettings();
      const trimmed = domain.trim().toLowerCase();
      settings.selectedDomains = settings.selectedDomains.filter(d => d !== trimmed);
      await this.setSettings(settings);
      resolve(settings.selectedDomains);
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
