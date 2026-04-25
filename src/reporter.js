import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export const Reporter = {
    sourceApp: 'ThreadsBlocker',
    PLATFORM_UPLOAD_SOFT_MAX_BYTES: Math.floor(4.5 * 1024 * 1024),
    PLATFORM_UPLOAD_HARD_MAX_BYTES: 5 * 1024 * 1024,

    normalizeErrorMessage: (result, fallback = 'Unknown error') => {
        if (!result) return fallback;
        const primary = String(result.message || '').trim();
        const reasons = Array.isArray(result.reasons)
            ? result.reasons.map(v => String(v || '').trim()).filter(Boolean)
            : [];
        if (primary && reasons.length > 0) return `${primary}: ${reasons.join(', ')}`;
        if (primary) return primary;
        const skipped = String(result.skipped || '').trim();
        if (skipped) return `Skipped: ${skipped}`;
        const statusText = String(result.statusText || '').trim();
        const code = Number(result.code) || 0;
        if (code > 0 && statusText) return `HTTP ${code} ${statusText}`;
        if (code > 0) return `HTTP ${code}`;
        return fallback;
    },

    byteLengthOfJSON: (value) => {
        try {
            return new TextEncoder().encode(JSON.stringify(value)).length;
        } catch (_) {
            return Number.MAX_SAFE_INTEGER;
        }
    },

    trimText: (value, maxLen = 160) => {
        const text = String(value || '');
        if (!text) return '';
        return text.length > maxLen ? text.slice(0, maxLen) : text;
    },

    keepTopEntries: (value, limit = 10) => {
        const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return Object.fromEntries(
            Object.entries(obj)
                .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
                .slice(0, limit)
        );
    },

    optimizePlatformPayload: (payload, options = {}) => {
        const maxBytes = Math.max(1024, Number(options.maxBytes) || Reporter.PLATFORM_UPLOAD_SOFT_MAX_BYTES);
        const next = JSON.parse(JSON.stringify(payload || {}));
        const originalBytes = Reporter.byteLengthOfJSON(next);
        const steps = [];
        const noteStep = (label, before, after) => {
            if (after < before) steps.push(`${label}:${before}->${after}`);
        };
        const currentBytes = () => Reporter.byteLengthOfJSON(next);

        if (originalBytes <= maxBytes) {
            return { payload: next, originalBytes, finalBytes: originalBytes, optimized: false, steps };
        }

        let before = currentBytes();
        if (Array.isArray(next.events)) {
            next.events = next.events.map((event) => ({
                ...event,
                sourceText: Reporter.trimText(event?.sourceText, 160),
                sourceOwner: Reporter.trimText(event?.sourceOwner, 80),
                reportPath: Array.isArray(event?.reportPath) ? event.reportPath.slice(0, 3).map(v => Reporter.trimText(v, 80)) : []
            }));
        }
        if (Array.isArray(next.accounts)) {
            next.accounts = next.accounts.map((account) => ({
                ...account,
                sourceUrls: Array.isArray(account?.sourceUrls) ? account.sourceUrls.slice(0, 8) : [],
                sourceOwners: Array.isArray(account?.sourceOwners) ? account.sourceOwners.slice(0, 4).map(v => Reporter.trimText(v, 80)) : [],
                blockReasons: Array.isArray(account?.blockReasons) ? account.blockReasons.slice(0, 8).map(v => Reporter.trimText(v, 80)) : [],
                reportPrimaryCategories: Array.isArray(account?.reportPrimaryCategories) ? account.reportPrimaryCategories.slice(0, 8).map(v => Reporter.trimText(v, 80)) : [],
                reportLeafCategories: Array.isArray(account?.reportLeafCategories) ? account.reportLeafCategories.slice(0, 8).map(v => Reporter.trimText(v, 80)) : []
            }));
        }
        if (Array.isArray(next.sources)) {
            next.sources = next.sources.map((source) => ({
                ...source,
                sourceOwners: Array.isArray(source?.sourceOwners) ? source.sourceOwners.slice(0, 4).map(v => Reporter.trimText(v, 80)) : [],
                sourceTextSamples: Array.isArray(source?.sourceTextSamples) ? source.sourceTextSamples.slice(0, 1).map(v => Reporter.trimText(v, 160)) : [],
                accountIds: Array.isArray(source?.accountIds) ? source.accountIds.slice(0, 20).map(v => Reporter.trimText(v, 180)) : [],
                reportPathCounts: Reporter.keepTopEntries(source?.reportPathCounts, 8),
                blockReasonCounts: Reporter.keepTopEntries(source?.blockReasonCounts, 8),
                topicHintCounts: Reporter.keepTopEntries(source?.topicHintCounts, 12),
                topTopicHints: Array.isArray(source?.topTopicHints)
                    ? source.topTopicHints.slice(0, 5).map((item) => ({
                        topicHint: Reporter.trimText(item?.topicHint, 120),
                        count: Number(item?.count) || 0
                    }))
                    : []
            }));
        }
        if (Array.isArray(next.sourceEvidence)) {
            next.sourceEvidence = next.sourceEvidence.map((item) => ({
                ...item,
                sourceOwner: Reporter.trimText(item?.sourceOwner, 80),
                sourceChannel: Reporter.trimText(item?.sourceChannel, 40),
                textHash: Reporter.trimText(item?.textHash, 120),
                snippet: Reporter.trimText(item?.snippet, 160)
            }));
        }
        if (next.analysisSeeds && typeof next.analysisSeeds === 'object') {
            if (Array.isArray(next.analysisSeeds.suspiciousAccounts)) {
                next.analysisSeeds.suspiciousAccounts = next.analysisSeeds.suspiciousAccounts.slice(0, 30);
            }
            if (Array.isArray(next.analysisSeeds.campaignCandidates)) {
                next.analysisSeeds.campaignCandidates = next.analysisSeeds.campaignCandidates.slice(0, 30).map((item) => ({
                    ...item,
                    sourceOwners: Array.isArray(item?.sourceOwners) ? item.sourceOwners.slice(0, 4).map(v => Reporter.trimText(v, 80)) : [],
                    sourceTextSamples: Array.isArray(item?.sourceTextSamples) ? item.sourceTextSamples.slice(0, 1).map(v => Reporter.trimText(v, 160)) : [],
                    topTopicHints: Array.isArray(item?.topTopicHints) ? item.topTopicHints.slice(0, 5) : [],
                    dominantReportPaths: Array.isArray(item?.dominantReportPaths) ? item.dominantReportPaths.slice(0, 3) : []
                }));
            }
            if (Array.isArray(next.analysisSeeds.topicSeeds)) {
                next.analysisSeeds.topicSeeds = next.analysisSeeds.topicSeeds.slice(0, 20).map((item) => ({
                    ...item,
                    sampleAccounts: Array.isArray(item?.sampleAccounts) ? item.sampleAccounts.slice(0, 5) : [],
                    sampleSources: Array.isArray(item?.sampleSources) ? item.sampleSources.slice(0, 3) : []
                }));
            }
            if (Array.isArray(next.analysisSeeds.narrativeSeeds)) {
                next.analysisSeeds.narrativeSeeds = next.analysisSeeds.narrativeSeeds.slice(0, 20).map((item) => ({
                    ...item,
                    sourceOwners: Array.isArray(item?.sourceOwners) ? item.sourceOwners.slice(0, 4).map(v => Reporter.trimText(v, 80)) : [],
                    sourceTextSamples: Array.isArray(item?.sourceTextSamples) ? item.sourceTextSamples.slice(0, 1).map(v => Reporter.trimText(v, 160)) : [],
                    dominantReportPaths: Array.isArray(item?.dominantReportPaths) ? item.dominantReportPaths.slice(0, 3) : [],
                    dominantBlockReasons: Array.isArray(item?.dominantBlockReasons) ? item.dominantBlockReasons.slice(0, 3) : [],
                    dominantTopicHints: Array.isArray(item?.dominantTopicHints) ? item.dominantTopicHints.slice(0, 5) : []
                }));
            }
        }
        let after = currentBytes();
        noteStep('compact_verbose_fields', before, after);
        if (after <= maxBytes) {
            return { payload: next, originalBytes, finalBytes: after, optimized: true, steps };
        }

        before = after;
        if (Array.isArray(next.sourceEvidence)) {
            next.sourceEvidence = next.sourceEvidence.map((item) => ({
                ...item,
                snippet: ''
            }));
        }
        after = currentBytes();
        noteStep('drop_source_evidence_snippets', before, after);
        if (after <= maxBytes) {
            return { payload: next, originalBytes, finalBytes: after, optimized: true, steps };
        }

        before = after;
        if (Array.isArray(next.events)) {
            next.events = next.events.map((event) => ({
                ...event,
                sourceText: ''
            }));
        }
        if (Array.isArray(next.sources)) {
            next.sources = next.sources.map((source) => ({
                ...source,
                sourceTextSamples: []
            }));
        }
        if (next.analysisSeeds && typeof next.analysisSeeds === 'object' && Array.isArray(next.analysisSeeds.narrativeSeeds)) {
            next.analysisSeeds.narrativeSeeds = next.analysisSeeds.narrativeSeeds.map((item) => ({
                ...item,
                sourceTextSamples: []
            }));
        }
        after = currentBytes();
        noteStep('drop_source_text_fields', before, after);
        if (after <= maxBytes) {
            return { payload: next, originalBytes, finalBytes: after, optimized: true, steps };
        }

        before = after;
        next.sourceEvidence = [];
        if (next.fieldSpec && typeof next.fieldSpec === 'object') {
            next.fieldSpec = {
                ...next.fieldSpec,
                sourceEvidence: []
            };
        }
        after = currentBytes();
        noteStep('drop_source_evidence', before, after);

        return { payload: next, originalBytes, finalBytes: after, optimized: after < originalBytes, steps };
    },

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
                    resolve({
                        code: response.status,
                        message: String(response.responseText || '').trim() || `HTTP ${response.status}`,
                        statusText: response.statusText || ''
                    });
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
                resolve({
                    code: res.status,
                    message: String(text || '').trim() || `HTTP ${res.status}`,
                    statusText: res.statusText || ''
                });
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
                message: Reporter.normalizeErrorMessage(lastError, 'Network error'),
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
        const autoSyncEnabled = Storage.hasPlatformSyncConsentForCurrentVersion() && Storage.getPlatformSyncEnabled();
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
        const prepared = Reporter.optimizePlatformPayload(body, {
            maxBytes: Reporter.PLATFORM_UPLOAD_SOFT_MAX_BYTES
        });
        const uploadBody = prepared.payload;
        if (prepared.optimized) {
            uploadBody.uploadMeta = uploadBody.uploadMeta && typeof uploadBody.uploadMeta === 'object'
                ? uploadBody.uploadMeta
                : {};
            uploadBody.uploadMeta.payloadOptimization = {
                originalBytes: prepared.originalBytes,
                finalBytes: prepared.finalBytes,
                steps: prepared.steps
            };
        }
        if (prepared.finalBytes > Reporter.PLATFORM_UPLOAD_HARD_MAX_BYTES) {
            return {
                code: 413,
                message: `Payload too large after optimization (${prepared.finalBytes} bytes)`,
                detail: {
                    originalBytes: prepared.originalBytes,
                    finalBytes: prepared.finalBytes,
                    steps: prepared.steps
                }
            };
        }

        let lastError = null;
        for (const endpoint of endpoints) {
            try {
                const result = typeof GM_xmlhttpRequest !== 'undefined'
                    ? await Reporter.sendViaGM(endpoint, uploadBody)
                    : await Reporter.sendViaFetch(endpoint, uploadBody);

                if (result && Number(result.code) === 200) {
                    const syncedAt = Date.now();
                    Storage.recordPlatformUploadSuccess(options.trigger || 'manual', syncedAt);
                    Storage.setPlatformSyncLastAt(syncedAt);
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
                message: Reporter.normalizeErrorMessage(lastError, 'Network error'),
                detail: lastError
            };
        }

        return { code: 500, message: 'No endpoint available' };
    }
};
