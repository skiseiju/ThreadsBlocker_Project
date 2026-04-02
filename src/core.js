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

    init: () => {
        Core.pendingUsers = new Set(Storage.getSessionJSON(CONFIG.KEYS.PENDING));

        const hasAgreed = Storage.get(CONFIG.KEYS.DISCLAIMER_AGREED);

        if (CONFIG.DEBUG_MODE) console.log(`[留友封] 初始化完成, 版本: ${CONFIG.VERSION}, Mobile: ${Utils.isMobile()}`);
        if (!hasAgreed) {
            UI.showDisclaimer(() => {
                Storage.set(CONFIG.KEYS.DISCLAIMER_AGREED, 'true');
                Core.startScanner();
                Core.checkPostQueueWakeup();
            });
        } else {
            Core.startScanner();
            Core.checkPostQueueWakeup();
        }
        
        // 處理深層收割自動觸發
        const params = new URLSearchParams(window.location.search);
        if (params.get('hege_post_sweep') === 'true') {
            setTimeout(() => {
                Core.executePostSweep();
            }, 3000); // 確保核心載入完畢
        }
    },


    executePostSweep: async () => {
        UI.showToast('🚀 正在準備執行貼文深層收割...', 5000);
        await Utils.safeSleep(1000);
        
        let likesLink = null;
        for (let i = 0; i < 15; i++) {
            const allLinks = document.querySelectorAll('a[role="link"], span[role="link"]');
            for (const link of allLinks) {
                const text = (link.innerText || link.textContent || '').trim().toLowerCase();
                if (/\d+.*?(讚|like)/i.test(text) && !link.closest('[role="dialog"]')) {
                    likesLink = link;
                    break;
                }
            }
            if (!likesLink) {
                const likedByLinks = document.querySelectorAll('a[href*="liked_by"]');
                if (likedByLinks.length > 0) likesLink = likedByLinks[0];
            }
            if (likesLink) break;
            await Utils.safeSleep(400);
        }
        
        if (!likesLink) {
            UI.showToast('⚠️ 未找到按讚名單，可能為無人按讚之貼文。完成查核，將從定時排程移除。', 5000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        Utils.simClick(likesLink);
        
        // 等待對話框開啟
        await Utils.safeSleep(2000);
        
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length === 0) {
            UI.showToast('⚠️ 對話框開啟失敗，終止本次收割。', 3000);
            return;
        }
        
        const activeCtx = dialogs[dialogs.length - 1];
        
        // 收割 N 人 (BATCH_SIZE)
        const batchSize = CONFIG.POST_SWEEP_BATCH_SIZE || 30;
        let collectedLinks = new Set();
        let scrollBox = activeCtx;
        
        if (activeCtx.scrollHeight === activeCtx.clientHeight) {
            const innerBoxes = activeCtx.querySelectorAll('div');
            for (let b of innerBoxes) {
                if (b.scrollHeight > b.clientHeight && window.getComputedStyle(b).overflowY !== 'hidden') {
                    scrollBox = b;
                    break;
                }
            }
        }
        
        // 取得已處理過的 usernames 防止無限輪迴
        const processedSetKey = 'hege_post_sweep_processed_' + window.location.pathname;
        const processedList = Storage.getJSON(processedSetKey, []);
        const processedSet = new Set(processedList);
        
        for (let i = 0; i < 50; i++) {
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            Array.from(links).forEach(a => {
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                if (!isHeaderLink) {
                    const href = a.getAttribute('href');
                    const u = href.split('/@')[1].split('/')[0];
                    collectedLinks.add(u);
                }
            });
            
            if (collectedLinks.size >= batchSize) break;
            
            if (i > 0) scrollBox.scrollBy({ top: 300, behavior: 'smooth' });
            await Utils.safeSleep(600);
        }
        
        const myUser = Utils.getMyUsername() || "";
        const postOwner = Utils.getPostOwner() || "";
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        
        const rawUsers = Array.from(collectedLinks)
            .filter(u => u !== myUser && u !== postOwner && !db.has(u));
            
        // 檢查無限輪迴重疊率
        const allProcessed = rawUsers.every(u => processedSet.has(u));
        if (rawUsers.length > 0 && allProcessed) {
            UI.showToast('🚨 偵測到無限遞補迴圈 (畫面上全部都是曾經收割過的帳號)，強制終止。', 6000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        const newUsers = rawUsers.filter(u => !processedSet.has(u));
        
        if (newUsers.length === 0) {
            UI.showToast('✅ 查核完畢：畫面上已無新帳號。將此貼文從水庫排程移除。', 5000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        Storage.setJSON(processedSetKey, [...new Set([...processedList, ...newUsers])]);
        
        const targetUsers = newUsers.slice(0, batchSize);
        
        // Task 3: 遞補失敗防呆機制 (比較本次新名單與上一批次 30 人)
        const lastBatchKey = 'hege_last_sweep_batch_' + window.location.pathname;
        const lastBatchStr = sessionStorage.getItem(lastBatchKey);
        if (lastBatchStr) {
            try {
                const lastBatch = JSON.parse(lastBatchStr);
                const intersection = targetUsers.filter(u => lastBatch.includes(u));
                const overlapRate = intersection.length / targetUsers.length;
                UI.showToast(`[驗證] 上批與這批重複率: ${(overlapRate * 100).toFixed(0)}%`, 5000);
                
                // 若重複率過高，代表封鎖失效或 Threads API 尚未遞補
                if (overlapRate > 0.8) {
                    UI.showToast('🚨 [FATAL] 偵測到遞補卡死 (上批名單未消失)，防呆機制啟動，強制進入 8 小時冷卻。', 10000);
                    console.error('[FATAL] Sweep stuck in infinite loop breaker. Aborting.', { lastBatch, targetUsers });
                    
                    // 強制解除 Post Queue 的 lock 狀態，設定時間戳為現在，啟動 8hr 冷卻
                    let postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    let qIndex = postQueue.findIndex(q => q.url.split('?')[0] === window.location.href.replace(/([&?])hege_post_sweep=true/, '').split('?')[0]);
                    if (qIndex > -1) {
                        postQueue[qIndex].status = 'pending';
                        postQueue[qIndex].lastSweptAt = Date.now();
                        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, postQueue);
                    }
                    sessionStorage.removeItem(lastBatchKey);
                    sessionStorage.removeItem('hege_post_sweep_lock'); // 解鎖
                    return;
                }
            } catch(e) {}
        }

        // 更新最後一批名單
        sessionStorage.setItem(lastBatchKey, JSON.stringify(targetUsers));
        
        // Task 2: 全自動加入水庫並執行封鎖
        let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);
        const toAdd = targetUsers.filter(u => !activeSet.has(u));

        if (toAdd.length > 0) {
            const combinedQueue = [...activeQueue, ...toAdd];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
            UI.showToast(`✅ [深層清理] 成功圈選 ${toAdd.length} 人，已全自動送入背景水庫執行！`);
            Core.updateControllerUI();

            // 若目前 Worker 沒有在跑，強制啟動它
            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
            if (!isRunning) {
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    UI.showConfirm('需要您的授權重啟背景視窗 ⚙️\n\n因為瀏覽器防護機制，我們無法自動為您彈出執行視窗。\n請在此點擊「確定」來授權開啟，接續未完成的深層清理任務！', () => {
                        Utils.openWorkerWindow();
                    });
                }
            }

            // Task 3: 監聽水庫清空，觸發 Reload 進入下一圈
            const checkEmptyInterval = setInterval(() => {
                const currentQ = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (currentQ.length === 0) {
                    clearInterval(checkEmptyInterval);
                    UI.showToast('🔄 [深層迴圈] 單批水庫全數清空，準備 Reload 頁面汲取下一批新名單...', 5000);
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }
            }, 5000);

        } else {
            UI.showToast('⚠️ 名單皆已排入佇列，繼續等待。');
        }
    },
    
    removeCurrentPostFromQueue: () => {
        const queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        const cleanUrl = window.location.href.split('?')[0];
        const originalLength = queue.length;
        const newQueue = queue.filter(q => q.url.split('?')[0] !== cleanUrl);
        
        if (newQueue.length < originalLength) {
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, newQueue);
            console.log(`[DeepSweep-Q] 任務清空或異常終止，已將貼文從水庫永久解編: ${cleanUrl}`);
        }
        
        const processedSetKey = 'hege_post_sweep_processed_' + window.location.pathname;
        Storage.remove(processedSetKey); // 清理暫存
        
        UI.showToast('🎉 [深層清理] 此貼文已全數清空！任務圓滿達成，準備關閉任務...', 5000);
        
        setTimeout(() => {
            if (window.name === 'HegeSweepWorker') {
                window.close();
            } else {
                let pureUrl = window.location.href.replace(/([&?])hege_post_sweep=true/, '');
                if (pureUrl.endsWith('?') || pureUrl.endsWith('&')) pureUrl = pureUrl.substring(0, pureUrl.length - 1);
                window.location.replace(pureUrl);
            }
        }, 3000);
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
                                const hasBtn = p ? !!p.querySelector('.hege-block-all-btn') : false;

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
                                if (isDialog && ['讚', '引用', '轉發', '貼文動態', '活動', 'Likes'].some(t => hText.includes(t))) {
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

    saveToDB: (username) => {
        if (!username) return;
        username = username.replace('@', '').trim();
        let dbArray = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        let db = new Set(dbArray);
        if (!db.has(username)) {
            db.add(username);
            Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);

            // Also ensure timestamp is recorded
            let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
            if (!ts[username]) {
                ts[username] = Date.now();
                Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
            }
        }
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

        const myUser = Utils.getMyUsername();
        const postOwner = Utils.getPostOwner();
        const skipUsers = new Set();
        if (myUser) skipUsers.add(myUser);
        if (postOwner) skipUsers.add(postOwner);

        const allText = ctx.innerText || ctx.textContent || "";
        const replyMatch = allText.match(/(?:正在回覆|Replying to)\s*@([a-zA-Z0-9._]+)/i);
        if (replyMatch && replyMatch[1]) skipUsers.add(replyMatch[1]);

        let rawUsers = Array.from(collectedLinks).filter(u => !skipUsers.has(u));

        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u) && !Core.pendingUsers.has(u));

        if (newUsers.length === 0) {
            UI.showToast('沒有新帳號可加入');
            return;
        }

        newUsers.forEach(u => Core.pendingUsers.add(u));
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

        if (isRunning) {
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

    addPostTask: (url) => {
        let postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        let cleanUrl = url.split('?')[0];
        if (!postQueue.some(p => p.url.split('?')[0] === cleanUrl)) {
            postQueue.push({
                url: cleanUrl,
                last_executed_at: 0, 
                added_at: Date.now()
            });
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, postQueue);
            UI.showToast(`✅ 已將貼文加入深層清理排程（每 8 小時回訪）`);
        } else {
            UI.showToast(`此貼文已在排程中`);
        }
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
                const isExcludeCtx = ['回覆', '回文', 'Reply', 'Replies', '回應', '新串文', 'New thread', '發佈串文', 'Post', '編輯', 'Edit'].some(t => text.includes(t));
                if (isExcludeCtx) continue;

                if (isDialog || ['貼文動態', '讚', 'Likes', '引用', '轉發', '活動'].some(t => text.includes(t))) {
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

        const isLikesLayer = ['讚', 'Likes'].some(t => titleText.includes(t));
        const existingBlockAll = localCtx.querySelector('.hege-block-all-btn');
        const existingEndless = localCtx.querySelector('.hege-endless-sweep-btn');

        if (!isLikesLayer && existingEndless) {
            existingEndless.remove();
        }

        let blockAllBtn = existingBlockAll;
        let endlessSweepBtn = existingEndless;
        
        let shouldAddBlockAll = !existingBlockAll || !document.body.contains(existingBlockAll);
        let shouldAddEndless = isLikesLayer && (!existingEndless || !document.body.contains(existingEndless));

        if (!shouldAddBlockAll && !shouldAddEndless) return;

        if (shouldAddBlockAll) {
            blockAllBtn = document.createElement('div');
            blockAllBtn.className = 'hege-block-all-btn';
            blockAllBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                <span>殺螂囉~</span>
            `;

            const bgMode = Core.getBgMode();
            if (bgMode === 'UNBLOCKING') {
                blockAllBtn.style.opacity = '0.5';
                blockAllBtn.style.filter = 'grayscale(1)';
                blockAllBtn.style.cursor = 'not-allowed';
                blockAllBtn.title = '正在解除封鎖，暫時無法封鎖';
            }
        }

        const handleBlockAll = (e) => {
            if (Core.getBgMode() === 'UNBLOCKING') {
                UI.showToast('目前正在「解除封鎖」，請先暫停任務再執行封鎖');
                return;
            }
            e.stopPropagation();
            e.preventDefault();

            // Beta 56: Re-calculate context and bounds at click-time for maximum precision
            const activeCtx = Core.getTopContext();
            
            // Task 3: 進階同列全封 (自動捲動收集未顯示名單)
            if (Storage.get(CONFIG.KEYS.ADVANCED_SCROLL_ENABLED) === 'true') {
                Core.advancedBlockAll(activeCtx);
                return;
            }

            const containerRect = activeCtx.getBoundingClientRect();

            // Narrow search scope to prevent "bleeding" into background layers if the list is short
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            let rawUsers = Array.from(links).filter(a => {
                const rect = a.getBoundingClientRect();
                // 1. Must be visible and have dimensions
                const isVisible = rect.height > 5 && rect.width > 5;
                // 2. Must be within the visual viewport of the active dialog
                // Adding a small 10px buffer to account for padding/rounding
                const isInBounds = rect.top >= (containerRect.top - 10) &&
                    rect.bottom <= (containerRect.bottom + 10);

                // 3. Avoid IDs in headers (labels) to focus on the actual list items
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');

                return isVisible && isInBounds && !isHeaderLink;
            }).map(a => {
                const href = a.getAttribute('href');
                return href.split('/@')[1].split('/')[0];
            });

            const myUser = Utils.getMyUsername();
            const postOwner = Utils.getPostOwner();
            const skipUsers = new Set();
            if (myUser) skipUsers.add(myUser);
            if (postOwner) skipUsers.add(postOwner);

            // Beta 55: Scan for "Replying to @username" (正在回覆 @username)
            // This is crucial for comment activity views.
            const allText = activeCtx.innerText || activeCtx.textContent || "";
            const replyMatch = allText.match(/(?:正在回覆|Replying to)\s*@([a-zA-Z0-9._]+)/i);
            if (replyMatch && replyMatch[1]) {
                skipUsers.add(replyMatch[1]);
            }

            rawUsers = [...new Set(rawUsers)].filter(u => !skipUsers.has(u));

            const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const activeSet = new Set(activeQueue);

            const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u) && !Core.pendingUsers.has(u));

            if (newUsers.length === 0) {
                UI.showToast('沒有新帳號可加入');
                return;
            }

            newUsers.forEach(u => Core.pendingUsers.add(u));
            Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

            if (isRunning) {
                const combinedQueue = [...activeQueue, ...Core.pendingUsers];
                Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
                UI.showToast(`已將畫面上 ${newUsers.length} 筆帳號加入背景排隊`);
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
        };

        // Add endless sweep button UI
        if (shouldAddEndless) {
            endlessSweepBtn = document.createElement('div');
            endlessSweepBtn.className = 'hege-endless-sweep-btn';
            endlessSweepBtn.style.cssText = 'background-color: #ff3b30; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 14px; border-radius: 9px; color: white; font-weight: bold; font-size: 14px; border: 1px solid rgba(255,255,255,0.2); position: absolute; left: 56px; z-index: 10;';
            endlessSweepBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M2.5 2v6h6M21.5 22v-6h-6M22 11.5A10 10 0 0 0 3.2 7.2L2.5 8M2 12.5a10 10 0 0 0 18.8 4.2l.7-.8"></path></svg>
                <span style="display:none;" class="hege-desktop-text">定點絕</span>
            `;
            endlessSweepBtn.title = "定點絕：圈選畫面上即將顯示的全數帳號，並在封鎖完畢後自動換頁繼續圈選";
            endlessSweepBtn.dataset.hegeRole = 'endless-sweep'; // 穩定識別用，不依賴 title（title 會被 updateControllerUI 清空）
            
            // Show text on desktop
            if (!Utils.isMobile() && window.innerWidth > 600) {
                const spanTextNode = endlessSweepBtn.querySelector('.hege-desktop-text');
                if (spanTextNode) spanTextNode.style.display = 'inline';
            }
        }

        const handleEndlessSweep = (e) => {
            if (e) {
                e.stopPropagation(); e.preventDefault();
            }
            console.log('[DEBUG] handleEndlessSweep 被觸發了！');
            
            const isManualClick = !window.__hege_is_auto_click;
            if (isManualClick) {
                // 手動按鈕啟動，清洗掉上一輪可能殘留的死迴圈旗標以防誤觸
                sessionStorage.removeItem('hege_endless_last_first_user');
                sessionStorage.removeItem('hege_auto_triggered_once');
            }
            window.__hege_is_auto_click = false; // Reset for safety

            try {
                let activeCtx = null;
                // 利用觸發事件的按鈕往上尋找，是最準確拿到該層 Dialog 的方式
                if (e && e.target && e.target instanceof Element) {
                    activeCtx = e.target.closest('div[role="dialog"]');
                }
                activeCtx = activeCtx || Core.getTopContext();
                console.log('[DEBUG] activeCtx 取得:', activeCtx);
            
            // Re-run precise grab logic for endless grab, adding visibility check to ignore hidden DOM layers
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            let endlessRawUsers = Array.from(links).filter(a => {
                const rect = a.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.right > 0;
            }).map(a => {
                const href = a.getAttribute('href');
                return href.split('/@')[1].split('/')[0];
            });

            const skipUsers = new Set();
            if (Utils.getMyUsername()) skipUsers.add(Utils.getMyUsername());
            if (Utils.getPostOwner()) skipUsers.add(Utils.getPostOwner());

            endlessRawUsers = [...new Set(endlessRawUsers)].filter(u => !skipUsers.has(u));
            const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const activeSet = new Set(activeQueue);

            const newEndlessUsers = endlessRawUsers.filter(u => !db.has(u) && !activeSet.has(u)).slice(0, 10);

            if (newEndlessUsers.length === 0) {
                if (!isManualClick) {
                    sessionStorage.removeItem('hege_endless_state');
                    sessionStorage.removeItem('hege_endless_target');
                    sessionStorage.removeItem('hege_endless_last_first_user');
                    sessionStorage.removeItem('hege_auto_triggered_once');
                    Storage.remove('hege_endless_worker_standby');
                    UI.showConfirm('🎉 巡邏結束：畫面上無新帳號可封鎖！\n\n大清理完畢！是否自動將這篇熱門貼文加入【每 8 小時自動巡邏】清單？', () => {
                        const targetUrl = window.location.href.split('?')[0];
                        if (typeof Core.addPostTask === 'function') Core.addPostTask(targetUrl);
                    });
                } else {
                    UI.showToast('⚠️ 畫面上無可被定點絕的新帳號');
                }
                return;
            }

            // Loop Protection Check
            // isAutoResumed = true 代表這是 RELOADING 後的第一次自動觸發，應跳過誤判風險高的比對
            const isAutoResumed = sessionStorage.getItem('hege_auto_triggered_once') !== 'true';
            const lastFirstUser = sessionStorage.getItem('hege_endless_last_first_user');
            if (!isAutoResumed && lastFirstUser && lastFirstUser === newEndlessUsers[0]) {
                console.log(`[Task 3] INFINITE LOOP DETECTED. Prev First User = ${lastFirstUser}, Current = ${newEndlessUsers[0]}. Aborting.`);
                sessionStorage.removeItem('hege_endless_state');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                sessionStorage.removeItem('hege_auto_triggered_once');
                Storage.remove('hege_endless_worker_standby');
                UI.showConfirm('⚠️ 偵測到名單重複迴圈，定點絕中止。\n\n這通常是因為本梯次已掃蕩完畢。是否自動將此貼文加入【每 8 小時自動巡邏】常駐清單交由背景處理？', () => {
                    const targetUrl = window.location.href.split('?')[0];
                    if (typeof Core.addPostTask === 'function') Core.addPostTask(targetUrl);
                });
                return;
            }

            // Arm the endless harvester
            sessionStorage.setItem('hege_endless_last_first_user', newEndlessUsers[0]);
            sessionStorage.setItem('hege_auto_triggered_once', 'true'); // 標記已觸發過一次，下次須進行死迴圈比對
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set([...activeQueue, ...newEndlessUsers])]);
            newEndlessUsers.forEach(u => Core.pendingUsers.add(u));
            sessionStorage.setItem('hege_endless_state', 'WAIT_FOR_BG');
            Storage.set('hege_endless_worker_standby', 'true');
            sessionStorage.setItem('hege_endless_target', window.location.href);
            Core.updateControllerUI();

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isWorkerRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && (status.state === 'running' || status.state === 'idle'));
            if (!isWorkerRunning) {
                console.log('[DEBUG] 偵測到 Worker 未執行，強制喚醒以消化定點絕佇列...');
                Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'running', lastUpdate: Date.now() });
                Storage.remove(CONFIG.KEYS.BG_CMD);
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    if (!isManualClick) {
                        UI.showConfirm('需要您的授權重啟背景視窗 ⚙️\n\n因為瀏覽器防護機制，我們無法自動為您彈出執行視窗。\n請在此點擊「確定」來授權開啟，接續未完成的定點絕任務！', () => {
                            Utils.openWorkerWindow();
                        });
                    } else {
                        Utils.openWorkerWindow();
                    }
                }
            }
            
            console.log(`[Endless Harvester] Triggered. ${newEndlessUsers.length} users added. State: WAIT_FOR_BG.`);
            UI.showToast(`[定點絕啟動] 已抓取 ${newEndlessUsers.length} 人。等待背景執行中...`);
            
            Core.updateControllerUI();
            if (typeof Core.startEndlessMonitor === 'function') Core.startEndlessMonitor();
            } catch (err) {
                console.error('[DEBUG] handleEndlessSweep 發生例外錯誤:', err);
                alert('定點絕發生錯誤:\n' + err.message);
            }
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

        if (shouldAddBlockAll) attachEvents(blockAllBtn, handleBlockAll);
        if (shouldAddEndless) attachEvents(endlessSweepBtn, handleEndlessSweep);

        if (sortSpan && sortSpan.closest('[role="button"]')) {
            const sortBtn = sortSpan.closest('[role="button"]');
            
            if (shouldAddBlockAll) {
                blockAllBtn.style.marginRight = '8px';
                try {
                    sortBtn.parentElement.style.display = 'flex';
                    sortBtn.parentElement.style.alignItems = 'center';
                    sortBtn.parentElement.insertBefore(blockAllBtn, sortBtn);
                } catch (e) {
                    headerContainer.appendChild(blockAllBtn);
                }
            }
        } else {
            if (shouldAddBlockAll) {
                blockAllBtn.style.marginLeft = 'auto';
                blockAllBtn.style.marginRight = '8px';
                if (header.nextSibling) {
                    headerContainer.insertBefore(blockAllBtn, header.nextSibling);
                } else {
                    headerContainer.appendChild(blockAllBtn);
                }
            }
        }

        if (shouldAddEndless) {
            if (window.getComputedStyle(headerContainer).position === 'static') {
                headerContainer.style.position = 'relative';
            }
            headerContainer.appendChild(endlessSweepBtn);
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
                if (isDialog || ['讚', '引用', '轉發', '貼文動態', '活動', 'Likes'].some(t => tempText.includes(t))) {
                    header = h;
                }
            }
        }
        if (!header) return;

        const links = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter(a => {
            // Only filter truly invisible elements (display:none, zero-size); allow off-screen items
            const rect = a.getBoundingClientRect();
            return rect.height > 0 || a.offsetParent !== null;
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
                }
            } else if (targetAction === 'uncheck' && box.classList.contains('checked')) {
                box.classList.remove('checked');
                // Remove from queue where username matches
                Array.from(Core.blockQueue).forEach(b => {
                    if (b.dataset && b.dataset.username === u) Core.blockQueue.delete(b);
                });
                if (u) {
                    Core.pendingUsers.delete(u);
                    let bg = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    if (bg.includes(u)) Storage.setJSON(CONFIG.KEYS.BG_QUEUE, bg.filter(x => x !== u));
                    let cdq = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
                    if (cdq.includes(u)) Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, cdq.filter(x => x !== u));
                    let dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                    if (dq.includes(u)) Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, dq.filter(x => x !== u));
                }
            } else if (targetAction === 'check' && !box.classList.contains('checked') && !box.classList.contains('finished')) {
                box.classList.add('checked');
                if (btnElement) btnElement.dataset.username = u;
                if (btnElement) Core.blockQueue.add(btnElement);
                if (u) Core.pendingUsers.add(u);
            }
        });

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



    checkCockroachRadar: (rawUsers, countOverride) => {
        const count = countOverride || (rawUsers ? rawUsers.length : 0);
        if (count < 30) return;

        const postOwner = Utils.getPostOwner();
        if (!postOwner) return;

        const dbRaw = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
        const cockroachSet = new Set(dbRaw.map(x => x.username || x));
        if (cockroachSet.has(postOwner)) return;

        UI.showConfirm(
            `【大蟑螂雷達】偵測到您單次圈選了 ${count} 人。\n\n是否將該發文者 ( @${postOwner} ) 列為「大蟑螂」？\n我們將自動跳過封鎖他，並在每 10 天提醒您回頭檢查蟑螂窩。`,
            () => {
                const timeNow = Date.now();
                const db = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                db.push({ username: postOwner, timestamp: timeNow });
                Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, db);

                // 解除封鎖排隊並取消畫面勾選
                Core.pendingUsers.delete(postOwner);
                Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
                
                let bgq = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (bgq.includes(postOwner)) Storage.setJSON(CONFIG.KEYS.BG_QUEUE, bgq.filter(u => u !== postOwner));
                
                let dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                if (dq.includes(postOwner)) Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, dq.filter(u => u !== postOwner));

                Core.updateControllerUI();
                UI.showToast(`已標記 @${postOwner} 為大蟑螂，並解除其封鎖排隊！`);
            }
        );
    },

    openCockroachManager: (onBack = null) => {
        try {
            const db = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
            UI.showCockroachManager(db, (usersToRemove) => {
                const currentDb = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                const newDb = currentDb.filter(c => {
                    const uname = (typeof c === 'string') ? c : (c.username || '');
                    return !usersToRemove.includes(uname);
                });
                Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, newDb);
                UI.showToast(`已從大蟑螂資料庫中移除 ${usersToRemove.length} 名使用者`);
                Core.openCockroachManager(onBack);
            }, onBack);
        } catch (e) {
            alert('Core Error: ' + e.message + '\n' + e.stack);
        }
    },

    startEndlessMonitor: () => {
        const cleanup = () => {
            if (Core.endlessMonitorTimer) {
                clearInterval(Core.endlessMonitorTimer);
                Core.endlessMonitorTimer = null;
            }
            if (Core.endlessWorkerTimer) {
                Core.endlessWorkerTimer.terminate();
                Core.endlessWorkerTimer = null;
            }
            if (Core.endlessStorageHandler) {
                window.removeEventListener('storage', Core.endlessStorageHandler);
                Core.endlessStorageHandler = null;
            }
            if (Core.endlessVisHandler) {
                document.removeEventListener('visibilitychange', Core.endlessVisHandler);
                Core.endlessVisHandler = null;
            }
            if (Core.endlessMessageHandler) {
                window.removeEventListener('message', Core.endlessMessageHandler);
                Core.endlessMessageHandler = null;
            }
        };

        cleanup(); // Cleanup any existing hooks

        const checkEndlessQueue = () => {
            const state = sessionStorage.getItem('hege_endless_state');
            if (state !== 'WAIT_FOR_BG') {
                cleanup();
                return;
            }
            
            // 如果這時標記已被使用者在 Worker 那端拔掉，就中止
            if (Storage.get('hege_endless_worker_standby') !== 'true') {
                console.log('[Task 3] Endless Worker Standby flag removed. Aborting endless loop.');
                cleanup();
                sessionStorage.removeItem('hege_endless_state');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                sessionStorage.removeItem('hege_auto_triggered_once');
                UI.showToast('✅ 定點絕已被手動終止。');
                return;
            }

            const bgq = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            if (bgq.length === 0) {
                console.log('[Task 3] BG Queue empty. Reloading for next batch.');
                cleanup();
                sessionStorage.setItem('hege_endless_state', 'RELOADING');
                sessionStorage.removeItem('hege_auto_triggered_once'); // 清除旗標，讓下一輪 reload 可以接軌
                UI.showToast('[定點絕] 第一批次清理完畢，準備重新整理載入下一批名單...');
                setTimeout(() => location.reload(), 1500);
            } else {
                if (CONFIG.DEBUG_MODE) console.log(`[Task 3] BG Queue count: ${bgq.length}. Waiting...`);
            }
        };

        // 1. Storage Event Listener (Instant Wakeup from Worker cross-origin)
        Core.endlessStorageHandler = (e) => {
            if (e.key === CONFIG.KEYS.BG_QUEUE || e.key === 'hege_endless_worker_standby') {
                checkEndlessQueue();
            }
        };
        window.addEventListener('storage', Core.endlessStorageHandler);

        // 2. Visibility Change (Catch-up when user returns to tab)
        Core.endlessVisHandler = () => {
            if (document.visibilityState === 'visible') {
                checkEndlessQueue();
            }
        };
        document.addEventListener('visibilitychange', Core.endlessVisHandler);

        // 2.5 Message Event Listener (Fallback from Worker postMessage)
        Core.endlessMessageHandler = (e) => {
            if (e.data === 'HEGE_WAKEUP_RELOAD') {
                checkEndlessQueue();
            }
        };
        window.addEventListener('message', Core.endlessMessageHandler);

        // 3. Web Worker Blob Timer (Bypass Safari Background Throttling)
        try {
            const blobCode = `
                let timer = null;
                self.onmessage = function(e) {
                    if (e.data === 'start') {
                        timer = setInterval(() => self.postMessage('tick'), 3000);
                    } else if (e.data === 'stop') {
                        clearInterval(timer);
                    }
                };
            `;
            const blob = new Blob([blobCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            Core.endlessWorkerTimer = new Worker(workerUrl);
            Core.endlessWorkerTimer.onmessage = () => {
                checkEndlessQueue();
            };
            Core.endlessWorkerTimer.postMessage('start');
        } catch (e) {
            console.warn('[Task 3] Failed to start Blob Worker (CSP?), falling back to setInterval', e);
            Core.endlessMonitorTimer = setInterval(checkEndlessQueue, 3000);
        }
    },

    resumeEndlessSweep: () => {
        console.log('[Task 2] Detected RELOADING state. Attempting to click Likes button...');
        UI.showToast('定點絕：自動讀取下一批名單中...', 5000);
        
        let attempts = 0;
        const findLikesTimer = setInterval(() => {
            attempts++;
            if (attempts > 60) { // 30 seconds timeout to account for heavy SPA loading
                clearInterval(findLikesTimer);
                console.log('[Task 2] Timeout waiting for Likes/Activity button. Aborting.');
                sessionStorage.removeItem('hege_endless_state');
                Storage.remove('hege_endless_worker_standby');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                UI.showToast('⚠️ 無法自動尋找按讚名單或查看動態，定點絕已中止。');
                return;
            }

            // Priority 1: Activity button (查看動態 / View activity)
            const buttons = document.querySelectorAll('div[role="button"] span[dir="auto"]');
            let targetLink = null;
            for (let span of buttons) {
                const text = (span.innerText || span.textContent || '').trim();
                if (text.includes('查看動態') || text.includes('View activity') || text.includes('活動')) {
                    targetLink = span.closest('div[role="button"]');
                    break;
                }
            }

            // Priority 2: Traditional Likes link
            if (!targetLink) {
                const links = document.querySelectorAll('a[href*="/likes/"], a[href*="/quotes/"], a[href*="/reposts/"]');
                for (let a of links) {
                    const text = (a.innerText || a.textContent || '').toLowerCase();
                    if (text.includes('讚') || text.includes('likes') || text.match(/\d+/)) {
                        targetLink = a;
                        break;
                    }
                }
            }

            if (targetLink) {
                clearInterval(findLikesTimer);
                Utils.simClick(targetLink);
                console.log('[Task 2] Clicked Action 1: "查看動態". Polling for Action 2...');
                
                // Poll for Action 2 ("按讚內容")
                let action2Attempts = 0;
                const findAction2Timer = setInterval(() => {
                    action2Attempts++;
                    if (action2Attempts > 40) { // 20 seconds timeout
                        clearInterval(findAction2Timer);
                        console.log('[Task 2] Timeout waiting for Action 2 (按讚內容). Aborting.');
                        sessionStorage.removeItem('hege_endless_state');
                        Storage.remove('hege_endless_worker_standby');
                        UI.showToast('⚠️ 無法自動尋找按讚內容，定點絕連鎖已中止。');
                        return;
                    }

                    const activeCtx = document.querySelector('div[role="dialog"]') || document;
                    let likesTab = null;
                    const spans = activeCtx.querySelectorAll('span[dir="auto"]');
                    for (let span of spans) {
                        const text = (span.innerText || span.textContent || '').trim();
                        // 避免去點擊到數字，明確配對文字
                        if (text === '按讚內容' || text === 'Likes' || text === '讚') {
                            likesTab = span.closest('div[role="tab"], div[role="button"], div[class*="x6s0dn4"][class*="x1qv9dbp"]');
                            if (likesTab) break;
                        }
                    }

                    if (likesTab) {
                        clearInterval(findAction2Timer);
                        console.log('[Task 2] Found Action 2: "按讚內容". Clicking it... Polling for Action 3...');
                        Utils.simClick(likesTab);

                        // Poll for Endless Harvester button (Action 3)
                        let action3Attempts = 0;
                        const findAction3Timer = setInterval(() => {
                            action3Attempts++;
                            if (action3Attempts > 40) { // 20 seconds
                                clearInterval(findAction3Timer);
                                sessionStorage.removeItem('hege_endless_state');
                                Storage.remove('hege_endless_worker_standby');
                                UI.showToast('⚠️ 名單載入過久，無法觸發定點絕按鈕。');
                                return;
                            }

                            const endlessBtn = document.querySelector('[data-hege-role="endless-sweep"]');
                            const finalCtx = endlessBtn ? (endlessBtn.closest('div[role="dialog"]') || Core.getTopContext()) : (Core.getTopContext() || document);

                            if (endlessBtn) {
                                // 雙重條件：按鈕存在 + 名單有足夠可封鎖帳號（防止 Dialog 剛出現就過早觸發）
                                const links = finalCtx.querySelectorAll('a[href^="/@"]');
                                const dbSet = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                                const bgqSet = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));
                                const validCount = Array.from(links).filter(a => {
                                    const rect = a.getBoundingClientRect();
                                    return rect.width > 0 && rect.height > 0 && rect.right > 0;
                                }).map(a => a.getAttribute('href').split('/@')[1].split('/')[0])
                                  .filter(u => !dbSet.has(u) && !bgqSet.has(u)).length;

                                if (validCount >= 3) {
                                    clearInterval(findAction3Timer);
                                    console.log(`[Task 2] Found Action 3 with ${validCount} valid users. Triggering sweep!`);
                                    window.__hege_is_auto_click = true;
                                    Utils.simClick(endlessBtn);
                                } else {
                                    // 名單還不夠，繼續等待渲染（不強制捲動避免干擾 Threads 虛擬列表）
                                    console.log(`[Task 2] Button found but only ${validCount} valid users. Waiting for list to render...`);
                                }
                            }
                        }, 500);
                    }
                }, 500);
            }
        }, 500);
    },

    openBlockManager: () => {
        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        const ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        UI.showBlockManager(db, ts, (toUnblock) => {
            Core.startUnblock(toUnblock);
        });
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
            if (Utils.isMobile()) {
                Core.runSameTabWorker();
            } else {
                Utils.openWorkerWindow();
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
        const dq = new Set(Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []));

        // Global cleanup
        let pendingChanged = false;
        for (const u of Core.pendingUsers) {
            if (db.has(u) || cdq.has(u) || bgq.has(u) || dq.has(u)) {
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
            } else if (Core.pendingUsers.has(u) || cdq.has(u) || bgq.has(u) || dq.has(u)) {
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
            badgeText = `(${cdQueueSize}冷卻中)`;
        } else {
            const delayEnabled = Storage.get(CONFIG.KEYS.DELAYED_BLOCK_ENABLED) === 'true';
            const delayedQueue = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
            const lastTime = parseInt(Storage.get(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
            const now = Date.now();
            const delayMs = CONFIG.DELAY_HOURS * 60 * 60 * 1000;
            const isDelayReady = delayEnabled && delayedQueue.length > 0 && (lastTime === 0 || (now - lastTime) >= delayMs);

            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            if (bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 10000)) {
                shouldShowStop = true;
                mainText = `${isUnblockTask ? '解除封鎖' : '背景執行'}中 剩餘 ${bgStatus.total}`;
                headerColor = '#4cd964';
                badgeText = `(${bgStatus.total}剩餘)`; // Show progress in header badge explicitly
            } else if (bgq.size > 0) {
                // Worker stopped/idle but queue has remaining items from a previous run
                mainText = `${isUnblockTask ? '繼續解除' : '繼續封鎖'} (${bgq.size} 筆待處理)`;
                headerColor = '#ff9500';
                badgeText = `(${bgq.size}待處理)`;
            } else if (isDelayReady) {
                // 延時水庫準備發放提示
                mainText = `💧 點擊釋放下一批 100 人`;
                headerColor = '#0a84ff';
                badgeText = `(${delayedQueue.length}人排隊中)`;
            } else if (delayEnabled && delayedQueue.length > 0) {
                // 水庫冷卻中狀態展示（但不要擋住一般勾選後的 "開始封鎖"）
                if (Core.pendingUsers.size === 0) {
                    const remainHrs = Math.ceil((delayMs - (now - lastTime)) / (1000 * 60 * 60));
                    mainText = `📥 排隊中 (${remainHrs}小時候發放)`;
                    badgeText = `(${delayedQueue.length}水庫)`;
                }
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

        document.querySelectorAll('.hege-block-all-btn').forEach(btn => {
            btn.style.opacity = isUnblocking ? '0.5' : '1';
            btn.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            btn.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            // 無盡收割按鈕的 title 有語意用途，不覆寫為空字串（否則 resumeEndlessSweep 選取器會失效）
            if (btn.dataset.hegeRole !== 'endless-sweep') {
                btn.title = isUnblocking ? '正在解除封鎖，暫時無法封鎖' : '';
            } else if (isUnblocking) {
                btn.title = '正在解除封鎖，暫時無法封鎖';
                // 解除封鎖結束後由 btn.dataset.hegeRole 恢復語意，不需額外寫回
            }
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
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    Utils.openWorkerWindow();
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
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    Utils.openWorkerWindow();
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
        const moreSvgs = document.querySelectorAll('svg[aria-label="更多"], svg[aria-label="More"]');
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
        let debugLogs = [];
        try {
            debugLogs = JSON.parse(localStorage.getItem(CONFIG.KEYS.DEBUG_LOG) || '[]');
        } catch (e) { }

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

    // ============================================================================
    // Task 1: 貼文深層清理 - 機制容器與排程器管理 (Deep Post Sweeper)
    // ============================================================================
    addPostTask: (url) => {
        let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        const cleanUrl = url.split('?')[0];
        
        // 移除重複
        queue = queue.filter(q => q.url.split('?')[0] !== cleanUrl);
        queue.push({
            url: cleanUrl,
            addedAt: Date.now(),
            lastSweptAt: 0, // 初始化為 0 以觸發立即喚醒
            sweepCount: 0,
            status: 'pending' // pending (冷卻中), active (執行中), error (異常中斷)
        });
        
        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
        UI.showToast('✅ 此貼文已排入深層清理水庫，系統將定時自動跳轉掃蕩。');
        console.log(`[DeepSweep-Q] 貼文已加入排程: ${cleanUrl}`);
        
        // 若此時剛加入，可直接觸發看看
        setTimeout(() => Core.checkPostQueueWakeup(), 3000);
    },


    checkPostQueueWakeup: () => {
        // 防爆走保險：如果當前分頁已經在幾分鐘內跳轉過，暫不再次強制跳轉
        const lastLock = parseInt(sessionStorage.getItem('hege_post_sweep_lock') || '0');
        if (Date.now() - lastLock < 5 * 60 * 1000) {
            return; // 5 分鐘內跳過，避免死迴圈
        }

        let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        if (queue.length === 0) return;

        const now = Date.now();
        const COOLDOWN_MS = CONFIG.POST_SWEEP_COOLDOWN_HOURS * 60 * 60 * 1000;

        let targetPost = null;
        for (let post of queue) {
            // 找出超過 8 小時未清理的 pending 貼文
            if (post.status !== 'error' && (now - post.lastSweptAt > COOLDOWN_MS)) {
                targetPost = post;
                break; // 取第一篇最老的
            }
        }

        if (targetPost) {
            console.log(`[DeepSweep-Q] ⏰ 偵測到排程貼文冷卻時間已滿，即將啟動被動喚醒跳轉...`, targetPost.url);
            
            // 寫入 Session Lock
            sessionStorage.setItem('hege_post_sweep_lock', Date.now().toString());

            // 將狀態先轉為活躍，避免其他分頁重複搶佔此任務
            targetPost.lastSweptAt = Date.now();
            targetPost.status = 'active';
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);

            UI.showToast('⚠️ [深層清理] 檢測到水庫貼文時間已到，3 秒後將全自動進入清理模式...', 5000);
            setTimeout(() => {
                const sep = targetPost.url.includes('?') ? '&' : '?';
                const targetUrl = targetPost.url + sep + 'hege_post_sweep=true';
                
                if (Utils.isMobile()) {
                    // Mobile (iOS) fallback to current window navigation due to popup blockers
                    const targetPath = new URL(targetUrl).pathname + new URL(targetUrl).search;
                    history.replaceState(null, '', targetPath);
                    location.reload();
                } else {
                    // Desktop: Open in a dedicated worker window to avoid disturbing the user
                    window.open(targetUrl, 'HegeSweepWorker', 'width=800,height=600,left=100,top=100');
                    UI.showToast('ℹ️ 已在獨立視窗啟動清理任務，請勿關閉該小視窗', 5000);
                }
            }, 3000);
        }
    }
};
