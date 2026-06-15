// Beta/dev-only MV3 service worker.
// build.sh only includes this file in beta builds.

const HEGE_DEV_THREADS_URL_PATTERN = /^https?:\/\/([^/]+\.)?threads\.(com|net)\//i;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'HEGE_DEV_RELOAD_EXTENSION') return false;

    const senderUrl = sender?.url || sender?.tab?.url || '';
    if (!HEGE_DEV_THREADS_URL_PATTERN.test(senderUrl)) {
        sendResponse({ ok: false, error: 'invalid_sender' });
        return false;
    }

    try {
        chrome.storage?.local?.set?.({
            hegeDevReloadRequestedAt: Date.now(),
            hegeDevReloadSource: String(message.source || 'unknown').slice(0, 80),
            hegeDevReloadVersion: String(message.version || '').slice(0, 40),
        });
    } catch (e) {}

    sendResponse({ ok: true, reloading: true });
    setTimeout(() => chrome.runtime.reload(), 120);
    return false;
});
