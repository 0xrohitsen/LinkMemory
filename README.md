# 🔗 LinkMemory — Chrome History & Tracking Extension

**LinkMemory** is a premium, high-performance, and privacy-first Google Chrome/Brave Extension built with MV3. Designed specifically for content readers, researchers, and community contributors, LinkMemory dynamically tracks, highlights, and filters your browsing history to deliver an uninterrupted, highly visual feed browsing experience.

Instantly recognize previously read articles, manage lists, and dynamically hide clicked items to browse feeds without repeating clicks!

---

## 🌟 Key Features

1. **Vibrant Dual-Status Highlighting (Green, Red, Purple)**
   * **Visited URLs only (Green `rgb(34, 197, 94)`)**: Renders a `VISITED` badge next to page links you've browsed.
   * **Seen Titles only (Red `rgb(255, 59, 48)`)**: Renders a `SEEN` badge next to titles imported from external lists.
   * **Dual Matching (Purple `rgb(168, 85, 247)`)**: Renders a combined `VISITED • SEEN` badge when a link has been imported AND clicked!

2. **Bulk Title Paste Panel (New in V2.2)**
   * A clean, collapsible accordion text panel. Paste raw article titles directly (one per line) from your browser history.
   * Smart parser automatically filters out blank lines, trims spacing, and excludes structural table headers (like `"Title"` labels).
   * Fully integrated with the database deduplication engine to skip duplicates, accompanied by real-time progress bar animations.

3. **Dynamic SPA Router Observer (Optimized for Modern SPAs)**
   * Special MutationObserver monitors virtual Single Page Application (SPA) tab shifts (such as on `community.arc.io`), recording navigation logs automatically without full-page reloads.

4. **Global Auto-Hide Visited Articles**
   * Toggle **"Hide Visited Articles"** in the settings. Any article cards or links that have been visited or exist in your seen history are dynamically hidden (`display: none !important`) in real-time.
   * Hides the *enclosing card container* (such as `<article>` elements or parent anchor `<a>` links) rather than just the heading text to maintain clean, seamless grid layouts.

5. **Exclusions & Exceptions Whitelist**
   * Manage exceptions directly in the popup. whitelisted pages bypass the auto-hide engine entirely.
   * Pre-seeded with defaults like:
     * `https://community.arc.io/home`
     * `https://community.arc.io/home/contributors/my-contributions`
   * Click **"+ Exclude Current Page"** or manually add paths to prevent structural feed columns from hiding.

6. **Dually Indexed Live Search**
   * Instant search scans both URLs and Titles databases simultaneously, highlighting matches using `<mark>` tags and displaying custom status tags (Seen, Visited, or Both).

7. **Resilient CSV Importers & Exporters**
   * Imports external read titles lists or URL browsing history CSV tables, dynamically resolving duplicates.
   * Exports both databases cleanly to CSV files.

8. **Privacy-First & Offline-First**
   * 100% of data is stored client-side in the sandboxed local storage (`chrome.storage.local`). No external APIs, no trackers, and no server connections.

---

## 📂 File Architecture

```
LinkMemory/
├── manifest.json         # Extension MV3 declarations & permissions
├── background.js         # Service worker tracking installation details
├── content.js            # Page auto-tracker, SPA observer, & visual badges
├── popup.html            # Premium dashboard interface UI
├── popup.css             # Harmonious HSL styling & micro-animations
├── popup.js              # View controller managing state events & imports
├── csv-import.js         # Joint parser for Title & URL CSV rows
├── storage.js            # Promise-based local database manager
├── utils.js              # High-fidelity URL & Title cleaning helpers
└── icons/                # High-fidelity cropped brand icons
    ├── icon16.png        # maximized 16x16 icon
    ├── icon48.png        # maximized 48x48 icon
    └── icon128.png       # maximized 128x128 icon
```

---

## 🚀 Installation Guide (Developer Mode)

As an open-source extension, you can easily load LinkMemory locally into any Chromium-based browser (Chrome, Brave, Edge, Opera, etc.):

1. **Download / Clone** the repository:
   ```bash
   git clone https://github.com/0xrohitsen/LinkMemory.git
   ```
2. Open your browser and navigate to the Extensions page:
   * Chrome: `chrome://extensions/`
   * Brave: `brave://extensions/`
3. In the top-right corner, switch the **"Developer mode"** toggle to **ON**.
4. In the top-left, click **"Load unpacked"**.
5. Select the `LinkMemory` folder from your local disk.
6. **That's it!** Pin the extension to your toolbar to access the dashboard.

---

## 📘 How to Use

### 1. Clipboard Paste (Quick Import)
1. Click **"Paste Titles"** in the popup to slide open the accordion text area.
2. Paste any list of article titles (e.g., copied from your history or spreadsheet).
3. Click **"Import Pasted Titles"**. The parser will deduplicate the list and notify you instantly.

### 2. Auto-Hiding Feeds
1. Navigate to your favorite community feed page.
2. Enable the **"Hide Visited Articles"** toggle in the popup.
3. Any articles you have read or visited will fade out completely, keeping your dashboard clean and focused on unread content!

### 3. Adding Exceptions
* If you are on a page where you *do not* want articles to hide (e.g., a home directory page), click **"+ Exclude Current Page"** in the popup exceptions area.

---

## 📜 License
This project is open-source and licensed under the [MIT License](LICENSE).
