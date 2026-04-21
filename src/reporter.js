import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export const Reporter = {
    sourceApp: 'ThreadsBlocker',

    getHardwareId: () => {
        let hwid = Storage.get('hege_hwid');
        if (!hwid) {
            hwid = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            Storage.set('hege_hwid', hwid);
        }
        return hwid;
    },

    sha256: async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    getReportEndpoints: () => {
        const primary = (CONFIG.BUG_REPORT_URL || '').trim();
        const fallbacks = Array.isArray(CONFIG.BUG_REPORT_FALLBACK_URLS) ? CONFIG.BUG_REPORT_FALLBACK_URLS : [];
        const endpoints = [primary, ...fallbacks.map(v => (v || '').trim())].filter(Boolean);
        return [...new Set(endpoints)];
    },

    getPlatformUploadEndpoints: () => {
        const override = (Storage.get(CONFIG.KEYS.PLATFORM_UPLOAD_URL_OVERRIDE, '') || '').trim();
        const primary = (override || CONFIG.PLATFORM_UPLOAD_URL || '').trim();
        const fallbacks = Array.isArray(CONFIG.PLATFORM_UPLOAD_FALLBACK_URLS) ? CONFIG.PLATFORM_UPLOAD_FALLBACK_URLS : [];
        const endpoints = [primary, ...fallbacks.map(v => (v || '').trim())].filter(Boolean);
        return [...new Set(endpoints)];
    },

    getPlatformSourceId: () => Storage.getPlatformSourceId(),

    getClientPlatform: () => {
        const ua = (navigator.userAgent || '').toLowerCase();
        const isFirefox = ua.includes('firefox');
        const isIOS = /iphone|ipad|ipod/.test(ua);
        const isUserscript = typeof GM_info !== 'undefined';
        if (isIOS && isUserscript) return 'ios_userscript';
        if (isFirefox && typeof browser !== 'undefined' && browser.runtime) return 'firefox_extension';
        if (isFirefox) return 'firefox_userscript';
        if (isUserscript) return 'userscript';
        if (typeof chrome !== 'undefined' && chrome.runtime) return 'chrome_extension';
        return 'web_unknown';
    },

    collectClientEnv: (extra = {}) => ({
        platform: (navigator.platform || '').toString(),
        scriptManager: typeof GM_info !== 'undefined' ? (GM_info.scriptHandler || 'GM') : 'none',
        hasGMXHR: typeof GM_xmlhttpRequest !== 'undefined',
        online: typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
        userAgent: (navigator.userAgent || '').toString(),
        ...extra
    }),

    sendViaGM: (endpoint, payload) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: endpoint,
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload),
            onload: (response) => {
                try {
                    const resJson = JSON.parse(response.responseText);
                    resolve(resJson);
                } catch (e) {
                    resolve({ code: response.status, message: response.responseText });
                }
            },
            onerror: (err) => {
                reject({ code: 500, message: 'Network error or CORS issue.', network: true, detail: err });
            }
        });
    }),

    sendViaFetch: (endpoint, payload) => new Promise((resolve, reject) => {
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            redirect: 'follow'
        }).then(async res => {
            const text = await res.text();
            try {
                resolve(JSON.parse(text));
            } catch (e) {
                resolve({ code: res.status, message: text });
            }
        }).catch(err => {
            reject({ code: 500, message: err.toString(), network: true, detail: err });
        });
    }),

    submitReport: async (level, message, errorCode = '', metadata = null) => {
        const endpoints = Reporter.getReportEndpoints();
        if (endpoints.length === 0 || !CONFIG.BUG_REPORT_SALT) {
            return { code: 500, message: 'Bug Reporter is not properly configured.' };
        }

        const hwid = Reporter.getHardwareId();
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const rawStr = `${timestamp}${hwid}${CONFIG.BUG_REPORT_SALT}`;
        const signature = await Reporter.sha256(rawStr);

        const basePayload = {
            source_app: Reporter.sourceApp,
            version: CONFIG.VERSION,
            hwid,
            timestamp,
            level,
            message,
            error_code: errorCode,
            metadata: metadata ? JSON.stringify(metadata) : '',
            signature
        };

        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const envMeta = Reporter.collectClientEnv({ endpoint });
                const payload = {
                    ...basePayload,
                    metadata: JSON.stringify({
                        userMetadata: metadata || null,
                        clientEnv: envMeta
                    })
                };

                const result = typeof GM_xmlhttpRequest !== 'undefined'
                    ? await Reporter.sendViaGM(endpoint, payload)
                    : await Reporter.sendViaFetch(endpoint, payload);

                if (result && Number(result.code) === 200) {
                    return result;
                }

                lastError = result || { code: 500, message: 'Unknown response' };
                if (Number(lastError.code) !== 500) {
                    return lastError;
                }
            } catch (err) {
                lastError = err || { code: 500, message: 'Unknown error' };
            }
        }

        if (lastError) {
            return {
                code: 500,
                message: lastError.message || 'Network error',
                detail: lastError
            };
        }

        return { code: 500, message: 'No endpoint available' };
    },

    submitPlatformPayload: async (payload, options = {}) => {
        const endpoints = Reporter.getPlatformUploadEndpoints();
        if (endpoints.length === 0) {
            return { code: 500, message: 'Platform uploader is not configured.' };
        }
        if (!payload || typeof payload !== 'object') {
            return { code: 400, message: 'Invalid payload' };
        }

        const existingMeta = payload.uploadMeta && typeof payload.uploadMeta === 'object' ? payload.uploadMeta : {};
        const clientSourceId = String(payload.clientSourceId || Reporter.getPlatformSourceId() || '').trim();
        const clientPlatform = Reporter.getClientPlatform();
        const autoSyncEnabled = Storage.getPlatformSyncEnabled();
        const body = {
            ...payload,
            clientSourceId,
            uploadMeta: {
                ...existingMeta,
                source: options.source || 'analytics',
                uploadedAt: new Date().toISOString(),
                toolVersion: CONFIG.VERSION,
                clientPlatform,
                autoSyncEnabled,
                uploadTrigger: options.trigger || 'manual'
            }
        };

        let lastError = null;
        for (const endpoint of endpoints) {
            try {
                const result = typeof GM_xmlhttpRequest !== 'undefined'
                    ? await Reporter.sendViaGM(endpoint, body)
                    : await Reporter.sendViaFetch(endpoint, body);

                if (result && Number(result.code) === 200) {
                    Storage.setPlatformSyncLastAt(Date.now());
                    return result;
                }
                lastError = result || { code: 500, message: 'Unknown response' };
                if (Number(lastError.code) !== 500) return lastError;
            } catch (err) {
                lastError = err || { code: 500, message: 'Unknown error' };
            }
        }

        if (lastError) {
            return {
                code: 500,
                message: lastError.message || 'Network error',
                detail: lastError
            };
        }

        return { code: 500, message: 'No endpoint available' };
    }
};
