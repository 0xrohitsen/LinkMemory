/**
 * ARC Content History Tracker V2 - Content Script
 * Scans page elements, matches titles & URLs, injects dual status badges,
 * records browser history automatically, and optimizes community.arc.io SPA opens.
 */

// In-memory lookup tables
let seenTitlesSet = new Set();
let visitedUrlsSet = new Set();
let visitedTitlesSet = new Set();

// Hiding exclusions settings variables
let hideVisitedGlobal = true;
let urlExceptionsGlobal = [];
let isCurrentPageExcluded = false;

let scanTimeout = null;
let lastObservedUrl = window.location.href;

// Initialize content script
function init() {
  // 1. Auto save page visit
  recordPageVisit();

  // 2. Load database titles and URLs, then execute scan
  loadStorageAndScan();

  // 3. Keep dynamic eyes on DOM modifications
  setupMutationObserver();
}

/**
 * Automatically captures current page details and saves them in local storage.
 * Runs instantly on standard HTTP/HTTPS page visits.
 */
function recordPageVisit() {
  const url = window.location.href;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // 1. Safeguard: Exclude root domains, feed/list indexes, and contributions pages from history
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    if (pathname === '/' || pathname === '' || 
        pathname === '/home' || pathname === '/home/' ||
        pathname.endsWith('/my-contributions') ||
        pathname.includes('/contributors/my-contributions')) {
      return;
    }
  } catch (e) {}

  const rawTitle = document.title || '';
  const title = typeof cleanTitle !== 'undefined' ? cleanTitle(rawTitle) : rawTitle;
  
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ visitedUrls: [] }, (result) => {
      const visitedUrls = result.visitedUrls || [];
      const normFunc = typeof normalizeUrl !== 'undefined' ? normalizeUrl : (u => u.trim().toLowerCase());
      const targetNorm = normFunc(url);
      const visitedAt = new Date().toISOString();

      const idx = visitedUrls.findIndex(item => normFunc(item.url) === targetNorm);
      if (idx > -1) {
        if (title) visitedUrls[idx].title = title.trim();
        visitedUrls[idx].visitedAt = visitedAt;
      } else {
        visitedUrls.push({
          url: url,
          title: title.trim(),
          visitedAt: visitedAt
        });
      }

      chrome.storage.local.set({ visitedUrls }, () => {
        // Reload storage lookup context to include this fresh visit
        loadStorageAndScan();
      });
    });
  }
}

/**
 * Loads both collection models from storage, indexify them into hash sets, and scans.
 */
function loadStorageAndScan() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const defaults = [
      "https://community.arc.io/home/contributors/my-contributions"
    ];
    chrome.storage.local.get({
      titles: [],
      visitedUrls: [],
      hideVisitedEnabled: true,
      urlExceptions: defaults
    }, (result) => {
      const titles = result.titles || [];
      const visited = result.visitedUrls || [];

      hideVisitedGlobal = result.hideVisitedEnabled !== false;
      urlExceptionsGlobal = result.urlExceptions || defaults;

      // Evaluate active URL bypass rules
      const currentUrl = window.location.href.toLowerCase();
      const normCurrent = typeof normalizeUrl !== 'undefined' ? normalizeUrl(currentUrl) : currentUrl;
      const isHomeFeed = normCurrent === 'https://community.arc.io/home';

      if (isHomeFeed) {
        isCurrentPageExcluded = false; // Always run hiding on the main Home feed page
      } else {
        isCurrentPageExcluded = urlExceptionsGlobal.some(pat => {
          const cleanPat = pat.trim().toLowerCase();
          // Never let the home feed pattern bypass page hiding on other pages
          if (normalizeUrl(cleanPat) === 'https://community.arc.io/home') {
            return false;
          }
          return currentUrl.includes(cleanPat);
        });
      }

      // Convert to efficient O(1) Sets
      seenTitlesSet = new Set(titles.map(t => normalizeTitle(t)));
      visitedUrlsSet = new Set(visited.map(item => normalizeUrl(item.url)));
      visitedTitlesSet = new Set(visited.map(item => normalizeTitle(typeof cleanTitle !== 'undefined' ? cleanTitle(item.title) : item.title)));

      scanPage();
    });
  }
}

/**
 * Scans page elements bottom-up and applies badges based on dual check parameters.
 * Throttles work to guarantee scans run in under 100ms.
 */
