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

// Export for ES modules or attach to global scope if loaded as a script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeTitle, formatBytes, formatDate };
}
