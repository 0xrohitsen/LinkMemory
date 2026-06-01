/**
 * LinkMemory V4 - Utility Functions
 */

/**
 * Normalizes an article title for exact matching.
 * Converts to lowercase, trims whitespace, and collapses multiple spaces.
 * 
 * @param {string} title 
 * @returns {string} Normalized title
 */
function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Formats a byte number into a human-readable size string.
 * 
 * @param {number} bytes 
 * @returns {string} Formatted size (e.g. "1.24 MB")
 */
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formats an ISO date string or timestamp into a premium localized date.
 * 
 * @param {string|number|Date} dateVal 
 * @returns {string} Formatted date (e.g., "May 30, 2026 at 10:56 AM" or "Never")
 */
function formatDate(dateVal) {
  if (!dateVal) return 'Never';
  
  try {
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return 'Never';
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return 'Never';
  }
}

/**
 * Strips common website name branding separators and suffixes from document titles.
 * E.g., "Universal History Syncing | Medium" becomes "Universal History Syncing"
 * 
 * @param {string} title 
 * @returns {string} Stripped clean title
 */
function cleanTitle(title) {
  if (!title || typeof title !== 'string') return '';
  let clean = title.trim();
  
  // Generic separators
  const separators = [' | ', ' - ', ' — '];
  
  for (const sep of separators) {
    const idx = clean.lastIndexOf(sep);
    // Only strip branding if it resides near the trailing end of the title (branding site names)
    if (idx > -1 && idx > clean.length - 35) {
      clean = clean.substring(0, idx).trim();
      break;
    }
  }
  
  return clean.trim();
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let clean = url.trim().toLowerCase();
  
  // Strip trailing slashes
  if (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  
  // Ignore hashes for link comparison
  const hashIdx = clean.indexOf('#');
  if (hashIdx > -1) {
    clean = clean.substring(0, hashIdx);
  }
  
  return clean;
}

// Export for ES modules or attach to global scope if loaded as a script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeTitle, formatBytes, formatDate, cleanTitle, normalizeUrl };
}
