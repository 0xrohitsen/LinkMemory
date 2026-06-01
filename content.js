/**
 * LinkMemory V4 - Content Script
 * Scans page elements, matches titles in real-time, and injects clean Red SEEN badges.
 * Highly optimized with Set lookups and throttled MutationObservers for zero scroll/page lag.
 */

// In-memory lookup state
let seenTitlesSet = new Set();
let visitedUrlsSet = new Set();
let isEnabled = true;
let siteScope = 'all';
let whitelistedDomains = [];

let scanTimeout = null;
let lastObservedUrl = window.location.href;

/**
 * Checks if a host name is matched in the whitelisted domain exceptions.
 * Supports direct domain matches and subdomains.
 */
function isDomainMatched(currentHost, domainsList) {
  if (!currentHost || !domainsList || domainsList.length === 0) return false;
  const host = currentHost.toLowerCase().trim();
  
  return domainsList.some(domain => {
    const cleanDom = domain.trim().toLowerCase();
    if (!cleanDom) return false;
    return host === cleanDom || host.endsWith('.' + cleanDom);
  });
}

/**
 * Automatically captures current page title, cleans it of generic brand suffixes,
 * and saves it into local titles storage as seen history.
 */
function recordPageVisit() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  
  chrome.storage.local.get({
    enabled: true,
    scope: 'all',
    selectedDomains: []
  }, (result) => {
    const isEnabled = result.enabled !== false;
    const siteScope = result.scope || 'all';
    const whitelistedDomains = result.selectedDomains || [];

    if (!isEnabled) return;

    // Check scope whitelist
    const currentHost = window.location.hostname;
    if (siteScope === 'selected') {
      if (!isDomainMatched(currentHost, whitelistedDomains)) return;
    }

    const currentUrl = window.location.href;
    if (!currentUrl || !currentUrl.startsWith('http')) return;

    // Capture and clean document title
    const rawTitle = document.title || '';
    const clean = typeof cleanTitle === 'function' ? cleanTitle(rawTitle) : rawTitle.trim();

    // Direct save via storage helper
    if (typeof StorageManager !== 'undefined' && StorageManager.savePageVisit) {
      StorageManager.savePageVisit(currentUrl, clean).then(() => {
        // Reload settings and re-scan page elements to apply badges instantly
        loadSettingsAndScan();
      });
    }
  });
}

/**
 * Main initializer
 */
function init() {
  recordPageVisit();
  loadSettingsAndScan();
  setupMutationObserver();
}

/**
 * Loads storage configurations and executes title scanning if in scope.
 */
function loadSettingsAndScan() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({
      titles: [],
      visitedUrls: [],
      enabled: true,
      scope: 'all',
      selectedDomains: []
    }, (result) => {
      isEnabled = result.enabled !== false;
      siteScope = result.scope || 'all';
      whitelistedDomains = result.selectedDomains || [];
      const titles = result.titles || [];
      const visited = result.visitedUrls || [];

      // 1. If disabled, clean up any existing badges and stop
      if (!isEnabled) {
        cleanupBadging();
        return;
      }

      // 2. Evaluate active website scope whitelist
      const currentHost = window.location.hostname;
      if (siteScope === 'selected') {
        const isWhitelisted = isDomainMatched(currentHost, whitelistedDomains);
        if (!isWhitelisted) {
          cleanupBadging();
          return;
        }
      }

      // 3. Convert to efficient O(1) Sets
      seenTitlesSet = new Set(titles.map(t => normalizeTitle(t)));
      visitedUrlsSet = new Set(visited.map(u => normalizeUrl(u)));

      // 4. Perform elements scanning
      scanPage();
    });
  }
}

/**
 * Scans DOM headers and anchors for matching titles, injecting badges.
 */
