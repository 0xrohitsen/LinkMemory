/**
 * Premium Custom CSV Parser for ARC Content History
 * Extracts article titles reliably even when quotes, nested commas, and multiple columns are present.
 */

const CSVImporter = {
  /**
   * Helper to parse raw rows from CSV into structured arrays.
   * 
   * @param {string} csvText
   * @returns {string[][]} Grid of cells
   */
  _parseRawRows(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];

    const rows = [];
    let currentRow = [''];
    let inQuotes = false;

    // Stream-parse CSV characters
    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes) {
          if (nextChar === '"') {
            // Escaped double-quote inside a quoted cell
            currentRow[currentRow.length - 1] += '"';
            i++; // Skip the next quote character
          } else {
            // Close the quote container state
            inQuotes = false;
          }
        } else {
          // Double-quote ONLY acts as a quoting wrapper if it starts the cell!
          if (currentRow[currentRow.length - 1] === '') {
            inQuotes = true;
          } else {
            // Treat as a literal quote character inside the cell (e.g. Circle's "Post-Quantum")
            currentRow[currentRow.length - 1] += '"';
          }
        }
      } else if (char === ',' && !inQuotes) {
        // Hit comma: finalize cell, start next one
        currentRow.push('');
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        // Hit newline: finalize row
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip Windows standard secondary carriage character
        }
        rows.push(currentRow);
        currentRow = [''];
      } else {
        // Normal characters add directly to current cell content
        currentRow[currentRow.length - 1] += char;
      }
    }

    // Capture trailing row if present and not completely blank
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }

    // Filter out completely empty rows
    return rows.filter(row => row.some(cell => cell.trim().length > 0));
  },

  /**
   * Parses CSV string contents and returns a clean array of raw article titles.
   * 
   * @param {string} csvText The raw CSV file content.
   * @returns {string[]} An array of non-empty article titles.
   */
  parse(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];

    // Strip UTF-8 BOM if present at the very beginning (common in Excel exports)
    let cleanText = csvText;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.substring(1);
    }

    const cleanRows = this._parseRawRows(cleanText);
    if (cleanRows.length === 0) return [];

    // Analyze first row for headers
    const firstRow = cleanRows[0];
    const headers = firstRow.map(h => h.trim().toLowerCase());
    
    // Find index of standard title headers
    let titleColIndex = headers.indexOf('title');
    
    // Fallback: look for headers containing keywords
    if (titleColIndex === -1) {
      titleColIndex = headers.findIndex(h => 
        h.includes('title') || 
        h.includes('name') || 
        h.includes('article') || 
        h.includes('heading') ||
        h.includes('subject')
      );
    }

    // Secondary fallback: default to first column
    if (titleColIndex === -1) {
      titleColIndex = 0;
    }

    const titles = [];
    const hasHeader = headers.some(h => 
      ['title', 'name', 'article', 'heading', 'subject', 'url', 'id', 'date', 'points'].includes(h)
    );

    // Start index: skip first row only if we identified standard headers
    const startIndex = hasHeader ? 1 : 0;

    for (let r = startIndex; r < cleanRows.length; r++) {
      const row = cleanRows[r];
      if (row.length > titleColIndex) {
        const value = row[titleColIndex].trim();
        if (value) {
          titles.push(value);
        }
      }
    }

    // If starting with header, but absolutely no titles extracted, double check raw first-row fallback
    if (titles.length === 0 && cleanRows.length > 0) {
      for (let r = 0; r < cleanRows.length; r++) {
        const row = cleanRows[r];
        if (row.length > titleColIndex) {
          const value = row[titleColIndex].trim();
          if (value) titles.push(value);
        }
      }
    }

    return titles;
  },

  /**
   * Parses CSV string contents and extracts visited URL objects (url, title, visitedAt).
   * 
   * @param {string} csvText 
   * @returns {Array<{url: string, title: string, visitedAt: string}>}
   */
  parseUrlHistory(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];

    // Strip UTF-8 BOM if present at the very beginning (common in Excel exports)
    let cleanText = csvText;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.substring(1);
    }

    const cleanRows = this._parseRawRows(cleanText);
    if (cleanRows.length === 0) return [];

    // Analyze first row for headers
    const firstRow = cleanRows[0];
    const headers = firstRow.map(h => h.trim().toLowerCase());

    // Locate column indices
    let urlIdx = headers.indexOf('url');
    let titleIdx = headers.indexOf('title');
    let dateIdx = headers.indexOf('visitedat');

    // Headers search substring checks
    if (urlIdx === -1) urlIdx = headers.findIndex(h => h.includes('url') || h.includes('link') || h.includes('href'));
    if (titleIdx === -1) titleIdx = headers.findIndex(h => h.includes('title') || h.includes('name') || h.includes('heading') || h.includes('subject'));
    if (dateIdx === -1) dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time') || h.includes('visited') || h.includes('at'));

    // Absolute fallback positions
    if (urlIdx === -1) urlIdx = 0;
    if (titleIdx === -1) titleIdx = 1;
    if (dateIdx === -1) dateIdx = 2;

    const hasHeader = headers.some(h => 
      ['title', 'name', 'article', 'url', 'visitedat', 'date', 'points', 'link'].includes(h)
    );

    const startIndex = hasHeader ? 1 : 0;
    const visitedList = [];

    for (let r = startIndex; r < cleanRows.length; r++) {
      const row = cleanRows[r];
      const urlVal = row.length > urlIdx ? row[urlIdx].trim() : '';
      const titleVal = row.length > titleIdx ? row[titleIdx].trim() : '';
      const dateVal = row.length > dateIdx ? row[dateIdx].trim() : '';

      if (urlVal) {
        visitedList.push({
          url: urlVal,
          title: titleVal || '',
          visitedAt: dateVal || new Date().toISOString()
        });
      }
    }

    return visitedList;
  }
};

// Export for module/testing usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSVImporter;
}

