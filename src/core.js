import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';
import { UI } from './ui.js';
import { Reporter } from './reporter.js';

export const Core = {
    blockQueue: new Set(),
    pendingUsers: new Set(),
    lastClickedBtn: null, // Track for shift-click
    lastClickedUsername: null, // Fallback if DOM node is lost
    lastClickedState: null, // null, 'checked', or 'unchecked'

    buildSkipUsers: (ctx) => {
        const skipUsers = new Set();
        const myUser = Utils.getMyUsername();
        const postOwner = Utils.getPostOwner();
        if (myUser) skipUsers.add(myUser);
        if (postOwner) skipUsers.add(postOwner);
        const allText = ctx?.innerText || ctx?.textContent || "";
        const replyMatch = allText.match(/(?:正在回覆|Replying to)\s*@([a-zA-Z0-9._]+)/i);
        if (replyMatch && replyMatch[1]) skipUsers.add(replyMatch[1]);
        return skipUsers;
    },

    filterNewUsers: (rawUsers) => {
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);
        return rawUsers.filter(u => !db.has(u) && !activeSet.has(u) && !Core.pendingUsers.has(u));
    },

    collectVisibleDialogUsers: (ctx) => {
        if (!ctx) return [];
        const containerRect = ctx.getBoundingClientRect();
        const links = ctx.querySelectorAll('a[href^="/@"]');
        let rawUsers = Array.from(links).filter(a => {
            const rect = a.getBoundingClientRect();
            const isVisible = rect.height > 5 && rect.width > 5;
            const isInBounds = rect.top >= (containerRect.top - 10) &&
                rect.bottom <= (containerRect.bottom + 10);
            const isHeaderLink = a.closest('h1, h2, [role="heading"]');
            return isVisible && isInBounds && !isHeaderLink;
        }).map(a => {
            const href = a.getAttribute('href');
            return href.split('/@')[1].split('/')[0];
        }).filter(Boolean);

        const skipUsers = Core.buildSkipUsers(ctx);
        rawUsers = [...new Set(rawUsers)].filter(u => !skipUsers.has(u));
        return rawUsers;
    },

    collectFullDialogUsers: async (ctx, options = {}) => {
        if (!ctx) return [];

        let isActivityDialog = false;

        // Activity dialog: auto-switch to likes tab to avoid mixing reposts/quotes/replies
        try {
            // Detect if this is an Activity dialog by checking for activity-related text in headers
            const headerElements = ctx.querySelectorAll('span[dir="auto"], h1, h2');
            for (const el of headerElements) {
                const text = (el.innerText || el.textContent || '').trim();
                if (CONFIG.ACTIVITY_TEXTS.some(t => text === t)) {
                    isActivityDialog = true;
                    console.log('[collectFullDialogUsers] Detected Activity dialog, attempting to switch to likes tab');
                    break;
                }
            }

            if (isActivityDialog) {
                const likesTab = Core.SweepDriver.findLikesTab(ctx);
                if (likesTab) {
                    Utils.simClick(likesTab);
                    await Utils.safeSleep(500);
                    const newCtx = Core.getTopContext();
                    if (newCtx && newCtx !== document.body) {
                        ctx = newCtx;
                        console.log('[collectFullDialogUsers] Successfully switched to likes tab, using updated context');
                    }
                }
            }
        } catch (err) {
            console.warn('[collectFullDialogUsers] activity tab switch failed, fallback to raw ctx', err);
        }

        let scrollBox = ctx;
        if (ctx.scrollHeight === ctx.clientHeight) {
            const innerBoxes = ctx.querySelectorAll('div');
            for (let b of innerBoxes) {
                if (b.scrollHeight > b.clientHeight && window.getComputedStyle(b).overflowY !== 'hidden') {
                    scrollBox = b;
                    break;
                }
            }
        }

        const maxLimit = window.__DEBUG_HEGE_LIKES_LIMIT || 1000;
        const label = options.label || '掃描整串互動名單';
        const collectedLinks = new Set();
        let isAborted = false;
        let unchangedCount = 0;
        let lastCollectedSize = 0;
        let scrollCount = 0;
        const maxScrolls = 800;

        const progressId = 'hege-full-dialog-progress-' + Date.now();
        const progressUI = document.createElement('div');
        progressUI.id = progressId;
        progressUI.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.86);color:#fff;padding:10px 16px;border-radius:18px;z-index:99999;display:flex;align-items:center;gap:12px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        const countSpan = document.createElement('span');
        countSpan.textContent = `${label}... 已收集: 0 人`;

        const stopBtn = document.createElement('button');
        stopBtn.textContent = '停止並結算';
        stopBtn.style.cssText = 'background:#ff3b30;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;font-weight:700;';
        stopBtn.onclick = () => { isAborted = true; };

        progressUI.appendChild(countSpan);
        progressUI.appendChild(stopBtn);

        const currentPos = window.getComputedStyle(scrollBox).position;
        if (currentPos === 'static') scrollBox.style.position = 'relative';
        scrollBox.appendChild(progressUI);

        const escListener = (e) => { if (e.key === 'Escape') isAborted = true; };
        document.addEventListener('keydown', escListener);

        const collectRendered = () => {
            const links = ctx.querySelectorAll('a[href^="/@"]');
            let lastLink = null;
            Array.from(links).forEach(a => {
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                if (isHeaderLink) return;

                const href = a.getAttribute('href') || '';
                const match = href.match(/^\/@([^/?#]+)/);
                if (!match || !match[1]) return;

                collectedLinks.add(match[1]);
                lastLink = a;
            });
            return lastLink;
        };

        try {
            while (scrollCount < maxScrolls && !isAborted) {
                const lastNode = collectRendered();
                countSpan.textContent = `${label}... 已收集: ${collectedLinks.size} 人`;

                if (collectedLinks.size >= maxLimit) {
                    UI.showToast(`已達最大安全上限 (${maxLimit} 人)，自動結算。`, 3000);
                    break;
                }

                if (scrollBox && typeof scrollBox.scrollBy === 'function') {
                    const step = Math.max(900, Math.round((scrollBox.clientHeight || 700) * 1.25));
                    scrollBox.scrollBy({ top: step, behavior: 'auto' });
                } else if (lastNode) {
                    lastNode.scrollIntoView({ behavior: 'auto', block: 'end' });
                } else {
                    scrollBox.scrollTo(0, scrollBox.scrollHeight + 100);
                }

                await Utils.safeSleep(180);

                if (collectedLinks.size === lastCollectedSize) {
                    unchangedCount++;
                    if (unchangedCount >= 4) break;
                    if (scrollBox && typeof scrollBox.scrollBy === 'function') {
                        scrollBox.scrollBy({ top: 1600, behavior: 'auto' });
                    }
                    await Utils.safeSleep(160);
                } else {
                    unchangedCount = 0;
                    lastCollectedSize = collectedLinks.size;
                }

                scrollCount++;
            }

            collectRendered();
        } finally {
            document.removeEventListener('keydown', escListener);
            if (progressUI.parentNode) progressUI.parentNode.removeChild(progressUI);
            if (scrollBox && typeof scrollBox.scrollTo === 'function') scrollBox.scrollTo(0, 0);
        }

        const skipUsers = Core.buildSkipUsers(ctx);
        let rawUsers = Array.from(collectedLinks).filter(u => !skipUsers.has(u));

        // Activity dialog row filter: keep only rows with heart icon (likes)
        if (isActivityDialog && rawUsers.length > 0) {
            const filteredUsers = [];
            for (const username of rawUsers) {
                // Find all links with this username
                const userLinks = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter(link => {
                    const href = link.getAttribute('href') || '';
                    return href === `/@${username}` || href.startsWith(`/@${username}?`) || href.startsWith(`/@${username}/`);
                });
                let hasHeartIcon = false;

                for (const link of userLinks) {
                    // Walk up to find row-like ancestor (listitem or data-* container)
                    let row = link.closest('[role="listitem"]');
                    if (!row) {
                        let parent = link;
                        for (let i = 0; i < 5 && parent && parent !== ctx; i++) {
                            parent = parent.parentElement;
                            if (parent && parent.hasAttribute && (parent.hasAttribute('data-testid') || parent.hasAttribute('data-key'))) {
                                row = parent;
                                break;
                            }
                        }
                    }
                    if (!row) {
                        row = link.parentElement?.parentElement?.parentElement?.parentElement?.parentElement;
                    }

                    // Check for heart icon in this row
                    if (row && row.querySelector('svg[viewBox="0 0 18 18"] path[d*="8.33956"]')) {
                        hasHeartIcon = true;
                        break;
                    }
                }

                if (hasHeartIcon) {
                    filteredUsers.push(username);
                }
            }

            if (filteredUsers.length > 0) {
                rawUsers = filteredUsers;
            } else {
                console.warn('[collectFullDialogUsers] Heart icon filter returned 0 users, falling back to unfiltered results');
            }
        }

        return rawUsers;
    },

    normalizeSourceUrl: (url) => {
        try {
            const parsed = new URL(url, window.location.origin);
            return `${parsed.origin}${parsed.pathname}`;
        } catch (e) {
            return '';
        }
    },

    findSourcePostUrl: (element) => {
        if (window.location.pathname.includes('/post/')) {
            return Core.normalizeSourceUrl(window.location.href);
        }

        let node = element;
        for (let i = 0; i < 12 && node && node !== document.body; i++) {
            if (node.querySelector) {
                const postLink = node.querySelector('a[href*="/post/"]');
                if (postLink) return Core.normalizeSourceUrl(postLink.getAttribute('href'));
            }
            node = node.parentElement;
        }
        return '';
    },

    setReportContext: (username, context = {}) => {
        if (!username) return;
        const map = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
        const existing = map[username] || {};
        map[username] = {
            ...existing,
            ...context,
            sourceUrl: Core.normalizeSourceUrl(context.sourceUrl || existing.sourceUrl || ''),
            updatedAt: Date.now(),
        };
        Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, map);
    },

    removeReportContext: (username) => {
        if (!username) return;
        const map = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
        if (map[username]) {
            delete map[username];
            Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, map);
        }
    },

    init: () => {
        Core.pendingUsers = new Set(Storage.getSessionJSON(CONFIG.KEYS.PENDING));

        const hasAgreed = Storage.get(CONFIG.KEYS.DISCLAIMER_AGREED);

        if (CONFIG.DEBUG_MODE) console.log(`[留友封] 初始化完成, 版本: ${CONFIG.VERSION}, Mobile: ${Utils.isMobile()}`);
        if (!hasAgreed) {
            UI.showDisclaimer(() => {
                Storage.set(CONFIG.KEYS.DISCLAIMER_AGREED, 'true');
                Core.startScanner();
                if (Core.SweepDriver) Core.SweepDriver.tick();
            });
        } else {
            Core.startScanner();
            if (Core.SweepDriver) Core.SweepDriver.tick();
        }
    },


    getBgMode: () => {
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
        if (!isRunning) return 'IDLE';
        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const first = queue[0] || '';
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX);
        return isUnblock ? 'UNBLOCKING' : 'BLOCKING';
    },

    observer: null,
    _scrollDebounce: null,
    startScanner: () => {
        // Optimization: Use MutationObserver instead of fixed interval for most cases
        if (Core.observer) Core.observer.disconnect();

        Core.observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            let dialogChanged = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                    dialogChanged = true;
                    break;
                }
            }
            if (shouldScan) Core.scanAndInject();
            if (dialogChanged) {
                Core.injectDialogBlockAll();
                Core.injectDialogCheckboxes();
            }
        });

        Core.observer.observe(document.body, { childList: true, subtree: true });

        // Scroll listener: catch virtual-scroll items entering DOM during fast scrolling in dialogs
        document.addEventListener('scroll', () => {
            clearTimeout(Core._scrollDebounce);
            Core._scrollDebounce = setTimeout(() => Core.injectDialogCheckboxes(), 80);
        }, true); // capture phase to catch scroll on any element

        // Backup interval in case mutation observer misses React's synthetic updates
        // Increased frequency from 1500 to 500ms to catch post-Loading states faster
        setInterval(() => {
            Core.scanAndInject();
            Core.injectDialogBlockAll();
            Core.injectDialogCheckboxes();
            Core.updateControllerUI();
        }, 500);

        Core.scanAndInject();

        // [Debug] Global Click Tracker (User requested to keep this around for debugging)
        if (CONFIG.DEBUG_MODE) {
            document.body.addEventListener('click', (e) => {
                let target = e.target;
                let text = target.innerText || target.textContent || '';

                // Try to find text from parent if the click was on an SVG or inner span
                if (!text.trim() && target.parentElement) {
                    text = target.parentElement.innerText || target.parentElement.textContent || '';
                }

                // Only log if we clicked something that looks like an action (has text or is an SVG)
                const isSvg = target.closest('svg');
                let logMsg = text.trim().substring(0, 30);
                if (!logMsg && isSvg) logMsg = '[SVG Icon]';

                if (logMsg) {
                    console.log(`[留友封 Debug] Clicked: "${logMsg.replace(/\n/g, ' ')}"`);

                    // Inspect DOM 1 second after click to see what React did to the headers
                    setTimeout(() => {
                        const headers = document.querySelectorAll('h1, h2');
                        console.log(`[留友封 Debug] --- DOM State 1s after click ---`);
                        console.log(`Found ${headers.length} headers total.`);
                        headers.forEach((h, idx) => {
                            const hText = (h.innerText || h.textContent || '').trim();
                            if (hText) {
                                const p = h.parentElement;
                                const injected = p ? p.dataset.hegeDialogInjected : 'N/A';
                                const hasBtn = p ? !!p.querySelector('.hege-clean-list-btn, .hege-block-all-btn') : false;

                                // Check if inside dialog
                                let isDialog = false;
                                let curr = p;
                                for (let i = 0; i < 8; i++) {
                                    if (curr && curr.getAttribute('role') === 'dialog') { isDialog = true; break; }
                                    if (curr) curr = curr.parentElement;
                                }

                                console.log(`Header [${idx}]: "${hText}" | inDialog: ${isDialog} | ParentInjectedFlag: ${injected} | BtnExists: ${hasBtn}`);

                                // Log the entire parent structure HTML (stripped of too much detail)
                                // if it's a dialog header we care about
                                if (isDialog && CONFIG.DIALOG_HEADER_TEXTS.some(t => hText.includes(t))) {
                                    console.log(`[!] Target Header Parent HTML snippet:`, p ? p.outerHTML.substring(0, 300) + '...' : 'null');
                                }
                            }
                        });
                        console.log(`-------------------------------------------`);
                    }, 1000);
                }
            }, true); // Capture phase to guarantee we catch it even if React calls stopPropagation()
        }

        // React often swallows events or stops propagation.
        // We now bind `addEventListener('click', Core.handleGlobalClick, true)`
        // directly to the initialized containers instead of window to prevent click-through.
    },

    getTopContext: () => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length > 0) {
            // Pick the last one which is usually the topmost in DOM
            return dialogs[dialogs.length - 1];
        }
        return document.body;
    },

    advancedBlockAll: async (ctx) => {
        const bgMode = Core.getBgMode();
        if (bgMode === 'UNBLOCKING') return;

        let scrollBox = ctx;
        if (ctx.scrollHeight === ctx.clientHeight) {
            const innerBoxes = ctx.querySelectorAll('div');
            for (let b of innerBoxes) {
                if (b.scrollHeight > b.clientHeight && window.getComputedStyle(b).overflowY !== 'hidden') {
                    scrollBox = b;
                    break;
                }
            }
        }

        const maxLimit = window.__DEBUG_HEGE_LIKES_LIMIT || 1000;
        let isAborted = false;

        // --- Create Progress UI ---
        const progressId = 'hege-advanced-progress-' + Date.now();
        const progressUI = document.createElement('div');
        progressUI.id = progressId;
        progressUI.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 99999; display: flex; align-items: center; gap: 15px; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
        
        const countSpan = document.createElement('span');
        countSpan.textContent = '🚀 掃描中... 已捕獲: 0 人';
        
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹️ 停止並結算';
        stopBtn.style.cssText = 'background: #ff3b30; color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; font-weight: bold;';
        stopBtn.onclick = () => { isAborted = true; };
        
        progressUI.appendChild(countSpan);
        progressUI.appendChild(stopBtn);
        
        const currentPos = window.getComputedStyle(scrollBox).position;
        if (currentPos === 'static') scrollBox.style.position = 'relative';
        scrollBox.appendChild(progressUI);

        // Listen for ESC key to abort
        const escListener = (e) => { if (e.key === 'Escape') isAborted = true; };
        document.addEventListener('keydown', escListener);

        let collectedLinks = new Set();
        let unchangedCount = 0;
        let lastCollectedSize = 0;
        const maxScrolls = 800;
        let scrollCount = 0;

        const collectVisible = () => {
            const links = ctx.querySelectorAll('a[href^="/@"]');
            let lastLink = null;
            Array.from(links).forEach(a => {
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                if (!isHeaderLink) {
                    const href = a.getAttribute('href');
                    const u = href.split('/@')[1].split('/')[0];
                    collectedLinks.add(u);
                    lastLink = a;
                }
            });
            return lastLink; // Return the very last node for scrolling
        };

        while (scrollCount < maxScrolls && !isAborted) {
            const lastNode = collectVisible();
            countSpan.textContent = `🚀 掃描中... 已捕獲: ${collectedLinks.size} 人`;

            if (collectedLinks.size >= maxLimit) {
                UI.showToast(`已達最大安全上限 (${maxLimit}人)，自動安全結算。`, 3000);
                break;
            }

            // 策略改變：強制把畫面拉到最後一個看得到的帳號上，保證超過 IntersectionObserver 邊界
            if (lastNode && unchangedCount === 0) {
                lastNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // 如果抓不到元素或卡住，再退回傳統滾底
                scrollBox.scrollTo(0, scrollBox.scrollHeight + 100);
            }
            
            await Utils.safeSleep(600); // 讓 Intersection Observer 觸發並重繪
            
            if (collectedLinks.size === lastCollectedSize) {
                // 人數沒增加，代表到底了或是 loader 被卡住
                unchangedCount++;
                if (unchangedCount >= 6) {
                    break; // 卡住約 6 秒 (6 * 600+400)，真的沒人了
                }
                
                // 碰到卡住狀態，多刺激一下底部的 spinner，或再往下捲
                scrollBox.scrollBy({ top: 800, behavior: 'smooth' });
                await Utils.safeSleep(500); 
            } else {
                unchangedCount = 0;
                lastCollectedSize = collectedLinks.size;
            }
            
            scrollCount++;
        }

        collectVisible(); // Final deep collect
        
        // Cleanup UI and listeners
        document.removeEventListener('keydown', escListener);
        if (progressUI.parentNode) progressUI.parentNode.removeChild(progressUI);

        const skipUsers = Core.buildSkipUsers(ctx);
        let rawUsers = Array.from(collectedLinks).filter(u => !skipUsers.has(u));
        const newUsers = Core.filterNewUsers(rawUsers);

        if (newUsers.length === 0) {
            UI.showToast('沒有新帳號可加入');
            return;
        }

        newUsers.forEach(u => Core.pendingUsers.add(u));
        Core.markReportSelectable(newUsers);
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

        if (isRunning) {
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const combinedQueue = [...activeQueue, ...Core.pendingUsers];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
            UI.showToast(`✅ 進階收集完成：已將 ${newUsers.length} 筆加入背景排隊`);
        } else {
            UI.showToast(`✅ 進階收集完成：已標記 ${Core.pendingUsers.size} 人，可關閉視窗至控制台「開始封鎖」`);
        }

        if (newUsers.length >= 30) {
            Core.checkCockroachRadar(null, newUsers.length);
        }

        scrollBox.scrollTo(0, 0);
        Core.updateControllerUI();

        setTimeout(() => {
            document.querySelectorAll('.hege-checkbox-container').forEach(box => {
                if (box.dataset.username && Core.pendingUsers.has(box.dataset.username)) {
                    box.classList.add('checked');
                }
            });
        }, 500);
    },

    injectDialogBlockAll: () => {
        const ctx = Core.getTopContext();
        const isDialog = ctx !== document.body;

        const headers = ctx.querySelectorAll('h1, h2, div[role="heading"] span');
        let header = null;
        let titleText = '';

        for (let h of headers) {
            const tempText = (h.innerText || h.textContent || '');
            const text = tempText.trim();
            if (text && text !== 'Threads') {
                // 排除回覆/回文/發文 dialog — 會回文/發文代表不想或不能封鎖
                const isExcludeCtx = ['回覆', '回文', 'Reply', 'Replies', '回應', '新串文', 'New thread', '發佈串文', 'Post', '編輯', 'Edit', '刪除', '删除', 'Delete', '確定刪除', '確認刪除'].some(t => text.includes(t));
                if (isExcludeCtx) continue;

                if (isDialog || CONFIG.DIALOG_HEADER_TEXTS.some(t => text.includes(t))) {
                    header = h;
                    titleText = text;
                }
            }
        }

        if (!header) return;

        const headerContainer = header.parentElement;
        if (!headerContainer) return;

        let localCtx = headerContainer;
        for (let i = 0; i < 2; i++) {
            if (localCtx.parentElement && localCtx.parentElement.tagName !== 'BODY') {
                localCtx = localCtx.parentElement;
            }
        }

        const existingCleanList = localCtx.querySelector('.hege-clean-list-btn');
        localCtx.querySelectorAll('.hege-block-all-btn, .hege-report-only-btn, .hege-endless-sweep-btn').forEach(btn => btn.remove());

        let cleanListBtn = existingCleanList;
        
        const shouldAddCleanList = !existingCleanList || !document.body.contains(existingCleanList);

        if (!shouldAddCleanList) return;

        if (shouldAddCleanList) {
            cleanListBtn = document.createElement('div');
            cleanListBtn.className = 'hege-clean-list-btn';
            cleanListBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>
                <span>清理名單</span>
            `;
            cleanListBtn.title = '清理名單：同列全封、只檢舉、定點絕';
            cleanListBtn.dataset.hegeRole = 'clean-list';

            const bgMode = Core.getBgMode();
            if (bgMode === 'UNBLOCKING') {
                cleanListBtn.style.opacity = '0.5';
                cleanListBtn.style.filter = 'grayscale(1)';
                cleanListBtn.style.cursor = 'not-allowed';
                cleanListBtn.title = '正在解除封鎖，暫時無法清理名單';
            }
        }

        const handleBlockAll = async (e, rawUsersOverride = null) => {
            if (Core.getBgMode() === 'UNBLOCKING') {
                UI.showToast('目前正在「解除封鎖」，請先暫停任務再執行封鎖');
                return;
            }
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }

            // Beta 56: Re-calculate context and bounds at click-time for maximum precision
            const activeCtx = Core.getTopContext();

            const rawUsers = Array.isArray(rawUsersOverride)
                ? rawUsersOverride
                : await Core.collectFullDialogUsers(activeCtx);
            const newUsers = Core.filterNewUsers(rawUsers);

            if (newUsers.length === 0) {
                UI.showToast('整串名單沒有新帳號可加入');
                return;
            }

            newUsers.forEach(u => Core.pendingUsers.add(u));
            Core.markReportSelectable(newUsers);
            Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

            // 記錄封鎖 context（來源貼文、原因類型、貼文摘要）供 Worker 寫入結構化 timestamp
            const reason = CONFIG.LIKES_TEXTS.some(t => titleText.includes(t)) ? 'likes'
                : CONFIG.QUOTES_TEXTS.some(t => titleText.includes(t)) ? 'quotes'
                : CONFIG.REPOSTS_TEXTS.some(t => titleText.includes(t)) ? 'reposts' : 'manual';
            const sourceUrl = Core.findSourcePostUrl(activeCtx) || window.location.href.split('?')[0];
            Storage.set(CONFIG.KEYS.BLOCK_CONTEXT, JSON.stringify({
                src: sourceUrl,
                reason,
                postText: Utils.getPostText(sourceUrl),
                postOwner: Utils.getPostOwner(sourceUrl) || ''
            }));
            Storage.set(CONFIG.KEYS.CURRENT_BATCH_ID, 'b_' + Date.now());

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

            if (isRunning) {
                const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                const combinedQueue = [...activeQueue, ...Core.pendingUsers];
                Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
                UI.showToast(`已將整串名單 ${newUsers.length} 筆帳號加入背景排隊`);
            } else {
                UI.showToast(`已加入「${Core.pendingUsers.size} 選取」，請至清單「開始封鎖」`);
            }
            
            // Task 2: Cockroach Radar
            if (newUsers.length >= 30) {
                Core.checkCockroachRadar(null, newUsers.length);
            }

            document.querySelectorAll('.hege-checkbox-container').forEach(box => {
                if (box.dataset.username && Core.pendingUsers.has(box.dataset.username)) {
                    box.classList.add('checked');
                }
            });

            Core.updateControllerUI();
            return newUsers.length;
        };


        const handleReportOnly = async (e, rawUsersOverride = null) => {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }

            const activeCtx = Core.getTopContext();
            if (Core.ReportDriver) Core.ReportDriver.rememberDialogContext(activeCtx);
            const rawUsers = Array.isArray(rawUsersOverride)
                ? rawUsersOverride
                : await Core.collectFullDialogUsers(activeCtx);

            if (rawUsers.length === 0) {
                UI.showToast('沒有帳號可加入只檢舉佇列');
                return;
            }

            let added = 0;
            const sourceUrl = Core.findSourcePostUrl(activeCtx);
            rawUsers.forEach(u => {
                Core.setReportContext(u, {
                    sourceUrl,
                    source: 'dialog',
                    targetType: 'account',
                    sourceText: Utils.getPostText(sourceUrl),
                    sourceOwner: Utils.getPostOwner(sourceUrl) || '',
                });
                if (Storage.queueAddUnique(CONFIG.KEYS.REPORT_QUEUE, u)) added++;
            });

            UI.showToast(`已將整串名單 ${added} 人加入檢舉清單，請回主面板按「開始檢舉」`);
            Core.updateControllerUI();
        };


        const handleEndlessSweep = (e, options = {}) => {
            if (e) {
                e.stopPropagation(); e.preventDefault();
            }
            const isManualClick = !window.__hege_is_auto_click;
            if (isManualClick) {
                const currentUrl = window.location.href.split('?')[0];
                const exists = Storage.postReservoir.getByUrl(currentUrl);
                if (exists && exists.advanceOnComplete) {
                    UI.showToast('⚠️ 此貼文已在定點絕排程中');
                    return;
                }
                const label = '/@' + (currentUrl.split('/@')[1] || currentUrl);
                Storage.postReservoir.addEntry(currentUrl, {
                    label,
                    advanceOnComplete: true,
                    longTermLoop: !!options.longTermLoop || !!exists?.longTermLoop,
                });
                const queueLength = Storage.postReservoir.getAll().filter(p => p.advanceOnComplete).length;
                const postOwner = Utils.getPostOwner();
                const shouldAutoMarkLeader = Storage.get(CONFIG.KEYS.AUTO_MARK_LEADER) !== 'false';
                let didAutoMarkLeader = false;
                if (shouldAutoMarkLeader && postOwner) {
                    const cockroachDb = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                    const cockroachSet = new Set(cockroachDb.map(c => (typeof c === 'string') ? c : c.username));
                    if (!cockroachSet.has(postOwner)) {
                        cockroachDb.push({ username: postOwner, timestamp: Date.now() });
                        Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, cockroachDb);
                    }
                    didAutoMarkLeader = true;
                }
                if (Core.SweepDriver) Core.SweepDriver.clearLoopStateForCurrentPost();
                const loopText = options.longTermLoop ? '，並啟用 8 小時深層清理' : '';
                UI.showToast(didAutoMarkLeader
                    ? `✅ 已加入定點絕排程${loopText}，並標記 @${postOwner} 為大蟑螂`
                    : `✅ 已加入定點絕排程${loopText}（第 ${queueLength} 批）`);
                Core.updateControllerUI();
                return;
            }

            window.__hege_is_auto_click = false;
            try {
                if (Core.SweepDriver) Core.SweepDriver.runCurrentPage();
            } catch (err) {
                console.error('[DEBUG] handleEndlessSweep 發生例外錯誤:', err);
                alert('定點絕發生錯誤:\n' + err.message);
            }
        };

        const handleCleanList = (e) => {
            if (Core.getBgMode() === 'UNBLOCKING') {
                UI.showToast('目前正在「解除封鎖」，請先暫停任務再清理名單');
                return;
            }
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }

            UI.showCleanListPicker(async (actions) => {
                let fullUsers = null;
                if (actions.collect) {
                    const activeCtx = Core.getTopContext();
                    fullUsers = await Core.collectFullDialogUsers(activeCtx);
                    if (fullUsers.length === 0 && !actions.endless) {
                        UI.showToast('整串名單沒有可加入的帳號');
                        return;
                    }
                }

                if (actions.collect) {
                    await handleBlockAll(null, fullUsers);
                }
                if (actions.endless) {
                    handleEndlessSweep(null, { longTermLoop: actions.longTermLoop });
                }
                if (actions.collect) {
                    await handleReportOnly(null, fullUsers);
                }
            });
        };

        // EXPORT FOR CONSOLE TESTING
        window.__hegeTestEndless = handleEndlessSweep;
        console.log('[DEBUG] 已注入 window.__hegeTestEndless() 供主控台測試');

        const allSpans = localCtx.querySelectorAll('span[dir="auto"]');
        let sortSpan = null;
        for (let span of allSpans) {
            const spanText = (span.innerText || span.textContent || '').trim();
            if (spanText === '排序' || spanText.includes('排序')) {
                sortSpan = span;
                break;
            }
        }

        const attachEvents = (btn, handler) => {
            if (btn && !btn.dataset.hegeEventBound) {
                if (Utils.isMobile()) {
                    btn.addEventListener('touchend', handler, { passive: false, capture: true });
                } else {
                    btn.addEventListener('click', handler, true);
                }
                btn.dataset.hegeEventBound = 'true';
            }
        };

        if (shouldAddCleanList) attachEvents(cleanListBtn, handleCleanList);

        if (sortSpan && sortSpan.closest('[role="button"]')) {
            const sortBtn = sortSpan.closest('[role="button"]');
            
            if (shouldAddCleanList) {
                cleanListBtn.style.marginRight = '8px';
                try {
                    sortBtn.parentElement.style.display = 'flex';
                    sortBtn.parentElement.style.alignItems = 'center';
                    sortBtn.parentElement.insertBefore(cleanListBtn, sortBtn);
                } catch (e) {
                    headerContainer.appendChild(cleanListBtn);
                }
            }
        } else {
            if (shouldAddCleanList) {
                cleanListBtn.style.marginLeft = 'auto';
                cleanListBtn.style.marginRight = '8px';
                if (header.nextSibling) {
                    headerContainer.insertBefore(cleanListBtn, header.nextSibling);
                } else {
                    headerContainer.appendChild(cleanListBtn);
                }
            }
        }

    },

    injectDialogCheckboxes: () => {
        const ctx = Core.getTopContext();
        const isDialog = ctx !== document.body;

        const dialogHeaders = ctx.querySelectorAll('h1, h2, div[role="heading"] span');
        let header = null;
        for (let h of dialogHeaders) {
            const tempText = (h.innerText || h.textContent || '').trim();
            if (tempText && tempText !== 'Threads') {
                if (isDialog || CONFIG.DIALOG_HEADER_TEXTS.some(t => tempText.includes(t))) {
                    header = h;
                }
            }
        }
        if (!header) return;

        const links = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter(a => {
            // Only filter truly invisible elements (display:none, zero-size); allow off-screen items
            const rect = a.getBoundingClientRect();
            return rect.height > 0 && rect.width > 0;
        });

        const dbRef = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        if (CONFIG.DEBUG_MODE && links.length > 0) {
        }

        links.forEach((a, idx) => {
            const isAvatar = a.querySelector('img') || a.querySelector('svg') || a.innerText.trim() === '';
            const username = a.getAttribute('href').split('/@')[1].split('/')[0];

            if (!isAvatar) {
                // If it's not an avatar link, we only skip it if it's the 2nd link of the same user (name link)
                // However, in some views the name link IS the only link with a good flexRow. 
                // So let's try to process both, but avoid double injection via flexRow check.
            }

            if (username === Utils.getMyUsername()) return;

            let topContainer = a;
            let followBtn = null;
            for (let i = 0; i < 15; i++) {
                if (!topContainer.parentElement) break;
                topContainer = topContainer.parentElement;
                const btns = Array.from(topContainer.querySelectorAll('div[role="button"]'));
                followBtn = btns.find(b => b.innerText && ['追蹤', '正在追蹤', 'Follow', 'Following'].some(t => b.innerText.includes(t)));
                if (followBtn) break;
            }

            let flexRow = null;
            let followBtnContainer = null;

            if (followBtn) {
                let child = followBtn;
                while (child && child !== topContainer) {
                    let parent = child.parentElement;
                    let safeUsername = username.replace(/"/g, '');
                    // Threads lists usually have a clear row container that holds both user info and the follow button.
                    if (parent && parent.children.length >= 2 && parent.querySelector(`a[href*="/@${safeUsername}"]`)) {
                        flexRow = parent;
                        followBtnContainer = child;
                        break;
                    }
                    child = parent;
                }
            }

            // Fallback: If no follow button (e.g. current user or specific list type), find a container that looks like a list item.
            // Beta 53/54 optimization: Finding a stable Row Container.
            // Priority: role="listitem" -> data-pressable-container -> Common Flex Row classes
            if (!flexRow) {
                flexRow = a.closest('div[role="listitem"]') ||
                    a.closest('div[data-pressable-container="true"]') ||
                    a.closest('.x1n2onr6.x1f9n5g') ||
                    (followBtn && followBtn.parentElement ? followBtn.parentElement.closest('.x78zum5.xdt5ytf') : null) ||
                    (followBtn ? followBtn.parentElement : null);
            }

            if (!flexRow) return;

            // Beta 54: Absolute deduplication. Check the whole row for THIS user's box.
            const existingBox = flexRow.querySelector(`.hege-checkbox-container[data-username="${CSS.escape(username)}"]`);
            if (existingBox) {
                const isChecked = Core.pendingUsers.has(username);
                if (isChecked !== existingBox.classList.contains('checked')) {
                    existingBox.classList.toggle('checked', isChecked);
                }
                return;
            }

            // Beta 54: Special case - if a box already exists in this row but for a different username, 
            // it means we've hit a shared parent. For safety, let's look for a better spot or skip.
            if (flexRow.querySelector('.hege-checkbox-container')) {
                // If the user's box isn't here, maybe it's in a different sub-flex.
                // But generally, one box per role="listitem" is the goal.
                return;
            }

            const container = document.createElement("div");
            container.className = "hege-checkbox-container";
            container.dataset.username = username;
            container.style.cursor = 'pointer';
            container.style.zIndex = '100';
            container.style.flexShrink = '0';

            const bgMode = Core.getBgMode();
            if (bgMode === 'UNBLOCKING') {
                container.style.opacity = '0.4';
                container.style.filter = 'grayscale(1)';
                container.style.cursor = 'not-allowed';
                container.title = '正在解除封鎖';
            }

            const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgIcon.setAttribute("viewBox", "0 0 24 24");
            svgIcon.classList.add("hege-svg-icon");

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "2"); rect.setAttribute("y", "2");
            rect.setAttribute("width", "20"); rect.setAttribute("height", "20");
            rect.setAttribute("rx", "6"); rect.setAttribute("ry", "6");
            rect.setAttribute("stroke", "currentColor"); rect.setAttribute("stroke-width", "2.5");
            rect.setAttribute("fill", "none");

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.classList.add("hege-checkmark");
            path.setAttribute("d", "M6 12 l4 4 l8 -8");
            path.setAttribute("fill", "none");

            svgIcon.appendChild(rect); svgIcon.appendChild(path);
            container.appendChild(svgIcon);

            container.dataset.username = username;

            if (dbRef.has(username)) {
                container.classList.add('finished');
            } else if (activeSet.has(username)) {
                container.classList.add('pending');
            } else if (Core.pendingUsers.has(username)) {
                container.classList.add('checked');
            }

            // Beta 45: Only use handleGlobalClick to avoid double-toggle issues.
            // Still keep the prevention listeners to block Threads' native behavior on these specific elements if needed.
            if (!Utils.isMobile()) {
                container.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
                container.addEventListener('pointerup', (e) => { e.stopPropagation(); }, true);
                container.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.shiftKey) e.preventDefault(); }, true);
                container.addEventListener('mouseup', (e) => { e.stopPropagation(); }, true);
            }
            container.addEventListener('click', Core.handleGlobalClick, true);

            // 插在追蹤按鈕前面，避免重疊
            if (followBtnContainer && followBtnContainer.parentElement === flexRow) {
                flexRow.insertBefore(container, followBtnContainer);
            } else {
                flexRow.appendChild(container);
            }
        });
    },

    scanAndInject: () => {
        // Performance: Only run if window is active/visible to save CPU
        if (document.hidden) return;

        const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
        if (moreSvgs.length === 0) return;

        // Optimization: Cache DB lookup
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));

        moreSvgs.forEach(svg => {
            const btn = svg.closest('div[role="button"]');
            if (!btn || !btn.parentElement) return;

            // Dialog 內的 checkbox 由 injectDialogCheckboxes 處理，避免重複注入
            if (btn.closest('div[role="dialog"]')) return;

            // Check if already processed
            if (btn.getAttribute('data-hege-checked') === 'true') return;
            if (btn.parentElement.querySelector('.hege-checkbox-container')) {
                btn.setAttribute('data-hege-checked', 'true');
                return;
            }

            // SVG filtering
            if (!svg.querySelector('circle') && !svg.querySelector('path')) {
                Utils.diagLog(`[SKIP] SVG 無 circle/path, viewBox=${svg.getAttribute('viewBox')}`);
                return;
            }
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox === '0 0 12 12' || viewBox === '0 0 13 12') return;
            const width = svg.style.width ? parseInt(svg.style.width) : 24;
            if (width < 16 && svg.clientWidth < 16) {
                Utils.diagLog(`[SKIP] SVG 太小 w=${width}, clientW=${svg.clientWidth}`);
                return;
            }

            let username = null;
            try {
                let p = btn.parentElement; let foundLink = null;
                for (let i = 0; i < 5; i++) {
                    if (!p) break;
                    foundLink = p.querySelector('a[href^="/@"]');
                    if (foundLink) break;
                    p = p.parentElement;
                }
                if (foundLink) {
                    username = foundLink.getAttribute('href').split('/@')[1].split('/')[0];
                }
            } catch (e) { }

            if (!username) {
                Utils.diagLog(`[SKIP] 找不到 username, btn.parentClasses=${btn.parentElement?.className?.substring(0, 50)}`);
            }

            if (username && username === Utils.getMyUsername()) {
                // Checkbox should not appear for the user's own account
                btn.setAttribute('data-hege-checked', 'true');
                return;
            }

            btn.setAttribute('data-hege-checked', 'true');

            const container = document.createElement('div');
            container.className = 'hege-checkbox-container';

            const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgIcon.setAttribute("viewBox", "0 0 24 24");
            svgIcon.classList.add("hege-svg-icon");

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "2"); rect.setAttribute("y", "2");
            rect.setAttribute("width", "20"); rect.setAttribute("height", "20");
            rect.setAttribute("rx", "6"); rect.setAttribute("ry", "6");
            rect.setAttribute("stroke", "currentColor"); rect.setAttribute("stroke-width", "2.5");
            rect.setAttribute("fill", "none");

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.classList.add("hege-checkmark");
            path.setAttribute("d", "M6 12 l4 4 l8 -8");
            path.setAttribute("fill", "none");

            svgIcon.appendChild(rect); svgIcon.appendChild(path);
            container.appendChild(svgIcon);

            if (username) {
                btn.dataset.username = username;
                container.dataset.username = username;

                const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
                const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));

                if (db.has(username)) {
                    container.classList.add('finished');
                } else if (Core.pendingUsers.has(username) || cdq.has(username) || bgq.has(username)) {
                    container.classList.add('checked');
                    Core.blockQueue.add(btn);
                }
            }

            if (Utils.isMobile()) {
                container.addEventListener('touchstart', (e) => {
                    if (e.target.closest('.hege-checkbox-container')) {
                        e.stopPropagation();
                    }
                }, { passive: false });

                container.addEventListener('touchend', (e) => {
                    if (e.target.closest('.hege-checkbox-container')) {
                        if (CONFIG.DEBUG_MODE) console.log('[留友封] Checkbox Touchend detected');
                        e.stopPropagation();
                        // CRITICAL: Stop iOS from firing synthetic click that triggers Universal Link
                        if (e.cancelable) e.preventDefault();

                        // Manually trigger handleGlobalClick since we prevented the default synthetic click
                        Core.handleGlobalClick(e);
                    }
                }, { passive: false, capture: true });
            } else {
                // Desktop (Chrome + Safari): intercept pointer/mouse events before React steals them
                container.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }, true);
                container.addEventListener('pointerup', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }, true);
                container.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    if (e.shiftKey) e.preventDefault();
                }, true);
                container.addEventListener('mouseup', (e) => {
                    e.stopPropagation();
                }, true);
            }

            // Bind directly to the element using a capture phase listener.
            // This is the most bulletproof way to intercept clicks before React or <a> tags steal them.
            container.addEventListener('click', Core.handleGlobalClick, true);

            try {
                const parent = btn.parentElement;
                if (parent) {
                    const ps = window.getComputedStyle(parent).position;
                    if (ps === 'static') parent.style.position = 'relative';
                    parent.style.setProperty('overflow', 'visible', 'important');
                    // checkbox 用 absolute 定位在 button 左側
                    container.style.position = 'absolute';
                    container.style.right = '100%';
                    container.style.top = '50%';
                    container.style.transform = 'translateY(-50%)';
                    container.style.marginRight = '2px';
                    parent.appendChild(container);
                }
            } catch (e) { }
        });
    },

    handleGlobalClick: (e) => {
        if (Core.getBgMode() === 'UNBLOCKING') {
            UI.showToast('目前正在「解除封鎖」，無法手動選取封鎖帳號');
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        const container = e.target.closest('.hege-checkbox-container');
        if (!container) return;

        // Stop propagation IMMEDIATELY to prevent opening user profile or React intercepting
        e.stopPropagation();
        e.preventDefault();

        if (CONFIG.DEBUG_MODE) {
            console.log(`[Shift - Click] Container Matched! ShiftKey: ${e.shiftKey}, anchorUsername: ${Core.lastClickedUsername}`);
        }

        // --- Shift-Click Multi-Select Logic ---
        let targetBoxes = [container];
        if (e.shiftKey && (Core.lastClickedBtn || Core.lastClickedUsername)) {
            const allBoxes = Array.from(document.querySelectorAll('.hege-checkbox-container'));
            let lastIdx = allBoxes.indexOf(Core.lastClickedBtn);

            // Fallback: If DOM node was recreated by React, find by username
            if (lastIdx === -1 && Core.lastClickedUsername) {
                lastIdx = allBoxes.findIndex(box => box.dataset.username === Core.lastClickedUsername);
            }

            const currIdx = allBoxes.indexOf(container);

            if (lastIdx !== -1 && currIdx !== -1) {
                const min = Math.min(lastIdx, currIdx);
                const max = Math.max(lastIdx, currIdx);
                targetBoxes = allBoxes.slice(min, max + 1);
                if (CONFIG.DEBUG_MODE) console.log(`[Shift - Click] Processing ${targetBoxes.length} items from index ${min} to ${max}`);
            } else {
                if (CONFIG.DEBUG_MODE) console.log(`[Shift - Click] Failed to establish range.lastIdx: ${lastIdx}, currIdx: ${currIdx}`);
            }
        }

        // Determine intended state based on current container
        const isCurrentlyChecked = container.classList.contains('checked');
        const isCurrentlyFinished = container.classList.contains('finished');

        let targetAction = 'check'; // Check by default
        if (isCurrentlyFinished) {
            targetAction = 'reset';
        } else if (isCurrentlyChecked) {
            targetAction = 'uncheck';
        }

        const currentDB = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));

        targetBoxes.forEach(box => {
            const u = box.dataset.username;
            const btnElement = box.parentElement; // Used for blockQueue

            if (targetAction === 'reset' && box.classList.contains('finished')) {
                if (u) {
                    currentDB.delete(u);
                    box.classList.remove('finished');
                    box.classList.add('checked');
                    if (btnElement) btnElement.dataset.username = u; // Ensure dataset exists safely
                    if (btnElement) Core.blockQueue.add(btnElement);
                    Core.pendingUsers.add(u);
                    const sourceUrl = Core.findSourcePostUrl(box);
                    Core.setReportContext(u, {
                        sourceUrl,
                        source: 'checkbox-reset',
                        sourceText: Utils.getPostText(sourceUrl),
                        sourceOwner: Utils.getPostOwner(sourceUrl) || '',
                    });
                }
            } else if (targetAction === 'uncheck' && box.classList.contains('checked')) {
                box.classList.remove('checked');
                // Remove from queue where username matches
                Array.from(Core.blockQueue).forEach(b => {
                    if (b.dataset && b.dataset.username === u) Core.blockQueue.delete(b);
                });
                if (u) {
                    Core.pendingUsers.delete(u);
                    Core.removeReportContext(u);
                    let bg = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    if (bg.includes(u)) Storage.setJSON(CONFIG.KEYS.BG_QUEUE, bg.filter(x => x !== u));
                    let cdq = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
                    if (cdq.includes(u)) Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, cdq.filter(x => x !== u));
                }
            } else if (targetAction === 'check' && !box.classList.contains('checked') && !box.classList.contains('finished')) {
                box.classList.add('checked');
                if (btnElement) btnElement.dataset.username = u;
                if (btnElement) Core.blockQueue.add(btnElement);
                if (u) {
                    Core.pendingUsers.add(u);
                    const sourceUrl = Core.findSourcePostUrl(box);
                    Core.setReportContext(u, {
                        sourceUrl,
                        source: 'checkbox',
                        sourceText: Utils.getPostText(sourceUrl),
                        sourceOwner: Utils.getPostOwner(sourceUrl) || '',
                    });
                }
            }
        });

        Core.markReportSelectable(targetBoxes.map(box => box.dataset.username));

        if (targetAction === 'reset') {
            Storage.setJSON(CONFIG.KEYS.DB_KEY, [...currentDB]);
            UI.showToast('已重置並重新加入排程');
        }

        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
        
        // Task 2: Cockroach Radar (Shift-Click selection block)
        if (targetAction === 'check' && targetBoxes.length >= 30) {
            Core.checkCockroachRadar(null, targetBoxes.length);
        }

        Core.lastClickedBtn = container;
        Core.lastClickedUsername = container.dataset.username;
        Core.lastClickedState = targetAction;

        if (CONFIG.DEBUG_MODE) {
            console.log(`[Shift - Click] State saved.next anchorUsername: ${Core.lastClickedUsername}`);
        }

        Core.updateControllerUI();
    },



    openBlockManager: () => {
        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        const ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        UI.showBlockManager(db, ts, (toUnblock) => {
            Core.startUnblock(toUnblock);
        });
    },

    clearPendingUsers: (usernames = []) => {
        const targets = new Set((Array.isArray(usernames) ? usernames : []).filter(Boolean));
        if (!Array.isArray(usernames)) {
            Core.pendingUsers.forEach(u => targets.add(u));
        }
        if (targets.size === 0) return 0;

        let removed = 0;
        targets.forEach(u => {
            if (Core.pendingUsers.delete(u)) removed++;
        });
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

        document.querySelectorAll('.hege-checkbox-container.checked').forEach(cb => {
            if (!cb.dataset.username || targets.has(cb.dataset.username)) {
                cb.classList.remove('checked');
            }
        });
        Array.from(Core.blockQueue || []).forEach(b => {
            if (!b.dataset || targets.has(b.dataset.username)) Core.blockQueue.delete(b);
        });

        Core.updateControllerUI();
        return removed;
    },

    restorePendingUsers: (usernames = []) => {
        const targets = [...new Set((Array.isArray(usernames) ? usernames : []).filter(Boolean))];
        if (targets.length === 0) return 0;

        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));
        const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
        let added = 0;

        targets.forEach(u => {
            if (db.has(u) || bgq.has(u) || cdq.has(u) || Core.pendingUsers.has(u)) return;
            Core.pendingUsers.add(u);
            added++;
        });
        if (added === 0) return 0;

        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
        document.querySelectorAll('.hege-checkbox-container').forEach(cb => {
            const u = cb.dataset.username;
            if (u && Core.pendingUsers.has(u) && !cb.classList.contains('finished')) {
                cb.classList.add('checked');
                if (cb.parentElement) {
                    cb.parentElement.dataset.username = u;
                    Core.blockQueue.add(cb.parentElement);
                }
            }
        });

        Core.updateControllerUI();
        return added;
    },

    markReportSelectable: (usernames = []) => {
        const targets = new Set((Array.isArray(usernames) ? usernames : []).filter(Boolean));
        if (targets.size === 0) return;

        const completed = Storage.getJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []);
        const filtered = completed.filter(u => !targets.has(u));
        if (filtered.length !== completed.length) {
            Storage.setJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, filtered);
        }

        const batch = Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        const filteredBatch = batch.filter(u => !targets.has(u));
        if (filteredBatch.length !== batch.length) {
            Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, filteredBatch);
        }
    },

    startUnblock: (usernames) => {
        if (!usernames || usernames.length === 0) return;

        const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        // Add prefix to signal unblock task to worker
        const tasks = usernames.map(u => `${CONFIG.UNBLOCK_PREFIX}${u}`);
        const newQ = [...new Set([...q, ...tasks])];

        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
        UI.showToast(`已將 ${usernames.length} 筆解鎖任務加入背景佇列`);

        // Check if worker needs to be opened
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const running = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
        if (!running) {
            Storage.remove(CONFIG.KEYS.BG_CMD);
            Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
            if (Utils.isMobile()) {
                Core.runSameTabWorker();
            } else {
                const workerWindow = Utils.openWorkerWindow();
                if (!workerWindow || workerWindow.closed) {
                    UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                    Core.runSameTabWorker();
                }
            }
        }
    },

    updateControllerUI: () => {
        // Throttled UI update logic (proper deferral to prevent missed updates)
        if (Core._uiUpdatePending) return;

        const now = Date.now();
        const timeSinceLast = now - (Core._lastUIUpdate || 0);

        if (timeSinceLast < 500) {
            Core._uiUpdatePending = setTimeout(() => {
                Core._uiUpdatePending = null;
                Core.updateControllerUI();
            }, 500 - timeSinceLast);
            return;
        }

        Core._lastUIUpdate = now;
        Core._uiUpdatePending = null;

        const bgMode = Core.getBgMode();
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
        const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));
        const getQueueEtaText = (bgQueueLen) => {
            if (bgQueueLen === 0) return '';

            const SECS_PER_BLOCK = 8;
            const dailyLimit = parseInt(Storage.get(CONFIG.KEYS.DAILY_BLOCK_LIMIT)) || CONFIG.DAILY_LIMIT_DEFAULT || 200;
            const emergency = Storage.get(CONFIG.KEYS.EMERGENCY_MODE) === 'true';
            const blocksDone24h = Storage.getBlocksLast24h ? Storage.getBlocksLast24h() : 0;
            const remainingAllowance = Math.max(0, dailyLimit - blocksDone24h);

            let etaText = '';
            if (emergency) {
                // 緊急模式無上限
                const mins = Math.ceil(bgQueueLen * SECS_PER_BLOCK / 60);
                etaText = mins < 60 ? `≈${mins}m` : `≈${Math.ceil(mins/60)}h`;
            } else if (bgQueueLen <= remainingAllowance) {
                // worker 不會撞 limit，全速跑
                const mins = Math.ceil(bgQueueLen * SECS_PER_BLOCK / 60);
                etaText = mins < 60 ? `≈${mins}m` : `≈${Math.ceil(mins/60)}h`;
            } else {
                // 會撞 limit。先跑掉 remainingAllowance，再等 24h window 釋放，再跑剩下的
                const minsBurst = Math.ceil(remainingAllowance * SECS_PER_BLOCK / 60);
                const remainingAfter = bgQueueLen - remainingAllowance;
                const waitHrs = Math.ceil(remainingAfter / dailyLimit * 24);
                etaText = `≈${minsBurst}m + 等 ${waitHrs}h 上限`;
            }

            return etaText;
        };

        // Global cleanup
        let pendingChanged = false;
        for (const u of Core.pendingUsers) {
            if (db.has(u) || cdq.has(u) || bgq.has(u)) {
                Core.pendingUsers.delete(u);
                pendingChanged = true;
            }
        }
        if (pendingChanged) Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

        // Only update visible elements or those that need state change
        document.querySelectorAll('.hege-checkbox-container').forEach(el => {
            const u = el.dataset.username;
            if (!u) return;

            if (db.has(u)) {
                if (!el.classList.contains('finished')) {
                    el.classList.add('finished');
                    el.classList.remove('checked');
                }
            } else if (Core.pendingUsers.has(u) || cdq.has(u) || bgq.has(u)) {
                if (!el.classList.contains('checked') && !el.classList.contains('finished')) {
                    el.classList.add('checked');
                } else if (el.classList.contains('finished')) {
                    el.classList.remove('finished');
                    el.classList.add('checked');
                }
            } else {
                el.classList.remove('finished');
                el.classList.remove('checked');
            }
        });

        const selCount = document.getElementById('hege-sel-count');
        if (selCount) selCount.textContent = `${Core.pendingUsers.size} 選取`;

        const historyCount = document.getElementById('hege-history-count');
        if (historyCount) historyCount.textContent = `${db.size}`;

        const panel = document.getElementById('hege-panel');
        if (!panel) return;

        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const retryItem = document.getElementById('hege-retry-failed-item');
        const reportItem = document.getElementById('hege-report-item');
        if (retryItem) {
            if (failedQueue.length > 0) {
                retryItem.style.display = 'flex';
                const countBadge = document.getElementById('hege-failed-count');
                if (countBadge) countBadge.textContent = `${failedQueue.length} 筆`;
            } else {
                retryItem.style.display = 'none';
            }
        }

        // 檢舉計數：已在 REPORT_QUEUE + 目前勾選但尚未加入檢舉佇列的人
        const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        const reportQueueSet = new Set(reportQueue);
        const activeReportBatch = new Set(Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []));
        const completedReportUsers = new Set(Storage.getJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []));
        const visibleReportQueueCount = reportQueue.filter(u => !activeReportBatch.has(u)).length;
        const pendingReportCount = Array.from(Core.pendingUsers)
            .filter(u => !reportQueueSet.has(u) && !activeReportBatch.has(u) && !completedReportUsers.has(u)).length;
        const hiddenActiveReportCount = reportQueue.length - visibleReportQueueCount;
        const reportTotalCount = visibleReportQueueCount + pendingReportCount;
        const reportCountBadge = document.getElementById('hege-report-count');
        if (reportCountBadge) {
            reportCountBadge.textContent = `${reportTotalCount} 筆`;
            reportCountBadge.style.color = reportTotalCount > 0 ? '#ff9500' : '';
            reportCountBadge.title = pendingReportCount > 0
                ? `${pendingReportCount} 筆可加入檢舉，${visibleReportQueueCount} 筆待啟動，${hiddenActiveReportCount} 筆執行中`
                : `${visibleReportQueueCount} 筆待啟動，${hiddenActiveReportCount} 筆執行中`;
        }

        // 貼文水庫 badge：顯示統一總數（含深層 + 定點絕）
        const reservoirEntries = Storage.postReservoir.getAll();
        const endlessQueueBadge = document.getElementById('hege-endless-queue-count');
        const bgStatusLineEl = document.getElementById('hege-bg-status');

        const pendingEndlessCount = reservoirEntries.filter(p => p.advanceOnComplete && p.status !== 'done').length;
        const isEndlessRunning = Core.SweepDriver ? Core.SweepDriver.isRunning() : false;
        let endlessStatusApplied = false;

        // Panel badge：有定點絕待跑時變紅，否則顯示總篇數
        if (endlessQueueBadge) {
            if (pendingEndlessCount > 0 && !isEndlessRunning) {
                endlessQueueBadge.textContent = `🔴 ${pendingEndlessCount} 篇待跑`;
                endlessQueueBadge.style.color = '#ff3b30';
            } else {
                endlessQueueBadge.textContent = `${reservoirEntries.length} 篇`;
                endlessQueueBadge.style.color = '';
            }
        }

        // 定點絕執行中：僅在該貼文仍處於實際執行狀態時顯示「清單X 第N批」
        if (isEndlessRunning) {
            const targetUrl = sessionStorage.getItem('hege_sweep_target') || window.location.href.split('?')[0];
            const activePostIdx = reservoirEntries.findIndex(p => p.url.split('?')[0] === targetUrl.split('?')[0]);
            if (activePostIdx >= 0) {
                const activePost = reservoirEntries[activePostIdx];
                const bgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                const isActivePostRunning = activePost.status === 'sweeping'
                    || (activePost.status === 'pending' && bgQueue.length > 0);
                if (isActivePostRunning) {
                    const listLabel = String.fromCharCode(65 + activePostIdx); // A, B, C...
                    const batchNum = activePost.batchCount || 0;
                    if (bgStatusLineEl && !bgStatusLineEl.textContent.includes('冷卻')) {
                        bgStatusLineEl.textContent = `🔄 清單${listLabel} 第${batchNum}批 定點絕執行中`;
                        bgStatusLineEl.dataset.hegeSweepStatus = 'running';
                        endlessStatusApplied = true;
                    }
                }
            }
        }

        // 定點絕收尾：僅清理由 sweep 狀態寫入的狀態列，避免字串比對造成耦合
        if (!endlessStatusApplied && bgStatusLineEl && bgStatusLineEl.dataset.hegeSweepStatus === 'running') {
            bgStatusLineEl.textContent = '執行狀態...';
            delete bgStatusLineEl.dataset.hegeSweepStatus;
        }

        let badgeText = Core.pendingUsers.size > 0 ? `(${Core.pendingUsers.size})` : '';

        let shouldShowStop = false;
        let mainText = '開始封鎖';
        let headerColor = 'transparent'; // Use transparent or theme color

        const bgqArr = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const firstTask = bgqArr[0] || '';
        const isUnblockTask = firstTask.startsWith(CONFIG.UNBLOCK_PREFIX);

        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        if (cooldownUntil > Date.now()) {
            const remainHrs = Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60));
            const cdQueueSize = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []).length;
            mainText = `⛔ 限制保護中 (${remainHrs}小時候恢復)`;
            headerColor = '#ff453a';
            const cdEta = getQueueEtaText(cdQueueSize);
            badgeText = `${cdQueueSize}${cdEta ? ' (' + cdEta + ')' : ''}`;
        } else {
            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            if (bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 10000)) {
                shouldShowStop = true;
                const bgEta = getQueueEtaText(bgStatus.total);
                mainText = `${isUnblockTask ? '解除封鎖' : '背景執行'}中 剩餘 ${bgStatus.total} 人${bgEta ? ' ' + bgEta : ''}`;
                headerColor = '#4cd964';
                badgeText = `${bgStatus.total}${bgEta ? ' (' + bgEta + ')' : ''}`;
            } else if (bgq.size > 0) {
                // Worker stopped/idle but queue has remaining items from a previous run
                const bgEta = getQueueEtaText(bgq.size);
                mainText = `${isUnblockTask ? '繼續解除' : '繼續封鎖'} (${bgq.size} 人)${bgEta ? ' ' + bgEta : ''}`;
                headerColor = '#ff9500';
                badgeText = `${bgq.size}${bgEta ? ' (' + bgEta + ')' : ''}`;
            }
        }

        const badge = document.getElementById('hege-queue-badge');
        if (badge) badge.textContent = badgeText;

        const stopBtn = document.getElementById('hege-stop-btn-item'); if (stopBtn) stopBtn.style.display = shouldShowStop ? 'flex' : 'none';
        const mainItem = document.getElementById('hege-main-btn-item');
        if (mainItem) { mainItem.querySelector('span').textContent = mainText; mainItem.style.color = shouldShowStop ? headerColor : '#f5f5f5'; }
        const header = document.getElementById('hege-header'); if (header) header.style.borderColor = headerColor;

        // Mutex: Dynamic state for all checkboxes and buttons on the page
        const isUnblocking = bgMode === 'UNBLOCKING';
        document.querySelectorAll('.hege-checkbox-container').forEach(box => {
            box.style.opacity = isUnblocking ? '0.4' : '1';
            box.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            box.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            box.title = isUnblocking ? '正在解除封鎖' : '';
        });

        document.querySelectorAll('.hege-clean-list-btn, .hege-block-all-btn').forEach(btn => {
            btn.style.opacity = isUnblocking ? '0.5' : '1';
            btn.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            btn.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            // 貼文水庫按鈕的 title 有語意用途，不覆寫為空字串。
            if (btn.dataset.hegeRole === 'clean-list') {
                btn.title = isUnblocking ? '正在解除封鎖，暫時無法清理名單' : '清理名單：同列全封、只檢舉、定點絕';
            } else if (btn.dataset.hegeRole !== 'endless-sweep') {
                btn.title = isUnblocking ? '正在解除封鎖，暫時無法封鎖' : '';
            } else if (isUnblocking) {
                btn.title = '正在解除封鎖，暫時無法封鎖';
                // 解除封鎖結束後由 btn.dataset.hegeRole 恢復語意，不需額外寫回
            }
        });

        document.querySelectorAll('.hege-report-only-btn').forEach(btn => {
            btn.style.opacity = isUnblocking ? '0.5' : '1';
            btn.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            btn.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            btn.title = isUnblocking ? '正在解除封鎖，暫時無法只檢舉' : '只檢舉：把目前按讚名單加入 REPORT_QUEUE，不封鎖';
        });

        // Mutex: Gray out Unblock Start if Blocking
        const unblockConfirm = document.getElementById('hege-unblock-confirm');
        if (unblockConfirm) {
            const isBlocking = bgMode === 'BLOCKING';
            unblockConfirm.style.opacity = isBlocking ? '0.5' : '1';
            unblockConfirm.style.pointerEvents = isBlocking ? 'none' : 'auto';
            unblockConfirm.title = isBlocking ? '後台正在進行封鎖任務，請先暫停' : '';
            if (isBlocking) {
                unblockConfirm.textContent = '🔒 背景排隊中...';
            } else {
                unblockConfirm.textContent = '確定解除封鎖';
            }
        }
    },

    runSameTabWorker: (explicitToAdd) => {
        const toAdd = explicitToAdd || Array.from(Core.pendingUsers);

        const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const newQ = [...new Set([...q, ...toAdd])];

        if (newQ.length === 0) {
            UI.showToast('沒有待處理的帳號');
            return;
        }

        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
        Storage.remove(CONFIG.KEYS.BG_CMD);
        Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
        Storage.remove('hege_worker_stats'); // Fresh stats for new session

        if (toAdd.length > 0 && !explicitToAdd) {
            Core.pendingUsers.clear();
            Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
        }

        // Save current page URL (without hege_bg param) so the worker can navigate back when done
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('hege_bg');
        Storage.set('hege_return_url', cleanUrl.toString());

        // CRITICAL: Use history.replaceState + reload to avoid Universal Links entirely.
        // Since we're already on threads.net, we modify the URL in-place (no navigation event)
        // and reload. Safari sees this as a page refresh, NOT a navigation to a new URL,
        // so Universal Links cannot intercept it.
        const workerUrl = new URL(window.location.origin);
        workerUrl.searchParams.set('hege_bg', 'true');
        history.replaceState(null, '', workerUrl.toString());
        location.reload();
    },

    runSameTabReportWorker: () => {
        const q = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);

        if (q.length === 0) {
            UI.showToast('沒有待檢舉的帳號');
            return;
        }

        if (Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []).length === 0) {
            Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, q);
        }
        Storage.remove(CONFIG.KEYS.BG_CMD);
        Storage.set(CONFIG.KEYS.WORKER_MODE, 'report');
        Storage.remove('hege_worker_stats');

        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('hege_bg');
        Storage.set('hege_return_url', cleanUrl.toString());

        const workerUrl = new URL(window.location.origin);
        workerUrl.searchParams.set('hege_bg', 'true');
        history.replaceState(null, '', workerUrl.toString());
        location.reload();
    },

    exportHistory: () => {
        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        if (db.length === 0) { UI.showToast('歷史資料庫是空的'); return; }
        const list = db.join('\n');
        navigator.clipboard.writeText(list).then(() => { UI.showToast(`已複製 ${db.length} 人名單`); }).catch(() => { prompt("請手動複製總名單：", list); });
    },

    retryFailedQueue: () => {
        const failedUsers = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        if (failedUsers.length === 0) {
            UI.showToast('沒有失敗紀錄可重試');
            return;
        }

        UI.showConfirm(`發現 ${failedUsers.length} 筆過去封鎖失敗或找不到人的帳號。\n確定要重新將他們加入排隊列重試嗎？`, () => {
            let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const combinedQueue = [...new Set([...activeQueue, ...failedUsers])];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, combinedQueue);
            Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []); // Clear it out
            UI.showToast(`已將 ${failedUsers.length} 筆名單重送至背景排隊`);

            Core.updateControllerUI();

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
            if (!isRunning) {
                Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    const workerWindow = Utils.openWorkerWindow();
                    if (!workerWindow || workerWindow.closed) {
                        UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                        Core.runSameTabWorker();
                    }
                }
            }
        });
    },

    importList: () => {
        const input = prompt("請貼上 ID 名單："); if (!input) return;
        let rawUsers = input.split(/[\s,，\n]+/).map(u => u.trim()).filter(u => u.length > 0).map(u => {
            u = u.split('?')[0]; // 去除網址帶有的 tracking parameters
            if (u.includes('/@')) return u.split('/@')[1].split('/')[0];
            if (u.startsWith('@')) return u.substring(1);
            return u.split('/')[0];
        });

        // 名單內部自身去重
        rawUsers = [...new Set(rawUsers)];

        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        // 雙重過濾：不在歷史紀錄中，且不在當前的排隊佇列中
        const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u));

        if (newUsers.length === 0) { UI.showToast('沒有新名單可匯入 (皆已在歷史庫或等待佇列中)'); return; }

        const combinedQueue = [...activeQueue, ...newUsers];
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, combinedQueue);

        UI.showToast(`已匯入 ${newUsers.length} 筆至背景佇列`);

        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

        if (!isRunning) {
            UI.showConfirm(`已匯入 ${newUsers.length} 筆名單。\n是否立即開始背景執行？`, () => {
                Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    const workerWindow = Utils.openWorkerWindow();
                    if (!workerWindow || workerWindow.closed) {
                        UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                        Core.runSameTabWorker();
                    }
                }
            });
        } else if (isRunning) {
            UI.showToast('已合併至正在運行的背景任務');
        }
    },

    collectDiagnostics: () => {
        const _platform = navigator.userAgentData?.platform || navigator.platform || '';
        const isIPad = (_platform === 'macOS' || _platform === 'MacIntel') && navigator.maxTouchPoints > 1;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPad;
        const platform = isIOS ? 'iOS/iPad' : 'Desktop';

        // Detect Threads UI language from aria labels
        const svgs = document.querySelectorAll('svg[aria-label]');
        const ariaLabels = Array.from(svgs).map(s => s.getAttribute('aria-label'));
        const hasZh = ariaLabels.some(l => /[\u4e00-\u9fff]/.test(l));
        const hasEn = ariaLabels.some(l => /^[A-Za-z ]+$/.test(l));
        const langDetected = hasZh ? 'zh' : (hasEn ? 'en' : 'unknown');

        // SVG structure of "More" buttons
        const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
        const svgDetails = Array.from(moreSvgs).map(s => {
            const hasCircle = !!s.querySelector('circle');
            const pathCount = s.querySelectorAll('path').length;
            const vb = s.getAttribute('viewBox');
            return `circle=${hasCircle},paths=${pathCount},vb=${vb}`;
        });

        // Menu items if any are open
        const menuItems = document.querySelectorAll('div[role="menuitem"]');
        const menuTexts = Array.from(menuItems).map(el => (el.innerText || '').trim().substring(0, 30));

        // Dialog info
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        const dialogTexts = Array.from(dialogs).map(d => (d.innerText || '').trim().substring(0, 80));

        // Queue states
        const bgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        const cooldownActive = cooldownUntil > Date.now();
        const cooldownRemain = cooldownActive ? Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60)) + 'h' : 'N/A';

        // Worker stats
        const workerStats = Storage.getJSON('hege_worker_stats', {});
        const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});

        // Debug logs
        const debugLogs = Storage.getJSON(CONFIG.KEYS.DEBUG_LOG, []);

        // Checkbox states
        const checkboxes = document.querySelectorAll('.hege-checkbox-container');
        const cbChecked = Array.from(checkboxes).filter(el => el.classList.contains('checked')).length;
        const cbFinished = Array.from(checkboxes).filter(el => el.classList.contains('finished')).length;

        // UserScript manager detection
        let injectionMethod = 'unknown';
        if (typeof GM_info !== 'undefined') injectionMethod = 'Tampermonkey/Userscripts';
        else if (document.querySelector('script[src*="content.js"]')) injectionMethod = 'Chrome Extension';
        else if (typeof browser !== 'undefined' && browser.runtime) injectionMethod = 'Firefox Extension';
        else if (typeof chrome !== 'undefined' && chrome.runtime) injectionMethod = 'Chrome Extension';

        // Build report
        const lines = [
            `🛡️ 留友封 診斷報告`,
            `版本: ${CONFIG.VERSION}`,
            `平台: ${platform} | ${navigator.platform} | TP:${navigator.maxTouchPoints}`,
            `UA: ${navigator.userAgent}`,
            `注入: ${injectionMethod}`,
            `語言: ${langDetected} (偵測自 aria-labels)`,
            `URL: ${location.pathname}${location.search}`,
            ``,
            `── 佇列狀態 ──`,
            `待處理: ${bgQueue.length} | 失敗: ${failedQueue.length} | 冷卻備份: ${cooldownQueue.length}`,
            `冷卻中: ${cooldownActive ? '⚠️ 是 (剩餘 ' + cooldownRemain + ')' : '❌ 否'}`,
            `Worker: ${bgStatus.state || 'idle'} | 最後更新: ${bgStatus.lastUpdate ? new Date(bgStatus.lastUpdate).toLocaleTimeString() : 'N/A'}`,
            ``,
            `── Worker 統計 ──`,
            `成功: ${(workerStats.stats && workerStats.stats.success) || 'N/A'} | 跳過: ${(workerStats.stats && workerStats.stats.skipped) || 'N/A'} | 失敗: ${(workerStats.stats && workerStats.stats.failed) || 'N/A'}`,
            `驗證等級: ${workerStats.verifyLevel || 'N/A'} | 連續失敗: ${workerStats.consecutiveFails || 'N/A'}`,
            `Session 名單: ${(workerStats.sessionQueue && workerStats.sessionQueue.length) || 'N/A'} | 初始 Total: ${workerStats.initialTotal || 'N/A'}`,
            ``,
            `── DOM 快照 ──`,
            `更多按鈕 SVG(${moreSvgs.length}): ${svgDetails.length > 0 ? svgDetails.join(' | ') : '未找到'}`,
            `頁面 aria-labels(${ariaLabels.length}): ${JSON.stringify([...new Set(ariaLabels)])}`,
            `menuitem(${menuTexts.length}): ${menuTexts.length > 0 ? JSON.stringify(menuTexts) : '無'}`,
            `dialogs(${dialogs.length}): ${dialogTexts.length > 0 ? JSON.stringify(dialogTexts) : '無'}`,
            `checkbox: ${checkboxes.length}個 (✅${cbFinished} ☑️${cbChecked})`,
            ``,
            `── 失敗清單 ──`,
            failedQueue.length > 0 ? failedQueue.join(', ') : '(空)',
            ``,
            `── 執行紀錄 (最近${debugLogs.length}筆) ──`,
            ...debugLogs,
            ``,
            `── Web Console 追蹤 (最近50筆) ──`,
            ...Utils.getRecentLogs()
        ];

        return lines.join('\n');
    },

    showReportDialog: () => {
        const reportData = Core.collectDiagnostics();

        UI.showBugReportModal(async (level, message) => {
            return await Reporter.submitReport(level, message, "UI_REPORT", {
                diagnostics: reportData,
                speedMode: Utils.getSpeedMode(),
                checkboxDiag: Utils.getDiagLogs()
            });
        });
    },
};
