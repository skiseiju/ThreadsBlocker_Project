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

            // 跨 tab 防爭搶：worker 在跑、BG_QUEUE 還有人，都 skip
            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const workerActive = bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 30000);
            if (workerActive) {
                console.log('[SweepDriver] tick skipped: another tab worker is running');
                return;
            }
            const bgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            if (bgQueue.length > 0) {
                console.log('[SweepDriver] tick skipped: BG_QUEUE has', bgQueue.length, 'pending users');
                return;
            }

            const lastLock = parseInt(sessionStorage.getItem(SWEEP_KEYS.LOCK) || '0');
            if (Date.now() - lastLock < 5 * 60 * 1000) return;

            // 自動救援：把卡 sweeping > 5 分鐘的 entry 重設為 pending
            const STALE_MS = 5 * 60 * 1000;
            const now = Date.now();
            const queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
            let recovered = 0;
            const cleaned = queue.map(p => {
                if (p && typeof p === 'object' && p.status === 'sweeping' && now - (p.lastSweptAt || 0) > STALE_MS) {
                    recovered++;
                    return { ...p, status: 'pending' };
                }
                return p;
            });
            if (recovered > 0) {
                Storage.setJSON(CONFIG.KEYS.POST_QUEUE, cleaned);
                console.log('[SweepDriver] tick auto-recovered stuck entries:', recovered);
            }

            // 自動清掉 stale WORKER_STANDBY（無 BG_QUEUE 活動 + 無 sweeping entry → 殘留）
            const standbyFlag = Storage.get(SWEEP_KEYS.WORKER_STANDBY);
            if (standbyFlag === 'true') {
                const bgEmpty = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length === 0;
                const noSweeping = !cleaned.some(p => p && p.status === 'sweeping');
                if (bgEmpty && noSweeping) {
                    Storage.remove(SWEEP_KEYS.WORKER_STANDBY);
                    console.log('[SweepDriver] cleared stale WORKER_STANDBY flag');
                }
            }

            const target = Core.SweepDriver.pickTickEntry();
            if (!target) return;

            const entry = Core.SweepDriver.markSweeping(target);
            if (!entry) return;
            UI.showToast('⚠️ [貼文水庫] 偵測到待清理貼文，3 秒後進入掃描模式...', 5000);
            Core.SweepDriver.navigateTo(entry.url, 3000);
        },

        startNow() {
            // 重設所有 advance entry 的卡住狀態
            const queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []).map(entry => {
                if (!entry || typeof entry !== 'object') return entry;
                if (entry.advanceOnComplete === true) {
                    const stuckStates = ['done', 'sweeping', 'cooldown', 'error'];
                    if (stuckStates.includes(entry.status) || entry.done === true) {
                        return { ...entry, status: 'pending', done: false };
                    }
                }
                return entry;
            });
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);

            // 清掉前次 sweep session 殘留（避免狀態衝突）
            Object.values(SWEEP_KEYS).forEach(k => sessionStorage.removeItem(k));
            Storage.remove(SWEEP_KEYS.WORKER_STANDBY);
            Storage.remove(SWEEP_KEYS.STOPPED);

            const entry = Storage.postReservoir.getAll()
                .find(p => p.advanceOnComplete === true && p.status === 'pending');
            if (!entry) {
                UI.showToast('⚠️ 定點絕排程為空，請先在貼文頁加入貼文水庫');
                return;
            }
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

                // === NUCLEAR DIAGNOSTIC ===
                console.log('[SweepDriver] DIAG url:', window.location.href);
                console.log('[SweepDriver] DIAG title:', document.title);
                console.log('[SweepDriver] DIAG body length:', document.body.innerHTML.length);
                console.log('[SweepDriver] DIAG total aria-labels:', document.querySelectorAll('[aria-label]').length);
                console.log('[SweepDriver] DIAG total a tags:', document.querySelectorAll('a').length);
                console.log('[SweepDriver] DIAG article count:', document.querySelectorAll('article').length);
                // 等 3 秒給頁面 hydrate
                await Utils.safeSleep(3000);
                console.log('[SweepDriver] DIAG after 3s wait, aria-labels:', document.querySelectorAll('[aria-label]').length);
                // 列出前 20 個含數字的 aria-label
                const allAria = Array.from(document.querySelectorAll('[aria-label]'))
                    .map(el => ({ tag: el.tagName, label: (el.getAttribute('aria-label') || '').slice(0, 80) }))
                    .filter(x => /\d/.test(x.label) && x.label.length < 80)
                    .slice(0, 20);
                console.log('[SweepDriver] DIAG aria-labels with digit:', JSON.stringify(allAria));
                // 列出前 20 個含「讚」的 element 類型（任何 element）
                const allWithLike = [];
                document.querySelectorAll('*').forEach(el => {
                    if (allWithLike.length >= 20) return;
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text.length > 0 && text.length < 100 && /讚/.test(text)) {
                        allWithLike.push({ tag: el.tagName, role: el.getAttribute('role'), text: text.slice(0, 60) });
                    }
                });
                console.log('[SweepDriver] DIAG elements containing 讚:', JSON.stringify(allWithLike));
                // === END DIAGNOSTIC ===

                UI.showToast('貼文水庫：正在讀取互動名單...', 4000);
                const ctx = await Core.SweepDriver.openEngagementList();
                if (!ctx) {
                    console.log('[SweepDriver] runCurrentPage finalizeEntry path: no ctx');
                    await Core.SweepDriver.finalizeEntry(entry, 'no_list');
                    return;
                }

                const result = await Core.SweepDriver.collectBatch(ctx);
                console.log('[SweepDriver] runCurrentPage collectBatch result', JSON.stringify({
                    usersLength: result.users.length,
                    reason: result.reason,
                }));
                if (!result.users.length) {
                    console.log('[SweepDriver] runCurrentPage finalizeEntry path', JSON.stringify({
                        reason: result.reason || 'exhausted',
                    }));
                    await Core.SweepDriver.finalizeEntry(entry, result.reason || 'exhausted');
                    return;
                }

                console.log('[SweepDriver] runCurrentPage enqueueBatch path', JSON.stringify({
                    usersLength: result.users.length,
                }));
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

            const findLikesLink = () => {
                const directLinks = document.querySelectorAll('a[href*="liked_by"], a[href*="/likes/"]');
                for (const link of directLinks) {
                    if (!link.closest('[role="dialog"]')) {
                        console.log('[SweepDriver] findLikesLink direct href match:', link.getAttribute('href'));
                        return link;
                    }
                }
                const ariaElements = document.querySelectorAll('[aria-label]');
                const ariaCandidates = [];
                for (const el of ariaElements) {
                    if (el.closest('[role="dialog"]')) continue;
                    const label = (el.getAttribute('aria-label') || '').trim();
                    if (!label) continue;
                    const hasLikes = /讚/.test(label) || /\blike(s|d)?\b/i.test(label);
                    const hasDigit = /\d/.test(label);
                    if (hasLikes && hasDigit) {
                        console.log('[SweepDriver] findLikesLink aria-label match:', el.tagName, '–', label.slice(0, 80));
                        return el;
                    }
                    if (hasDigit && label.length < 80) ariaCandidates.push({ tag: el.tagName, label: label.slice(0, 60) });
                }
                const allElements = document.querySelectorAll('a, span, div[role="button"], button');
                const textCandidates = [];
                for (const el of allElements) {
                    if (el.closest('[role="dialog"]')) continue;
                    const text = (el.innerText || el.textContent || '').trim();
                    if (text.length === 0 || text.length > 80) continue;
                    if (/讚/.test(text) || /\blike(s|d)?\b/i.test(text)) {
                        if (/\d/.test(text)) {
                            console.log('[SweepDriver] findLikesLink text match:', el.tagName, '–', text.slice(0, 60));
                            return el;
                        }
                        textCandidates.push({ tag: el.tagName, text: text.slice(0, 60) });
                    }
                }
                return null;
            };

            const findActivityButton = () => {
                // 使用 includes 寬鬆比對（v2.5.2 行為）
                const containers = document.querySelectorAll('article, main, [role="article"], [role="main"]');
                const scopes = containers.length > 0 ? Array.from(containers) : [document];
                for (const scope of scopes) {
                    const spans = scope.querySelectorAll('div[role="button"] span[dir="auto"], span[role="link"], a[role="link"] span[dir="auto"]');
                    for (const span of spans) {
                        const text = (span.innerText || span.textContent || '').trim();
                        if (CONFIG.ACTIVITY_TEXTS.some(t => text.includes(t))) {
                            console.log('[SweepDriver] findActivityButton match:', text);
                            return span.closest('div[role="button"], a[role="link"], span[role="link"]');
                        }
                    }
                }
                return null;
            };

            // === Strategy 1：Activity（查看動態）→ 按讚內容（v2.5.2 行為）===
            let activityButton = null;
            for (let i = 0; i < 60; i++) {
                activityButton = findActivityButton();
                if (activityButton) break;
                await Utils.safeSleep(500);
            }

            if (activityButton) {
                console.log('[SweepDriver] Strategy 1: clicking Activity button. URL before:', window.location.href, '. dialog count:', document.querySelectorAll('[role="dialog"]').length);
                Utils.simClick(activityButton);
                await Utils.safeSleep(800);
                console.log('[SweepDriver] After Activity click. URL after:', window.location.href, '. dialog count:', document.querySelectorAll('[role="dialog"]').length);

                // 等 dialog 出現（最多 10 秒）
                let dialogCtx = null;
                for (let i = 0; i < 20; i++) {
                    await Utils.safeSleep(500);
                    const ctx = Core.getTopContext();
                    if (ctx && ctx !== document.body) { dialogCtx = ctx; break; }
                }

                if (dialogCtx) {
                    const dialogChildren = Array.from(dialogCtx.children).map(c => c.tagName + (c.getAttribute('role') ? '['+c.getAttribute('role')+']' : ''));
                    console.log('[SweepDriver] Activity dialog opened. children:', JSON.stringify(dialogChildren.slice(0, 10)), 'spans:', dialogCtx.querySelectorAll('span').length, 'tabs:', dialogCtx.querySelectorAll('[role="tab"]').length, 'text snippet:', (dialogCtx.innerText || '').slice(0, 200));

                    // 找「按讚內容」tab 並點擊（最多 20 秒，掃描所有 dialog）
                    let likesTab = null;
                    let foundInDialog = null;
                    for (let i = 0; i < 40; i++) {
                        const allDialogs = document.querySelectorAll('[role="dialog"]');
                        for (const d of allDialogs) {
                            const tab = Core.SweepDriver.findLikesTab(d);
                            if (tab) { likesTab = tab; foundInDialog = d; break; }
                        }
                        if (likesTab) break;

                        // 5/15/25 次失敗時 dump 所有 dialog 結構幫診斷
                        if (i === 5 || i === 15 || i === 25) {
                            const dialogStates = Array.from(allDialogs).map((d, idx) => ({
                                idx,
                                spans: d.querySelectorAll('span').length,
                                tabs: d.querySelectorAll('[role="tab"]').length,
                                buttons: d.querySelectorAll('[role="button"]').length,
                                textSnippet: (d.innerText || '').slice(0, 150),
                                outerHTMLSnippet: d.outerHTML.slice(0, 300),
                            }));
                            console.log('[SweepDriver] findLikesTab still searching, all dialogs:', JSON.stringify(dialogStates));
                        }

                        await Utils.safeSleep(500);
                    }
                    if (likesTab) {
                        console.log('[SweepDriver] findLikesTab found in dialog #' + Array.from(document.querySelectorAll('[role="dialog"]')).indexOf(foundInDialog));
                        Utils.simClick(likesTab);

                        // 等 user 連結載入（最多 20 秒，含 lazy scroll）
                        const finalCtx = Core.getTopContext();
                        const scrollBoxForLazy = Core.SweepDriver.findScrollBox(finalCtx);
                        for (let i = 0; i < 40; i++) {
                            if (finalCtx.querySelectorAll('a[href*="/@"]').length > 0) break;
                            if (i === 5 || i === 15 || i === 25) {
                                scrollBoxForLazy.scrollBy({ top: 200, behavior: 'auto' });
                            }
                            await Utils.safeSleep(500);
                        }
                        const userCount = finalCtx.querySelectorAll('a[href*="/@"]').length;
                        console.log('[SweepDriver] openEngagementList ready – userLinks:', userCount);
                        if (userCount > 0) return finalCtx;
                        console.log('[SweepDriver] Activity dialog 內 0 user 連結，fallback 到 Strategy 2');
                    } else {
                        console.log('[SweepDriver] findLikesTab failed after 20s in Activity dialog – fallback to Strategy 2');
                    }
                } else {
                    console.log('[SweepDriver] Activity click 後 dialog 沒出現，fallback 到 Strategy 2');
                }
            }

            // === Strategy 2 (fallback)：直接點按讚連結 ===
            let likesLink = null;
            for (let i = 0; i < 20; i++) {
                likesLink = findLikesLink();
                if (likesLink) break;
                await Utils.safeSleep(500);
            }
            if (!likesLink) {
                console.log('[SweepDriver] Both strategies failed – aborting');
                UI.showToast('⚠️ 找不到「按讚名單」入口，已停止本次掃描', 5000);
                return null;
            }
            Utils.simClick(likesLink);
            for (let i = 0; i < 40; i++) {
                await Utils.safeSleep(500);
                const ctx = Core.getTopContext();
                if (ctx && ctx !== document.body && ctx.querySelectorAll('a[href*="/@"]').length > 0) return ctx;
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
            // diagnostic: findLikesTab 找不到 likes tab 時，dump 所有可用的 span 文字
            const allTexts = Array.from(ctx.querySelectorAll('span[dir="auto"]'))
                .map(s => (s.innerText || s.textContent || '').trim())
                .filter(t => t.length > 0 && t.length < 40)
                .slice(0, 30);
            console.log('[SweepDriver] findLikesTab no match. Available span texts:', JSON.stringify(allTexts));
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
            const collectedLinks = new Set();
            const scrollBox = Core.SweepDriver.findScrollBox(ctx);
            console.log('[SweepDriver] collectBatch scrollBox selected', JSON.stringify({
                sameAsCtx: scrollBox === ctx,
                scrollHeight: scrollBox.scrollHeight,
                clientHeight: scrollBox.clientHeight,
            }));

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

            let prevSize = 0;
            let stallCount = 0;
            for (let i = 0; i < 50; i++) {
                collectVisible();
                if (collectedLinks.size === prevSize) {
                    stallCount++;
                    if (stallCount >= 4) break; // 4 連續無新進度 → 收工（節省時間）
                } else {
                    stallCount = 0;
                    prevSize = collectedLinks.size;
                }
                if (i > 0) scrollBox.scrollBy({ top: 400, behavior: 'auto' });
                await Utils.safeSleep(350);
            }
            console.log('[SweepDriver] collectBatch collection loop finished', JSON.stringify({
                collectedLinksSize: collectedLinks.size,
            }));

            const skipUsers = Core.buildSkipUsers(ctx);
            console.log('[SweepDriver] collectBatch skipUsers built', JSON.stringify({
                skipUsers: [...skipUsers],
            }));
            let rawUsers = [...collectedLinks].filter(u => !skipUsers.has(u));
            console.log('[SweepDriver] collectBatch after skipUsers filter', JSON.stringify({
                rawUsersLength: rawUsers.length,
            }));
            rawUsers = Core.filterNewUsers(rawUsers);
            console.log('[SweepDriver] collectBatch after filterNewUsers', JSON.stringify({
                rawUsersLength: rawUsers.length,
            }));

            const processedSetKey = 'hege_sweep_processed_' + window.location.pathname;
            const processedList = Storage.getJSON(processedSetKey, []);
            const processedSet = new Set(processedList);

            if (rawUsers.length > 0 && rawUsers.every(u => processedSet.has(u))) {
                console.log('[SweepDriver] collectBatch return empty', JSON.stringify({
                    reason: 'processed_loop',
                    collectedLinksSize: collectedLinks.size,
                    rawUsersLength: rawUsers.length,
                    processedSetSize: processedSet.size,
                }));
                return { users: [], reason: 'processed_loop' };
            }

            const newUsers = rawUsers.filter(u => !processedSet.has(u));
            console.log('[SweepDriver] collectBatch after processedSet compare', JSON.stringify({
                processedSetSize: processedSet.size,
                newUsersLength: newUsers.length,
            }));
            if (newUsers.length === 0) {
                console.log('[SweepDriver] collectBatch return empty', JSON.stringify({
                    reason: 'exhausted',
                    collectedLinksSize: collectedLinks.size,
                    rawUsersLength: rawUsers.length,
                    processedSetSize: processedSet.size,
                }));
                return { users: [], reason: 'exhausted' };
            }

            const lastFirst = sessionStorage.getItem(SWEEP_KEYS.LAST_FIRST_USER);
            const shouldCompareFirst = sessionStorage.getItem(SWEEP_KEYS.AUTO_TRIGGERED_ONCE) === 'true';
            if (shouldCompareFirst && lastFirst && lastFirst === newUsers[0]) {
                console.log('[SweepDriver] collectBatch return empty', JSON.stringify({
                    reason: 'first_user_loop',
                    lastFirst,
                    firstNewUser: newUsers[0],
                    newUsersLength: newUsers.length,
                    processedSetSize: processedSet.size,
                }));
                return { users: [], reason: 'first_user_loop' };
            }

            const batchUsers = newUsers;
            const lastBatchKey = 'hege_sweep_last_batch_' + window.location.pathname;
            const lastBatchStr = sessionStorage.getItem(lastBatchKey);
            if (lastBatchStr && batchUsers.length > 0) {
                try {
                    const lastBatch = JSON.parse(lastBatchStr);
                    const intersection = batchUsers.filter(u => lastBatch.includes(u));
                    const overlapRate = intersection.length / batchUsers.length;
                    if (overlapRate > 0.8) {
                        console.error('[SweepDriver] Loop breaker triggered.', { lastBatch, batchUsers });
                        console.log('[SweepDriver] collectBatch return empty', {
                            reason: 'batch_overlap_loop',
                            overlapRate,
                            intersectionLength: intersection.length,
                            batchUsersLength: batchUsers.length,
                            processedSetSize: processedSet.size,
                        });
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

            // 移除條件：longTermLoop 為 false（無論 advance 開不開都不需要留 entry）
            const shouldRemove = !fresh.longTermLoop;
            if (shouldRemove) {
                Storage.postReservoir.removeEntry(cleanUrl);
            } else {
                // 留著：longTermLoop=true 的 entry（單純深層清理 / advance+loop 雙 flag）
                Core.SweepDriver.updateEntry(cleanUrl, p => ({
                    ...p,
                    status: 'done',
                    lastSweptAt: now,
                }));
            }

            // 純單次任務（兩個 flag 都關）：移除完直接收工
            if (!fresh.advanceOnComplete && !fresh.longTermLoop) {
                Core.SweepDriver.clearTransientState();
                UI.showToast('✅ 貼文水庫單次任務完成，已移除 entry。');
                return;
            }

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
