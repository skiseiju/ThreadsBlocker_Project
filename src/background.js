/**
 * 留友封 — Service Worker (Background)
 *
 * 負責透過 chrome.scripting API 動態註冊 MAIN world interceptor，
 * 比 manifest 靜態宣告更穩定可靠。
 */

chrome.runtime.onInstalled.addListener(async () => {
    // 先移除舊的動態註冊（避免重複）
    try {
        await chrome.scripting.unregisterContentScripts({ ids: ['hege-interceptor'] });
    } catch(e) {
        // 首次安裝時不存在，忽略
    }

    // 動態註冊 MAIN world interceptor
    await chrome.scripting.registerContentScripts([{
        id: 'hege-interceptor',
        matches: [
            '*://*.threads.net/*',
            '*://threads.net/*',
            '*://*.threads.com/*',
            '*://threads.com/*'
        ],
        js: ['interceptor.js'],
        runAt: 'document_start',
        world: 'MAIN'
    }]);

    console.log('[留友封 SW] MAIN world interceptor registered via scripting API');
});
