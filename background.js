/**
 * LyricTab – background.js
 * - Opens side panel on icon click
 * - Proxies hopamchuan.com fetches (CORS workaround)
 * - Watches for YouTube navigation to auto-refresh the panel
 */

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});

// ── hopamchuan proxy ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_HOPAMCHUAN') {
    fetchHopamchuan(msg.url)
      .then(html  => sendResponse({ ok: true, html }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function fetchHopamchuan(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ── YouTube navigation watcher → notify side panel ────────────────────────────
// Fires when the URL changes inside a YouTube tab (e.g. next video autoplay)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.includes('youtube.com/watch')
  ) {
    // Broadcast to any open side panel instances
    chrome.runtime.sendMessage({ type: 'YT_NAVIGATED', tabId }).catch(() => {});
  }
});
