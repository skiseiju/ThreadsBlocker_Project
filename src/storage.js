// Simple Adapter for LocalStorage / SessionStorage with Memory Cache
import { CONFIG } from './config.js';

export const Storage = {
    cache: {},
    sessionCache: {},

    get: (key, defaultVal = null) => {
        if (Storage.cache[key] !== undefined) return Storage.cache[key];
        const val = localStorage.getItem(key);
        Storage.cache[key] = val !== null ? val : defaultVal;
        return Storage.cache[key];
    },
    set: (key, value) => {
        Storage.cache[key] = value;
        localStorage.setItem(key, value);
    },
    remove: (key) => {
        delete Storage.cache[key];
        localStorage.removeItem(key);
    },
    invalidate: (key) => {
        delete Storage.cache[key];
    },
    invalidateMulti: (keys) => {
        for (const k of keys) delete Storage.cache[k];
    },
    getJSON: (key, defaultVal = []) => {
        let parsed;
        if (Storage.cache[key] !== undefined && typeof Storage.cache[key] !== 'string') {
            parsed = Storage.cache[key];
        } else {
            const val = localStorage.getItem(key);
            try {
                parsed = val ? JSON.parse(val) : defaultVal;
                Storage.cache[key] = parsed;
            } catch (e) {
                parsed = defaultVal;
            }
        }
        // Return a clone to prevent accidental reference mutation bugs across contexts
        return Array.isArray(parsed) ? [...parsed] : (typeof parsed === 'object' && parsed !== null ? { ...parsed } : parsed);
    },
    setJSON: (key, value) => {
        Storage.cache[key] = value;
        localStorage.setItem(key, JSON.stringify(value));
    },

    getBlockContextMap: () => {
        const raw = Storage.getJSON(CONFIG.KEYS.BLOCK_CONTEXT_MAP, {});
        return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    },

    setBlockContext: (usernames, context = {}, options = {}) => {
        const targets = (Array.isArray(usernames) ? usernames : [usernames])
            .map(u => String(u || '').trim())
            .filter(Boolean);
        if (targets.length === 0) return 0;

        const map = Storage.getBlockContextMap();
        const preserveExisting = options.preserveExisting !== false;
        const base = {
            src: String(context.src || context.sourceUrl || ''),
            reason: String(context.reason || 'manual'),
            postText: String(context.postText || context.sourceText || ''),
            postOwner: String(context.postOwner || context.sourceOwner || ''),
            batch: String(context.batch || ''),
            updatedAt: Date.now(),
        };

        let changed = 0;
        targets.forEach((username) => {
            if (preserveExisting && map[username]) return;
            map[username] = { ...base };
            changed++;
        });

        if (changed > 0) Storage.setJSON(CONFIG.KEYS.BLOCK_CONTEXT_MAP, map);
        return changed;
    },

    getBlockContext: (username = '') => {
        if (!username) return {};
        const map = Storage.getBlockContextMap();
        const found = map[String(username).trim()];
        return found && typeof found === 'object' ? { ...found } : {};
    },

    removeBlockContext: (usernames) => {
        const targets = (Array.isArray(usernames) ? usernames : [usernames])
            .map(u => String(u || '').trim())
            .filter(Boolean);
        if (targets.length === 0) return 0;

        const map = Storage.getBlockContextMap();
        let changed = 0;
        targets.forEach((username) => {
            if (!map[username]) return;
            delete map[username];
            changed++;
        });

        if (changed === 0) return 0;
        if (Object.keys(map).length === 0) Storage.remove(CONFIG.KEYS.BLOCK_CONTEXT_MAP);
        else Storage.setJSON(CONFIG.KEYS.BLOCK_CONTEXT_MAP, map);
        return changed;
    },

    clearBlockContextMap: () => {
        Storage.remove(CONFIG.KEYS.BLOCK_CONTEXT_MAP);
    },

    getDailyBlockLimit: () => {
        const limit = parseInt(Storage.get(CONFIG.KEYS.DAILY_BLOCK_LIMIT), 10);
        return CONFIG.DAILY_LIMIT_OPTIONS.includes(limit) ? limit : CONFIG.DAILY_LIMIT_DEFAULT;
    },

    recordBlock: () => {
        const now = Date.now();
        const cutoff = now - 48 * 60 * 60 * 1000;
        const ring = Storage.getJSON(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, [])
            .filter(t => typeof t === 'number' && t >= cutoff);
        ring.push(now);
        Storage.setJSON(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, ring);
    },

    getBlocksLast24h: () => {
        const now = Date.now();
        const cutoff48h = now - 48 * 60 * 60 * 1000;
        const cutoff24h = now - 24 * 60 * 60 * 1000;
        const ring = Storage.getJSON(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, [])
            .filter(t => typeof t === 'number' && t >= cutoff48h);
        Storage.setJSON(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, ring);
        return ring.filter(t => t >= cutoff24h).length;
    },

    isUnderLimit: () => {
        if (Storage.get(CONFIG.KEYS.EMERGENCY_MODE) === 'true') return true;
        return Storage.getBlocksLast24h() < Storage.getDailyBlockLimit();
    },

    getDailyReportLimit: () => {
        const limit = parseInt(Storage.get(CONFIG.KEYS.DAILY_REPORT_LIMIT), 10);
        return CONFIG.DAILY_REPORT_LIMIT_OPTIONS.includes(limit) ? limit : CONFIG.DAILY_REPORT_LIMIT_DEFAULT;
    },

    recordReport: () => {
        const now = Date.now();
        const cutoff = now - 48 * 60 * 60 * 1000;
        const ring = Storage.getJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, [])
            .filter(t => typeof t === 'number' && t >= cutoff);
        ring.push(now);
        Storage.setJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, ring);
    },

    getReportsLast24h: () => {
        const now = Date.now();
        const cutoff48h = now - 48 * 60 * 60 * 1000;
        const cutoff24h = now - 24 * 60 * 60 * 1000;
        const ring = Storage.getJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, [])
            .filter(t => typeof t === 'number' && t >= cutoff48h);
        Storage.setJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, ring);
        return ring.filter(t => t >= cutoff24h).length;
    },

    isUnderReportLimit: () => {
        if (Storage.get(CONFIG.KEYS.EMERGENCY_MODE) === 'true') return true;
        return Storage.getReportsLast24h() < Storage.getDailyReportLimit();
    },

    // Session Storage
    getSessionJSON: (key, defaultVal = []) => {
        let parsed;
        if (Storage.sessionCache[key] !== undefined) {
            parsed = Storage.sessionCache[key];
        } else {
            const val = sessionStorage.getItem(key);
            try {
                parsed = val ? JSON.parse(val) : defaultVal;
                Storage.sessionCache[key] = parsed;
            } catch (e) {
                parsed = defaultVal;
            }
        }
        // Return a clone
        return Array.isArray(parsed) ? [...parsed] : (typeof parsed === 'object' && parsed !== null ? { ...parsed } : parsed);
    },
    setSessionJSON: (key, value) => {
        Storage.sessionCache[key] = value;
        sessionStorage.setItem(key, JSON.stringify(value));
    },

    // Block DB operations
    addToBlockDB: (username, metadata = {}) => {
        let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        const isNew = !db.has(username);
        const tsMissing = !ts[username];
        if (isNew) db.add(username);
        if (tsMissing) {
            ts[username] = {
                t: Date.now(),
                src: metadata.src || '',
                reason: metadata.reason || 'manual',
                postText: metadata.postText || '',
                postOwner: metadata.postOwner || '',
                batch: metadata.batch || ''
            };
        }
        if (isNew) Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
        if (tsMissing) Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
    },
    // worker 呼叫：從 per-user block context 組 metadata 寫入 block DB
    addToBlockDBFromContext: (username) => {
        const ctx = Storage.getBlockContext(username);
        Storage.addToBlockDB(username, {
            src: ctx.src || '',
            reason: ctx.reason || 'manual',
            postText: ctx.postText || '',
            postOwner: ctx.postOwner || '',
            batch: ctx.batch || ''
        });
        Storage.evidence.captureFromBlockContext(username, ctx);
        Storage.removeBlockContext(username);
    },
    removeFromBlockDB: (username) => {
        let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        db.delete(username);
        delete ts[username];
        Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
        Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
    },

    // 字串佇列用的輕量 helper（dedupe 用 Set，回寫 array）
    queueAddUnique: (key, value) => {
        const s = new Set(Storage.getJSON(key, []));
        if (s.has(value)) return false;
        s.add(value);
        Storage.setJSON(key, [...s]);
        return true;
    },
    queueRemove: (key, value) => {
        const arr = Storage.getJSON(key, []);
        const next = arr.filter(v => v !== value);
        if (next.length !== arr.length) Storage.setJSON(key, next);
    },

    // ========================================================================
    // 貼文水庫統一存取層（Phase 2：POST_QUEUE 為唯一 canonical queue）
    // ========================================================================
    postReservoir: {
        // 正規化 URL：統一用 split('?')[0] 配合引擎比對規則
        _norm: (url) => ((url || '').split('?')[0]),

        _canonicalEntry: (entry, fallbackUrl) => {
            const url = Storage.postReservoir._norm(entry?.url || fallbackUrl || '');
            if (!url) return null;
            return {
                url,
                label: entry?.label || url,
                addedAt: entry?.addedAt || Date.now(),
                advanceOnComplete: !!entry?.advanceOnComplete,
                longTermLoop: !!entry?.longTermLoop,
                lastSweptAt: entry?.lastSweptAt || 0,
                sweepCount: entry?.sweepCount || 0,
                batchCount: entry?.batchCount || 0,
                totalBlocked: entry?.totalBlocked || 0,
                status: entry?.status || (entry?.done ? 'done' : 'pending'),
            };
        },

        // 傳回 canonical entry 陣列
        getAll: () => {
            return Storage.getJSON(CONFIG.KEYS.POST_QUEUE, [])
                .map(p => Storage.postReservoir._canonicalEntry(p))
                .filter(Boolean);
        },

        // 取得單一 entry（以正規化 URL 比對）
        getByUrl: (url) => {
            const key = Storage.postReservoir._norm(url);
            return Storage.postReservoir.getAll().find(p => p.url === key) || null;
        },

        // 新增或更新貼文，保留既有統計資料
        addEntry: (url, opts = {}) => {
            const cleanUrl = Storage.postReservoir._norm(url);
            if (!cleanUrl) return false;
            const { label, advanceOnComplete = true, longTermLoop = false } = opts;
            const norm = Storage.postReservoir._norm;
            const queue = Storage.postReservoir.getAll();
            const idx = queue.findIndex(p => norm(p.url) === cleanUrl);
            const base = idx >= 0 ? queue[idx] : {
                url: cleanUrl,
                label: label || cleanUrl,
                addedAt: Date.now(),
                lastSweptAt: 0,
                sweepCount: 0,
                batchCount: 0,
                totalBlocked: 0,
                status: 'pending',
            };
            const next = {
                ...base,
                url: cleanUrl,
                label: label || base.label || cleanUrl,
                advanceOnComplete: !!advanceOnComplete || !!base.advanceOnComplete,
                longTermLoop: !!longTermLoop || !!base.longTermLoop,
                status: base.status === 'done' && advanceOnComplete ? 'pending' : (base.status || 'pending'),
            };
            if (!next.advanceOnComplete && !next.longTermLoop) return false;
            if (idx >= 0) queue[idx] = next;
            else queue.push(next);
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
            return true;
        },

        // 切換單篇貼文的旗標
        setFlags: (url, flags) => {
            const cleanUrl = Storage.postReservoir._norm(url);
            const { advanceOnComplete, longTermLoop } = flags || {};
            const norm = Storage.postReservoir._norm;
            const queue = Storage.postReservoir.getAll();
            const idx = queue.findIndex(p => norm(p.url) === cleanUrl);
            const entry = idx >= 0 ? queue[idx] : {
                url: cleanUrl,
                label: cleanUrl,
                addedAt: Date.now(),
                lastSweptAt: 0,
                sweepCount: 0,
                batchCount: 0,
                totalBlocked: 0,
                status: 'pending',
                advanceOnComplete: false,
                longTermLoop: false,
            };
            if (typeof advanceOnComplete === 'boolean') entry.advanceOnComplete = advanceOnComplete;
            if (typeof longTermLoop === 'boolean') entry.longTermLoop = longTermLoop;
            if (!entry.advanceOnComplete && !entry.longTermLoop) {
                Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue.filter(p => norm(p.url) !== cleanUrl));
                return;
            }
            if (entry.status === 'done' && entry.advanceOnComplete && !entry.longTermLoop) entry.status = 'pending';
            if (idx >= 0) queue[idx] = entry;
            else queue.push(entry);
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
        },

        // 移除整個 entry
        removeEntry: (url) => {
            const cleanUrl = Storage.postReservoir._norm(url);
            const norm = Storage.postReservoir._norm;
            const queue = Storage.postReservoir.getAll();
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue.filter(p => norm(p.url) !== cleanUrl));
        },

        // 清除已完成的單純定點絕項目；常駐巡邏項目不可刪
        clearDoneAdvance: () => {
            const queue = Storage.postReservoir.getAll();
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue.filter(p => !(p.status === 'done' && p.advanceOnComplete === true && p.longTermLoop !== true)));
        }
    },

    // ========================================================================
    // Source Evidence (IndexedDB + localStorage index)
    // 目標：保存來源貼文文字證據，避免刪文後完全失去可分析內容
    // ========================================================================
    evidence: {
        DB_NAME: 'hege_source_evidence_db',
        STORE_NAME: 'sourceEvidence',
        DB_VERSION: 1,
        MAX_INDEX_SIZE: 3000,
        MAX_DB_ITEMS: 6000,
        RETENTION_DAYS: 45,
        PRUNE_INTERVAL_MS: 6 * 60 * 60 * 1000,
        _openPromise: null,
        _disabled: false,

        _normalizeUrl: (url) => {
            if (!url) return '';
            try {
                const parsed = new URL(url, window.location.origin);
                return `${parsed.origin}${parsed.pathname}`;
            } catch (e) {
                return '';
            }
        },

        _compactText: (text, max = 280) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max),

        _hashText: (text) => {
            const s = String(text || '');
            let h = 5381;
            for (let i = 0; i < s.length; i++) {
                h = ((h << 5) + h) + s.charCodeAt(i);
                h = h >>> 0;
            }
            return h.toString(16);
        },

        _safeArrayPushUnique: (arr, value, maxSize = 120) => {
            const v = String(value || '').trim();
            if (!v) return arr;
            if (!arr.includes(v)) arr.push(v);
            if (arr.length > maxSize) arr.splice(0, arr.length - maxSize);
            return arr;
        },

        _getIndexMap: () => {
            const raw = Storage.getJSON(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX, {});
            return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        },

        getIndexList: () => Object.entries(Storage.evidence._getIndexMap())
            .map(([sourceUrl, item]) => ({ sourceUrl, ...(item || {}) }))
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),

        _updateIndexMap: (record) => {
            if (!record || !record.sourceUrl) return;
            const map = Storage.evidence._getIndexMap();
            map[record.sourceUrl] = {
                updatedAt: record.updatedAt || Date.now(),
                capturedAt: record.capturedAt || record.updatedAt || Date.now(),
                captureCount: record.captureCount || 0,
                sourceOwner: record.sourceOwner || '',
                sourceChannel: record.sourceChannel || '',
                lastEventType: record.lastEventType || '',
                textHash: record.textHash || '',
                snippet: record.snippet || '',
            };
            const entries = Object.entries(map).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
            const trimmed = entries.slice(0, Storage.evidence.MAX_INDEX_SIZE);
            Storage.setJSON(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX, Object.fromEntries(trimmed));
        },

        _maybePrune: () => {
            const now = Date.now();
            const key = CONFIG.KEYS.SOURCE_EVIDENCE_PRUNE_AT || 'hege_source_evidence_prune_at';
            const lastPruneAt = parseInt(Storage.get(key) || '0', 10);
            if (lastPruneAt > 0 && (now - lastPruneAt) < Storage.evidence.PRUNE_INTERVAL_MS) return;
            Storage.set(key, String(now));
            Storage.evidence.prune().catch(() => {});
        },

        _openDB: () => {
            if (Storage.evidence._disabled) return Promise.resolve(null);
            if (Storage.evidence._openPromise) return Storage.evidence._openPromise;

            if (typeof indexedDB === 'undefined') {
                Storage.evidence._disabled = true;
                return Promise.resolve(null);
            }

            Storage.evidence._openPromise = new Promise((resolve) => {
                try {
                    const request = indexedDB.open(Storage.evidence.DB_NAME, Storage.evidence.DB_VERSION);
                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        if (!db.objectStoreNames.contains(Storage.evidence.STORE_NAME)) {
                            db.createObjectStore(Storage.evidence.STORE_NAME, { keyPath: 'sourceUrl' });
                        }
                    };
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => {
                        Storage.evidence._disabled = true;
                        resolve(null);
                    };
                } catch (e) {
                    Storage.evidence._disabled = true;
                    resolve(null);
                }
            });

            return Storage.evidence._openPromise;
        },

        _tx: async (mode = 'readonly') => {
            const db = await Storage.evidence._openDB();
            if (!db) return null;
            try {
                return db.transaction(Storage.evidence.STORE_NAME, mode).objectStore(Storage.evidence.STORE_NAME);
            } catch (e) {
                return null;
            }
        },

        get: async (sourceUrl) => {
            const norm = Storage.evidence._normalizeUrl(sourceUrl);
            if (!norm) return null;
            const store = await Storage.evidence._tx('readonly');
            if (!store) return null;
            return new Promise((resolve) => {
                const req = store.get(norm);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        },

        upsert: async (payload = {}) => {
            const sourceUrl = Storage.evidence._normalizeUrl(payload.sourceUrl || '');
            if (!sourceUrl) return false;

            const store = await Storage.evidence._tx('readwrite');
            if (!store) return false;

            const now = Date.now();
            const sourceText = Storage.evidence._compactText(payload.sourceText || '', 5000);
            const snippet = Storage.evidence._compactText(payload.sourceText || payload.snippet || '', 280);
            const reportPath = Array.isArray(payload.reportPath) ? payload.reportPath.filter(Boolean) : [];

            return new Promise((resolve) => {
                const getReq = store.get(sourceUrl);
                getReq.onerror = () => resolve(false);
                getReq.onsuccess = () => {
                    const prev = getReq.result || {
                        sourceUrl,
                        capturedAt: now,
                        updatedAt: now,
                        captureCount: 0,
                        sourceOwner: '',
                        sourceChannel: '',
                        lastEventType: '',
                        lastAccountId: '',
                        textHash: '',
                        snippet: '',
                        fullText: '',
                        sampleTexts: [],
                        reportPaths: {},
                        accountIds: [],
                    };

                    const next = { ...prev };
                    next.updatedAt = now;
                    next.captureCount = (prev.captureCount || 0) + 1;
                    if (!next.capturedAt) next.capturedAt = now;
                    if (payload.sourceOwner) next.sourceOwner = payload.sourceOwner;
                    if (payload.sourceChannel) next.sourceChannel = payload.sourceChannel;
                    if (payload.eventType) next.lastEventType = payload.eventType;
                    if (payload.accountId) next.lastAccountId = payload.accountId;

                    if (snippet) next.snippet = snippet;
                    if (sourceText) {
                        next.fullText = sourceText;
                        next.textHash = Storage.evidence._hashText(sourceText);
                    } else if (snippet && !next.textHash) {
                        next.textHash = Storage.evidence._hashText(snippet);
                    }

                    next.sampleTexts = Array.isArray(next.sampleTexts) ? next.sampleTexts : [];
                    if (snippet) Storage.evidence._safeArrayPushUnique(next.sampleTexts, snippet, 8);

                    next.accountIds = Array.isArray(next.accountIds) ? next.accountIds : [];
                    if (payload.accountId) Storage.evidence._safeArrayPushUnique(next.accountIds, payload.accountId, 180);

                    next.reportPaths = (next.reportPaths && typeof next.reportPaths === 'object') ? next.reportPaths : {};
                    if (reportPath.length > 0) {
                        const pathKey = reportPath.join(' > ');
                        next.reportPaths[pathKey] = (next.reportPaths[pathKey] || 0) + 1;
                    }

                    const putReq = store.put(next);
                    putReq.onerror = () => resolve(false);
                    putReq.onsuccess = () => {
                        Storage.evidence._updateIndexMap(next);
                        Storage.evidence._maybePrune();
                        resolve(true);
                    };
                };
            });
        },

        prune: async () => {
            const now = Date.now();
            const cutoff = now - (Storage.evidence.RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const map = Storage.evidence._getIndexMap();
            const sorted = Object.entries(map).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));

            const keptEntries = sorted
                .filter(([, item], idx) => {
                    const updatedAt = item?.updatedAt || item?.capturedAt || 0;
                    if (idx >= Storage.evidence.MAX_DB_ITEMS) return false;
                    if (updatedAt > 0 && updatedAt < cutoff) return false;
                    return true;
                });
            const keptMap = Object.fromEntries(keptEntries);
            Storage.setJSON(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX, keptMap);

            const keepSet = new Set(Object.keys(keptMap));
            const store = await Storage.evidence._tx('readwrite');
            if (!store) return { removed: 0, kept: keepSet.size };

            return new Promise((resolve) => {
                let removed = 0;
                const req = store.openCursor();
                req.onerror = () => resolve({ removed, kept: keepSet.size });
                req.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) {
                        resolve({ removed, kept: keepSet.size });
                        return;
                    }
                    const key = String(cursor.key || '');
                    if (!keepSet.has(key)) {
                        cursor.delete();
                        removed++;
                    }
                    cursor.continue();
                };
            });
        },

        captureFromBlockContext: (accountId, contextOverride = null) => {
            try {
                const ctx = (contextOverride && typeof contextOverride === 'object')
                    ? contextOverride
                    : Storage.getBlockContext(accountId);
                if (!ctx || !ctx.src) return;
                Storage.evidence.upsert({
                    sourceUrl: ctx.src,
                    sourceText: ctx.postText || '',
                    sourceOwner: ctx.postOwner || '',
                    sourceChannel: ctx.reason || 'block',
                    eventType: 'block',
                    accountId: accountId || '',
                }).catch(() => {});
            } catch (e) {}
        },

        captureFromReportHistory: (entry = {}, context = {}) => {
            const sourceUrl = entry.sourceUrl || context.sourceUrl || '';
            if (!sourceUrl) return;
            Storage.evidence.upsert({
                sourceUrl,
                sourceText: context.sourceText || '',
                sourceOwner: context.sourceOwner || '',
                sourceChannel: context.source || entry.source || 'report',
                eventType: 'report',
                accountId: entry.username || '',
                reportPath: Array.isArray(entry.path) ? entry.path : [],
            }).catch(() => {});
        },

        clearAll: async () => {
            Storage.remove(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX);
            if (CONFIG.KEYS.SOURCE_EVIDENCE_PRUNE_AT) Storage.remove(CONFIG.KEYS.SOURCE_EVIDENCE_PRUNE_AT);
            const store = await Storage.evidence._tx('readwrite');
            if (!store) return false;
            return new Promise((resolve) => {
                const req = store.clear();
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            });
        },
    }
};