function scanPage() {
  if (!isEnabled || (seenTitlesSet.size === 0 && visitedUrlsSet.size === 0)) return;

  // Evaluate if current site fits whitelist scope
  if (siteScope === 'selected') {
    const currentHost = window.location.hostname;
    if (!isDomainMatched(currentHost, whitelistedDomains)) return;
  }

  // Retrieve unscanned headers, anchor, span, p, and div elements
  const selector = 'a:not([data-linkmemory-checked]), h1:not([data-linkmemory-checked]), h2:not([data-linkmemory-checked]), h3:not([data-linkmemory-checked]), h4:not([data-linkmemory-checked]), h5:not([data-linkmemory-checked]), h6:not([data-linkmemory-checked]), span:not([data-linkmemory-checked]), p:not([data-linkmemory-checked]), div:not([data-linkmemory-checked])';
  const elements = document.querySelectorAll(selector);

  if (elements.length === 0) return;

  elements.forEach((element) => {
    // Prevent repetitive scans
    element.setAttribute('data-linkmemory-checked', 'true');

    // Extract text content and normalize
    const text = (element.innerText || element.textContent || '').trim();
    
    // Fast O(1) bounds check to skip layout containers or tiny words
    if (text.length < 8 || text.length > 180) return;
    
    const normalizedTitle = normalizeTitle(text);

    // Safeguard: Never mark the heading representing the current document itself
    if (normalizedTitle && normalizedTitle === normalizeTitle(document.title)) {
      return;
    }

    // Extract URL link details if parent anchor exists
    let urlVal = '';
    if (element.tagName === 'A') {
      urlVal = element.href;
    } else {
      const closestLink = element.closest('a');
      if (closestLink) urlVal = closestLink.href;
    }

    const normUrl = urlVal ? normalizeUrl(urlVal) : '';
    const isVisitedUrl = normUrl ? visitedUrlsSet.has(normUrl) : false;
    const isSeenTitle = normalizedTitle ? seenTitlesSet.has(normalizedTitle) : false;

    if (isSeenTitle || isVisitedUrl) {
      // Prevent redundant badges on nested trees
      if (element.closest('[data-linkmemory-status]')) return;
      if (element.querySelector('[data-linkmemory-status]')) return;

      element.setAttribute('data-linkmemory-status', 'seen');
      applySeenBadge(element);
    }
  });
}

/**
 * Appends a custom visual Red SEEN badge onto the element.
 */
function applySeenBadge(element) {
  const badge = document.createElement('span');
  badge.className = 'linkmemory-seen-badge';
  badge.textContent = 'SEEN';

  // Set premium visual styles matching V4 minimal dark-first specifications
  badge.style.setProperty('background-color', '#ff3b30', 'important');
  badge.style.setProperty('color', '#ffffff', 'important');
  badge.style.setProperty('font-size', '9px', 'important');
  badge.style.setProperty('font-weight', '700', 'important');
  badge.style.setProperty('text-transform', 'uppercase', 'important');
  badge.style.setProperty('letter-spacing', '0.5px', 'important');
  badge.style.setProperty('border-radius', '4px', 'important');
  badge.style.setProperty('padding', '2px 5px', 'important');
  badge.style.setProperty('margin-left', '6px', 'important');
  badge.style.setProperty('display', 'inline-flex', 'important');
  badge.style.setProperty('align-items', 'center', 'important');
  badge.style.setProperty('justify-content', 'center', 'important');
  badge.style.setProperty('vertical-align', 'middle', 'important');
  badge.style.setProperty('line-height', '1', 'important');
  badge.style.setProperty('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 'important');
  badge.style.setProperty('user-select', 'none', 'important');
  badge.style.setProperty('pointer-events', 'none', 'important');
  badge.style.setProperty('white-space', 'nowrap', 'important');

  element.appendChild(badge);
}

/**
 * Clears all injected badges and dynamic attribute tracking flags.
 */
function cleanupBadging() {
  document.querySelectorAll('[data-linkmemory-checked]').forEach(el => el.removeAttribute('data-linkmemory-checked'));
  document.querySelectorAll('[data-linkmemory-status]').forEach(el => el.removeAttribute('data-linkmemory-status'));
  document.querySelectorAll('.linkmemory-seen-badge').forEach(el => el.remove());
}

/**
 * Observes DOM mutations and handles dynamic SPA routing shifts.
 */
function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    // 1. Detect dynamic virtual SPA URL transitions
    if (window.location.href !== lastObservedUrl) {
      lastObservedUrl = window.location.href;
      cleanupBadging();
      // Deferred record to capture updated document.title from the SPA
      setTimeout(recordPageVisit, 500);
      loadSettingsAndScan();
      return;
    }

    // 2. Throttle lookups on scroll/addition modifications
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanPage();
    }, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen to control messaging actions from Dashboard and Options tabs
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getMatchedCount') {
    // Count matched titles currently rendered on the page
    const matchedNodes = document.querySelectorAll('[data-linkmemory-status="seen"]');
    sendResponse({ count: matchedNodes.length });
  } else if (request.action === 'reScanPage') {
    cleanupBadging();
    loadSettingsAndScan();
    sendResponse({ status: 'completed' });
  }
  return true;
});

// Monitor bfcache (Back-Forward Cache) transitions
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    cleanupBadging();
    loadSettingsAndScan();
  }
});

// Launch content scripts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
