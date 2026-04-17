// 貼文水庫 Phase 2 單一執行引擎
import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { UI } from '../ui.js';
import { Utils } from '../utils.js';
import { Core } from '../core.js';

const SWEEP_KEYS = {
    STATE: 'hege_sweep_state',
    TARGET: 'hege_sweep_target',
    LAST_FIRST_USER: 'hege_sweep_last_first_user',
    AUTO_TRIGGERED_ONCE: 'hege_sweep_auto_triggered_once',
    WAIT_STARTED_AT: 'hege_sweep_wait_started_at',
    LOCK: 'hege_sweep_lock',
    WORKER_STANDBY: 'hege_sweep_worker_standby',
    STOPPED: 'hege_sweep_stopped',
};

const SWEEP_STATE = {
    RELOADING: 'RELOADING',
    SCANNING: 'SCANNING',
    WAIT_FOR_BG: 'WAIT_FOR_BG',
};

Object.assign(Core, {
    SweepDriver: {
        _drainTimer: null,
        _running: false,

        keys: SWEEP_KEYS,

        norm(url) {
            return Storage.postReservoir._norm(url);
        },

        cleanCurrentUrl() {
            const url = new URL(window.location.href);
            url.searchParams.delete('hege_sweep');
            url.searchParams.delete('hege_post_sweep');
            return url.toString().split('?')[0];
        },

        cleanupUrlParams() {
            const url = new URL(window.location.href);
            const hadParam = url.searchParams.has('hege_sweep') || url.searchParams.has('hege_post_sweep');
            url.searchParams.delete('hege_sweep');
            url.searchParams.delete('hege_post_sweep');
            if (hadParam) {
                history.replaceState(null, '', url.pathname + url.search + url.hash);
            }
        },

        getBatchSize() {
            const userBatch = parseInt(Storage.get(CONFIG.KEYS.SWEEP_BATCH_SIZE));
            if (userBatch && userBatch > 0) return userBatch;
            return CONFIG.SWEEP_BATCH_SIZE_DEFAULT || CONFIG.ENDLESS_BATCH_SIZE || 100;
        },

        getEntry(url) {
            return Storage.postReservoir.getByUrl(url);
        },

        updateEntry(url, updater) {
            const cleanUrl = Core.SweepDriver.norm(url);
            const queue = Storage.postReservoir.getAll();
            const idx = queue.findIndex(p => Core.SweepDriver.norm(p.url) === cleanUrl);
            if (idx < 0) return null;
            const next = updater({ ...queue[idx] });
            if (!next) {
                queue.splice(idx, 1);
            } else {
                queue[idx] = { ...next, url: cleanUrl };
            }
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
            return next;
        },

        markSweeping(entry) {
            const now = Date.now();
            return Core.SweepDriver.updateEntry(entry.url, p => ({
                ...p,
                status: 'sweeping',
                lastSweptAt: now,
            }));
        },

        isRunning() {
            const state = sessionStorage.getItem(SWEEP_KEYS.STATE);
            return Storage.get(SWEEP_KEYS.WORKER_STANDBY) === 'true'
                || [SWEEP_STATE.RELOADING, SWEEP_STATE.SCANNING, SWEEP_STATE.WAIT_FOR_BG].includes(state);
        },

        clearTransientState() {
            if (Core.SweepDriver._drainTimer) {
                clearInterval(Core.SweepDriver._drainTimer);
                Core.SweepDriver._drainTimer = null;
            }
            sessionStorage.removeItem(SWEEP_KEYS.STATE);
            sessionStorage.removeItem(SWEEP_KEYS.TARGET);
            sessionStorage.removeItem(SWEEP_KEYS.LAST_FIRST_USER);
            sessionStorage.removeItem(SWEEP_KEYS.AUTO_TRIGGERED_ONCE);
            sessionStorage.removeItem(SWEEP_KEYS.WAIT_STARTED_AT);
            Storage.remove(SWEEP_KEYS.WORKER_STANDBY);
            Storage.remove(SWEEP_KEYS.STOPPED);
        },

        clearLoopStateForCurrentPost() {
            const path = window.location.pathname;
            Storage.remove('hege_sweep_processed_' + path);
            sessionStorage.removeItem('hege_sweep_last_batch_' + path);
            sessionStorage.removeItem(SWEEP_KEYS.LAST_FIRST_USER);
            sessionStorage.removeItem(SWEEP_KEYS.AUTO_TRIGGERED_ONCE);
        },

        navigateTo(url, delay = 0) {
            const target = new URL(url, window.location.origin);
            target.searchParams.set('hege_sweep', 'true');
            const targetPath = target.pathname + target.search + target.hash;
            sessionStorage.setItem(SWEEP_KEYS.LOCK, Date.now().toString());
            sessionStorage.setItem(SWEEP_KEYS.STATE, SWEEP_STATE.RELOADING);
            sessionStorage.setItem(SWEEP_KEYS.TARGET, target.toString().split('?')[0]);
            const go = () => {
                history.replaceState(null, '', targetPath);
                location.reload();
            };
            if (delay > 0) setTimeout(go, delay);
            else go();
        },

        pickTickEntry() {
            const now = Date.now();
            const cooldownMs = CONFIG.POST_SWEEP_COOLDOWN_HOURS * 60 * 60 * 1000;
            const entries = Storage.postReservoir.getAll();
            return entries.find(p => p.status === 'pending')
                || entries.find(p => p.status === 'cooldown' && (now - (p.lastSweptAt || 0)) >= cooldownMs)
                || entries.find(p => p.status === 'done' && p.longTermLoop === true && (now - (p.lastSweptAt || 0)) >= cooldownMs)
                || null;
        },

        tick() {
            if (Core.SweepDriver.isRunning()) return;
            const lastLock = parseInt(sessionStorage.getItem(SWEEP_KEYS.LOCK) || '0');
            if (Date.now() - lastLock < 5 * 60 * 1000) return;

            const target = Core.SweepDriver.pickTickEntry();
            if (!target) return;

            const entry = Core.SweepDriver.markSweeping(target);
            if (!entry) return;
            UI.showToast('⚠️ [貼文水庫] 偵測到待清理貼文，3 秒後進入掃描模式...', 5000);
            Core.SweepDriver.navigateTo(entry.url, 3000);
        },

        startNow() {
            const entry = Storage.postReservoir.getAll()
                .find(p => p.advanceOnComplete === true && p.status === 'pending');
            if (!entry) {
                UI.showToast('⚠️ 定點絕排程為空，請先在貼文頁加入貼文水庫');
                return;
            }
            Storage.remove(SWEEP_KEYS.STOPPED);
            Core.SweepDriver.clearLoopStateForCurrentPost();
            const next = Core.SweepDriver.markSweeping(entry);
            if (!next) return;
            UI.showToast(`🚀 貼文水庫啟動，前往：${next.label || next.url}`, 3000);
            Core.SweepDriver.navigateTo(next.url, 1000);
        },

        async runCurrentPage() {
            if (Core.SweepDriver._running) return;
            Core.SweepDriver._running = true;
            try {
                Core.SweepDriver.cleanupUrlParams();
                const currentUrl = Core.SweepDriver.cleanCurrentUrl();
                let entry = Core.SweepDriver.getEntry(currentUrl);
                if (!entry) {
                    UI.showToast('⚠️ 找不到此貼文的水庫 entry，已停止本次掃描。');
                    Core.SweepDriver.clearTransientState();
                    return;
                }

                entry = Core.SweepDriver.markSweeping(entry) || entry;
                sessionStorage.setItem(SWEEP_KEYS.STATE, SWEEP_STATE.SCANNING);
                sessionStorage.setItem(SWEEP_KEYS.TARGET, currentUrl);

                UI.showToast('貼文水庫：正在讀取互動名單...', 4000);
                const ctx = await Core.SweepDriver.openEngagementList();
                if (!ctx) {
                    await Core.SweepDriver.finalizeEntry(entry, 'no_list');
                    return;
                }

                const result = await Core.SweepDriver.collectBatch(ctx);
                if (!result.users.length) {
                    await Core.SweepDriver.finalizeEntry(entry, result.reason || 'exhausted');
                    return;
                }

                Core.SweepDriver.enqueueBatch(entry, result.users);
            } catch (err) {
                console.error('[SweepDriver] runCurrentPage failed:', err);
                const currentUrl = Core.SweepDriver.cleanCurrentUrl();
                Core.SweepDriver.updateEntry(currentUrl, p => ({ ...p, status: 'error' }));
                Core.SweepDriver.clearTransientState();
                UI.showToast('⚠️ 貼文水庫掃描發生錯誤，已標記為異常。');
            } finally {
                Core.SweepDriver._running = false;
            }
        },

        async openEngagementList() {
            const existingDialog = Core.getTopContext();
            if (existingDialog && existingDialog !== document.body) return existingDialog;

            const findActivityButton = () => {
                const spans = document.querySelectorAll('div[role="button"] span[dir="auto"], span[role="link"], a[role="link"] span[dir="auto"]');
                for (const span of spans) {
                    const text = (span.innerText || span.textContent || '').trim();
                    if (CONFIG.ACTIVITY_TEXTS.some(t => text.includes(t))) {
                        return span.closest('div[role="button"], a[role="link"], span[role="link"]');
                    }
                }
                const links = document.querySelectorAll('a[href*="/likes/"], a[href*="/quotes/"], a[href*="/reposts/"], a[href*="liked_by"]');
                if (links[0]) return links[0];
                const roleLinks = document.querySelectorAll('a[role="link"], span[role="link"]');
                for (const link of roleLinks) {
                    const text = (link.innerText || link.textContent || '').trim().toLowerCase();
                    if (/\d+.*?(讚|like)/i.test(text) && !link.closest('[role="dialog"]')) return link;
                }
                return null;
            };

            let target = null;
            for (let i = 0; i < 60; i++) {
                target = findActivityButton();
                if (target) break;
                await Utils.safeSleep(500);
            }
            if (!target) return null;

            Utils.simClick(target);
            await Utils.safeSleep(1200);

            for (let i = 0; i < 40; i++) {
                const ctx = Core.getTopContext();
                if (ctx && ctx !== document.body) {
                    const likesTab = Core.SweepDriver.findLikesTab(ctx);
                    if (likesTab) {
                        Utils.simClick(likesTab);
                        await Utils.safeSleep(1000);
                    }
                    return Core.getTopContext();
                }
                await Utils.safeSleep(500);
            }
            return null;
        },

        findLikesTab(ctx) {
            const spans = ctx.querySelectorAll('span[dir="auto"]');
            for (const span of spans) {
                const text = (span.innerText || span.textContent || '').trim();
                if (CONFIG.LIKES_TAB_TEXTS.some(t => text === t)) {
                    return span.closest('div[role="tab"], div[role="button"], div[class*="x6s0dn4"][class*="x1qv9dbp"]');
                }
            }
            return null;
        },

        findScrollBox(ctx) {
            let scrollBox = ctx;
            if (ctx.scrollHeight === ctx.clientHeight) {
                const innerBoxes = ctx.querySelectorAll('div');
                for (const box of innerBoxes) {
                    if (box.scrollHeight > box.clientHeight && window.getComputedStyle(box).overflowY !== 'hidden') {
                        scrollBox = box;
                        break;
                    }
                }
            }
            return scrollBox;
        },

        async collectBatch(ctx) {
            const batchSize = Core.SweepDriver.getBatchSize();
            const collectedLinks = new Set();
            const scrollBox = Core.SweepDriver.findScrollBox(ctx);

            const collectVisible = () => {
                const links = ctx.querySelectorAll('a[href^="/@"]');
                Array.from(links).forEach(a => {
                    const rect = a.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0 && rect.right > 0;
                    const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                    if (!isVisible || isHeaderLink) return;
                    const href = a.getAttribute('href');
                    const user = href && href.includes('/@') ? href.split('/@')[1].split('/')[0] : '';
                    if (user) collectedLinks.add(user);
                });
            };

            for (let i = 0; i < 50; i++) {
                collectVisible();
                if (collectedLinks.size >= batchSize) break;
                if (i > 0) scrollBox.scrollBy({ top: 300, behavior: 'smooth' });
                await Utils.safeSleep(600);
            }

            const skipUsers = Core.buildSkipUsers(ctx);
            let rawUsers = [...collectedLinks].filter(u => !skipUsers.has(u));
            rawUsers = Core.filterNewUsers(rawUsers);

            const processedSetKey = 'hege_sweep_processed_' + window.location.pathname;
            const processedList = Storage.getJSON(processedSetKey, []);
            const processedSet = new Set(processedList);

            if (rawUsers.length > 0 && rawUsers.every(u => processedSet.has(u))) {
                return { users: [], reason: 'processed_loop' };
            }

            const newUsers = rawUsers.filter(u => !processedSet.has(u));
            if (newUsers.length === 0) return { users: [], reason: 'exhausted' };

            const lastFirst = sessionStorage.getItem(SWEEP_KEYS.LAST_FIRST_USER);
            const shouldCompareFirst = sessionStorage.getItem(SWEEP_KEYS.AUTO_TRIGGERED_ONCE) === 'true';
            if (shouldCompareFirst && lastFirst && lastFirst === newUsers[0]) {
                return { users: [], reason: 'first_user_loop' };
            }

            const batchUsers = newUsers.slice(0, batchSize);
            const lastBatchKey = 'hege_sweep_last_batch_' + window.location.pathname;
            const lastBatchStr = sessionStorage.getItem(lastBatchKey);
            if (lastBatchStr && batchUsers.length > 0) {
                try {
                    const lastBatch = JSON.parse(lastBatchStr);
                    const intersection = batchUsers.filter(u => lastBatch.includes(u));
                    const overlapRate = intersection.length / batchUsers.length;
                    if (overlapRate > 0.8) {
                        console.error('[SweepDriver] Loop breaker triggered.', { lastBatch, batchUsers });
                        return { users: [], reason: 'batch_overlap_loop' };
                    }
                } catch (e) {}
            }

            Storage.setJSON(processedSetKey, [...new Set([...processedList, ...batchUsers])]);
            sessionStorage.setItem(lastBatchKey, JSON.stringify(batchUsers));
            sessionStorage.setItem(SWEEP_KEYS.LAST_FIRST_USER, batchUsers[0]);
            sessionStorage.setItem(SWEEP_KEYS.AUTO_TRIGGERED_ONCE, 'true');
            return { users: batchUsers, reason: 'batch' };
        },

        enqueueBatch(entry, batchUsers) {
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set([...activeQueue, ...batchUsers])]);

            Storage.set(CONFIG.KEYS.BLOCK_CONTEXT, JSON.stringify({
                src: Core.SweepDriver.cleanCurrentUrl(),
                reason: 'likes',
                postText: Utils.getPostText(),
                postOwner: Utils.getPostOwner() || '',
            }));
            Storage.set(CONFIG.KEYS.CURRENT_BATCH_ID, 'b_' + Date.now());

            Core.SweepDriver.updateEntry(entry.url, p => ({
                ...p,
                status: 'sweeping',
                batchCount: (p.batchCount || 0) + 1,
                totalBlocked: (p.totalBlocked || 0) + batchUsers.length,
                sweepCount: (p.sweepCount || 0) + 1,
                lastSweptAt: Date.now(),
            }));

            sessionStorage.setItem(SWEEP_KEYS.STATE, SWEEP_STATE.WAIT_FOR_BG);
            sessionStorage.setItem(SWEEP_KEYS.TARGET, Core.SweepDriver.cleanCurrentUrl());
            sessionStorage.setItem(SWEEP_KEYS.WAIT_STARTED_AT, Date.now().toString());
            Storage.set(SWEEP_KEYS.WORKER_STANDBY, 'true');
            Core.updateControllerUI();
            UI.showToast(`[貼文水庫] 已抓取 ${batchUsers.length} 人，送入背景水庫執行。`);

            Storage.remove(CONFIG.KEYS.BG_CMD);
            Core.runSameTabWorker([]);
        },

        waitForWorkerDrain() {
            if (Core.SweepDriver._drainTimer) clearInterval(Core.SweepDriver._drainTimer);
            const maxWaitMs = 10 * 60 * 1000;
            if (!sessionStorage.getItem(SWEEP_KEYS.WAIT_STARTED_AT)) {
                sessionStorage.setItem(SWEEP_KEYS.WAIT_STARTED_AT, Date.now().toString());
            }

            const finishWithError = (message, details = {}) => {
                if (Core.SweepDriver._drainTimer) clearInterval(Core.SweepDriver._drainTimer);
                Core.SweepDriver._drainTimer = null;
                Storage.remove(SWEEP_KEYS.WORKER_STANDBY);
                const target = sessionStorage.getItem(SWEEP_KEYS.TARGET) || Core.SweepDriver.cleanCurrentUrl();
                console.warn(message, details);
                const entry = Core.SweepDriver.getEntry(target) || { url: target };
                Core.SweepDriver.finalizeEntry(entry, 'error');
            };

            const check = () => {
                if (sessionStorage.getItem(SWEEP_KEYS.STATE) !== SWEEP_STATE.WAIT_FOR_BG) {
                    if (Core.SweepDriver._drainTimer) clearInterval(Core.SweepDriver._drainTimer);
                    Core.SweepDriver._drainTimer = null;
                    return;
                }

                if (Storage.get(SWEEP_KEYS.STOPPED) === 'true') {
                    Core.SweepDriver.clearTransientState();
                    UI.showToast('✅ 貼文水庫已停止。');
                    return;
                }

                const waitStartedAt = parseInt(sessionStorage.getItem(SWEEP_KEYS.WAIT_STARTED_AT) || '0');
                if (waitStartedAt && Date.now() - waitStartedAt > maxWaitMs) {
                    finishWithError('[SweepDriver] waitForWorkerDrain timed out; marking entry as error', {
                        waitedMs: Date.now() - waitStartedAt,
                    });
                    return;
                }

                Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                Storage.invalidate(CONFIG.KEYS.BG_STATUS);
                Storage.invalidate(CONFIG.KEYS.VERIFY_PENDING);
                Storage.invalidate(CONFIG.KEYS.BATCH_VERIFY);
                const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                const verifyPending = Storage.get(CONFIG.KEYS.VERIFY_PENDING);
                const batchVerify = Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []);
                const workerStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
                if (workerStatus.state === 'paused' || workerStatus.state === 'error') {
                    finishWithError('[SweepDriver] Worker ended abnormally while waiting for drain', {
                        state: workerStatus.state,
                        current: workerStatus.current || '',
                    });
                    return;
                }
                if (queue.length > 0) return;
                if (verifyPending !== null) return;
                if (batchVerify.length > 0) return;

                if (Core.SweepDriver._drainTimer) clearInterval(Core.SweepDriver._drainTimer);
                Core.SweepDriver._drainTimer = null;
                Storage.remove(SWEEP_KEYS.WORKER_STANDBY);

                const target = sessionStorage.getItem(SWEEP_KEYS.TARGET) || Core.SweepDriver.cleanCurrentUrl();
                UI.showToast('[貼文水庫] 單批完成，重新整理同篇貼文抓取下一批...', 4000);
                Core.SweepDriver.navigateTo(target, 1500);
            };

            check();
            if (!Core.SweepDriver._drainTimer && sessionStorage.getItem(SWEEP_KEYS.STATE) === SWEEP_STATE.WAIT_FOR_BG) {
                Core.SweepDriver._drainTimer = setInterval(check, 3000);
            }
        },

        recordHistory(entry) {
            if (!entry.advanceOnComplete) return;
            const hist = Storage.getJSON(CONFIG.KEYS.ENDLESS_HISTORY, []);
            hist.push({
                url: entry.url,
                label: entry.label || entry.url,
                completedAt: Date.now(),
                totalBatches: entry.batchCount || 0,
                totalBlocked: entry.totalBlocked || 0,
            });
            Storage.setJSON(CONFIG.KEYS.ENDLESS_HISTORY, hist);
        },

        findNextAdvance(currentUrl) {
            const clean = Core.SweepDriver.norm(currentUrl);
            return Storage.postReservoir.getAll()
                .find(p => p.advanceOnComplete === true
                    && Core.SweepDriver.norm(p.url) !== clean
                    && p.status === 'pending') || null;
        },

        async finalizeEntry(entry, reason) {
            const cleanUrl = Core.SweepDriver.norm(entry.url || Core.SweepDriver.cleanCurrentUrl());
            const fresh = Core.SweepDriver.getEntry(cleanUrl) || entry;
            const now = Date.now();

            Core.SweepDriver.clearLoopStateForCurrentPost();
            if (reason === 'error') {
                Core.SweepDriver.updateEntry(cleanUrl, p => ({
                    ...p,
                    status: 'error',
                    lastSweptAt: now,
                }));
                Core.SweepDriver.clearTransientState();
                UI.showToast('⚠️ 貼文水庫背景封鎖異常，已標記為錯誤。');
                Core.updateControllerUI();
                return;
            }
            Core.SweepDriver.recordHistory(fresh);

            if (!fresh.advanceOnComplete && !fresh.longTermLoop) {
                Storage.postReservoir.removeEntry(cleanUrl);
                Core.SweepDriver.clearTransientState();
                UI.showToast('✅ 貼文水庫單次任務完成，已移除 entry。');
                return;
            }

            Core.SweepDriver.updateEntry(cleanUrl, p => ({
                ...p,
                status: 'done',
                lastSweptAt: now,
            }));

            const shouldAdvance = fresh.advanceOnComplete === true;
            const next = shouldAdvance ? Core.SweepDriver.findNextAdvance(cleanUrl) : null;
            if (next) {
                const marked = Core.SweepDriver.markSweeping(next) || next;
                UI.showToast(`✅ 本篇完成，切換到下一篇：${marked.label || marked.url}`, 3000);
                Core.SweepDriver.navigateTo(marked.url, 1000);
                return;
            }

            Core.SweepDriver.clearTransientState();
            if (fresh.longTermLoop) {
                UI.showToast(`✅ 本輪貼文水庫完成，8 小時後自動回訪。${reason ? ` (${reason})` : ''}`, 5000);
            } else {
                UI.showToast('✅ 定點絕全部排程已完成！', 5000);
            }
            Core.updateControllerUI();
        },
    },
});