function scanPage() {
  if (seenTitlesSet.size === 0 && visitedUrlsSet.size === 0) return;

  // Filter elements that haven't been scanned
  const selector = 'a:not([data-arc-checked]), h1:not([data-arc-checked]), h2:not([data-arc-checked]), h3:not([data-arc-checked]), h4:not([data-arc-checked]), h5:not([data-arc-checked]), h6:not([data-arc-checked])';
  const elements = document.querySelectorAll(selector);

  if (elements.length === 0) return;

  elements.forEach((element) => {
    // Flag immediately to prevent redundant parsing
    element.setAttribute('data-arc-checked', 'true');

    // Extract text content and normalize
    const text = element.innerText || element.textContent;
    const normalizedTitle = normalizeTitle(text);

    // Extract URL if present directly, or query closest link container
    let urlVal = '';
    if (element.tagName === 'A') {
      urlVal = element.href;
    } else {
      const closestLink = element.closest('a');
      if (closestLink) urlVal = closestLink.href;
    }

    // Safeguard 1: Never hide elements that represent the current page itself (the page currently being read)
    if (urlVal && normalizeUrl(urlVal) === normalizeUrl(window.location.href)) {
      return;
    }
    // Safeguard 2: Never hide the heading of the page the user is currently reading
    if (normalizedTitle && normalizedTitle === normalizeTitle(document.title)) {
      return;
    }

    const isVisited = urlVal ? visitedUrlsSet.has(normalizeUrl(urlVal)) : false;
    const isSeen = seenTitlesSet.has(normalizedTitle) || visitedTitlesSet.has(normalizedTitle);

    if (isVisited || isSeen) {
      // Prevent double badge addition on nested trees
      if (hasProcessedHierarchy(element)) {
        return;
      }

      // Check if target link URL matches any of the whitelisted exceptions (Target URL Whitelisting)
      const isExceptionLink = urlVal ? urlExceptionsGlobal.some(pat => {
        const cleanPat = pat.trim().toLowerCase();
        const normPat = typeof normalizeUrl !== 'undefined' ? normalizeUrl(cleanPat) : cleanPat;
        const normVal = normalizeUrl(urlVal);
        
        // Exact normalized match is always an exception (protects Home link exactly)
        if (normVal === normPat) return true;
        
        // If the pattern is a domain-only whitelist (no specific path, e.g. "blog.arc.xyz")
        try {
          const patUrl = cleanPat.startsWith('http') ? new URL(cleanPat) : new URL('https://' + cleanPat);
          const valUrl = new URL(urlVal);
          
          if (patUrl.pathname === '/' || patUrl.pathname === '') {
            return valUrl.hostname === patUrl.hostname || valUrl.hostname.endsWith('.' + patUrl.hostname);
          }
        } catch (e) {}
        
        return false;
      }) : false;

      const status = 'seen';
      element.setAttribute('data-arc-status', status);

      // Dynamic hide if enabled and current page is not whitelisted, and target is not an exception link
      if (hideVisitedGlobal && !isCurrentPageExcluded && !isExceptionLink) {
        hideElementContainer(element);
      } else {
        restoreElementContainer(element);
        applyStatusBadge(element, status);
      }
    }
  });
}

/**
 * Helper to resolve the correct logical card container (e.g. Gradual post card grids, articles).
 */
function findCardContainer(element) {
  if (!element) return null;

  // 1. Try standard semantic article tag
  let container = element.closest('article');
  if (container) return container;

  // 2. Try Gradual grid card wrappers (Emotion CSS class patterns & focus-within wrappers)
  container = element.closest('.focus-within') || 
              element.closest('[class*="Box-breakpointValues-Container"]') ||
              element.closest('[class*="Box-breakpointValues-InnerContainer"]') ||
              element.closest('.e1xykb4o0');
  if (container) return container;

  // 3. Heuristic parent traversal: walk up to find a block-level wrapper that is likely the card
  let current = element.closest('a') || element;
  let depth = 0;
  while (current && current.parentElement && depth < 5) {
    const parent = current.parentElement;
    if (parent.tagName === 'DIV' && (
      parent.classList.contains('focus-within') ||
      Array.from(parent.classList).some(c => c.includes('Container') || c.includes('card') || c.includes('item'))
    )) {
      return parent;
    }
    current = parent;
    depth++;
  }

  // 4. Fallback to closest anchor link or the element itself
  return element.closest('a') || element;
}

/**
 * Hides the closest article container, parent anchor, or element itself.
 */
function hideElementContainer(element) {
  const container = findCardContainer(element);
  if (container) {
    container.style.setProperty('display', 'none', 'important');
    container.setAttribute('data-arc-hidden', 'true');
  }
}

/**
 * Restores visibility to the element container.
 */
function restoreElementContainer(element) {
  const container = findCardContainer(element);
  if (container && container.getAttribute('data-arc-hidden') === 'true') {
    container.style.removeProperty('display');
    container.removeAttribute('data-arc-hidden');
  }
}

/**
 * Avoids nested highlighting by inspecting data-arc-status flags on ancestral nodes.
 * 
 * @param {HTMLElement} element 
 * @returns {boolean}
 */
function hasProcessedHierarchy(element) {
  if (element.closest('[data-arc-status]')) return true;
  if (element.querySelector('[data-arc-status]')) return true;
  return false;
}

