/**
 * Utility functions for the ARC Content History Tracker
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
 * Normalizes a URL for exact matching.
 * Trims whitespace, converts to lowercase, strips trailing slashes, and ignores hashes.
 * 
 * @param {string} url 
 * @returns {string} Normalized URL
 */
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
 * Strips common website name separators and suffixes from document titles.
 * E.g., "Circle's Post-Quantum Security Roadmap... | Arc House" becomes
 * "Circle's Post-Quantum Security Roadmap..."
 * Evaluates trailing ends specifically to avoid truncating internal title dashes.
 * 
 * @param {string} title 
 * @returns {string} Stripped clean title
 */
function cleanTitle(title) {
  if (!title || typeof title !== 'string') return '';
  let clean = title.trim();
  
  // Specific brand-name suffixes near the trailing end of the document title
  const suffixes = [
    ' - video',
    ' - discussion',
    ' - blog',
    ' - post',
    ' | arc house',
    ' - arc house',
    ' — arc house'
  ];
  
  const cleanLower = clean.toLowerCase();
  for (const suffix of suffixes) {
    if (cleanLower.endsWith(suffix)) {
      clean = clean.substring(0, clean.length - suffix.length).trim();
      break; // Remove at most one standard trailing brand suffix
    }
  }
  
  // Fallback: strip generic pipe separators if they are near the end (branding)
  const pipeIdx = clean.lastIndexOf(' | ');
  if (pipeIdx > -1 && pipeIdx > clean.length - 28) {
    clean = clean.substring(0, pipeIdx).trim();
  }
  
  // Strip trailing spaces and secondary quotes if necessary
  return clean.trim();
}

// Export for ES modules or attach to global scope if loaded as a script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeTitle, normalizeUrl, formatBytes, formatDate, cleanTitle };
}


