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
    // worker 呼叫：從 BLOCK_CONTEXT + CURRENT_BATCH_ID 組 metadata 寫入 block DB
    addToBlockDBFromContext: (username) => {
        const ctx = JSON.parse(Storage.get(CONFIG.KEYS.BLOCK_CONTEXT) || '{}');
        Storage.addToBlockDB(username, {
            src: ctx.src || '',
            reason: ctx.reason || 'manual',
            postText: ctx.postText || '',
            postOwner: ctx.postOwner || '',
            batch: Storage.get(CONFIG.KEYS.CURRENT_BATCH_ID) || ''
        });
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
    }
};