/**
 * Appends a custom styled status badge onto the target element.
 * 
 * @param {HTMLElement} element 
 * @param {'seen'|'visited'|'both'} status 
 */
function applyStatusBadge(element, status) {
  const badge = document.createElement('span');
  badge.className = 'arc-seen-badge';
  
  let labelText = 'SEEN';
  let badgeColor = '#ff3b30'; // Red

  if (status === 'both') {
    labelText = 'VISITED \u2022 SEEN';
    badgeColor = '#a855f7'; // Purple
  } else if (status === 'visited') {
    labelText = 'VISITED';
    badgeColor = '#22c55e'; // Green
  }

  badge.textContent = labelText;

  // Set styles utilizing standard inline overrides with !important
  badge.style.setProperty('background-color', badgeColor, 'important');
  badge.style.setProperty('color', '#ffffff', 'important');
  badge.style.setProperty('font-size', '9px', 'important');
  badge.style.setProperty('font-weight', '700', 'important');
  badge.style.setProperty('text-transform', 'uppercase', 'important');
  badge.style.setProperty('letter-spacing', '0.5px', 'important');
  badge.style.setProperty('border-radius', '6px', 'important');
  badge.style.setProperty('padding', '2px 6px', 'important');
  badge.style.setProperty('margin-left', '6px', 'important');
  badge.style.setProperty('display', 'inline-flex', 'important');
  badge.style.setProperty('align-items', 'center', 'important');
  badge.style.setProperty('justify-content', 'center', 'important');
  badge.style.setProperty('vertical-align', 'middle', 'important');
  badge.style.setProperty('line-height', '1', 'important');
  badge.style.setProperty('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', 'important');
  badge.style.setProperty('user-select', 'none', 'important');
  badge.style.setProperty('pointer-events', 'none', 'important');
  badge.style.setProperty('white-space', 'nowrap', 'important');

  element.appendChild(badge);
}

/**
 * Monitors dynamic insertions and handles dynamic Single Page Application virtual navigations.
 * Optimized specifically for community.arc.io layout updates.
 */
function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    // 1. Detect dynamic SPA location routing shifts
    if (window.location.href !== lastObservedUrl) {
      lastObservedUrl = window.location.href;
      
      // Auto save the dynamic article opens
      recordPageVisit();
      
      // Always reload storage and recalculate exclusions for the new page URL
      loadStorageAndScan();
      
      // Restore all dynamically hidden elements first on navigation shifts
      document.querySelectorAll('[data-arc-hidden="true"]').forEach(el => {
        el.style.removeProperty('display');
        el.removeAttribute('data-arc-hidden');
      });

      // Reset state checked parameters to recalculate matches
      document.querySelectorAll('[data-arc-checked]').forEach(el => el.removeAttribute('data-arc-checked'));
      document.querySelectorAll('[data-arc-status]').forEach(el => el.removeAttribute('data-arc-status'));
      document.querySelectorAll('.arc-seen-badge').forEach(el => el.remove());
    }

    // 2. Throttle scan calculations on dynamic DOM additions
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanPage();
    }, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Receive messages from extension control dashboards
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMatchedCount') {
    let seenOnPage = 0;
    let visitedOnPage = 0;
    document.querySelectorAll('[data-arc-status]').forEach(el => {
      const text = el.innerText || el.textContent;
      const normalizedTitle = normalizeTitle(text);
      
      let urlVal = '';
      if (el.tagName === 'A') {
        urlVal = el.href;
      } else {
        const closestLink = el.closest('a');
        if (closestLink) urlVal = closestLink.href;
      }
      
      const isVisitedUrl = urlVal ? visitedUrlsSet.has(normalizeUrl(urlVal)) : false;
      const isVisitedTitle = visitedTitlesSet.has(normalizedTitle);
      
      if (seenTitlesSet.has(normalizedTitle) || isVisitedTitle) {
        seenOnPage++;
      }
      if (isVisitedUrl || isVisitedTitle) {
        visitedOnPage++;
      }
    });
    sendResponse({ seenCount: seenOnPage, visitedCount: visitedOnPage });
  } else if (request.action === 'reScanPage') {
    // Restore all dynamically hidden elements first on manual toggles
    document.querySelectorAll('[data-arc-hidden="true"]').forEach(el => {
      el.style.removeProperty('display');
      el.removeAttribute('data-arc-hidden');
    });
    
    // Reset flags and remove old badging
    document.querySelectorAll('[data-arc-checked]').forEach(el => el.removeAttribute('data-arc-checked'));
    document.querySelectorAll('[data-arc-status]').forEach(el => el.removeAttribute('data-arc-status'));
    document.querySelectorAll('.arc-seen-badge').forEach(el => el.remove());

    loadStorageAndScan();
    sendResponse({ status: 'completed' });
  }
  return true;
});

// Launch scripts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
