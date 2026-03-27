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
            });
        } else {
            Core.startScanner();
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
                // 排除回覆/回文 dialog — 會回文代表不想封鎖
                const isReplyCtx = ['回覆', '回文', 'Reply', 'Replies', '回應'].some(t => text.includes(t));
                if (isReplyCtx) continue;

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

        const existingBtn = localCtx.querySelector('.hege-block-all-btn');
        if (existingBtn && document.body.contains(existingBtn)) return;

        const blockAllBtn = document.createElement('div');
        blockAllBtn.className = 'hege-block-all-btn';
        blockAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
            <span>同列全封</span>
        `;

        const bgMode = Core.getBgMode();
        if (bgMode === 'UNBLOCKING') {
            blockAllBtn.style.opacity = '0.5';
            blockAllBtn.style.filter = 'grayscale(1)';
            blockAllBtn.style.cursor = 'not-allowed';
            blockAllBtn.title = '正在解除封鎖，暫時無法封鎖';
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

            document.querySelectorAll('.hege-checkbox-container').forEach(box => {
                if (box.dataset.username && Core.pendingUsers.has(box.dataset.username)) {
                    box.classList.add('checked');
                }
            });

            Core.updateControllerUI();
        };

        const allSpans = localCtx.querySelectorAll('span[dir="auto"]');
        let sortSpan = null;
        for (let span of allSpans) {
            const spanText = (span.innerText || span.textContent || '').trim();
            if (spanText === '排序' || spanText.includes('排序')) {
                sortSpan = span;
                break;
            }
        }

        if (sortSpan && sortSpan.closest('[role="button"]')) {
            const sortBtn = sortSpan.closest('[role="button"]');
            blockAllBtn.style.marginRight = '8px';

            if (!blockAllBtn.dataset.hegeEventBound) {
                if (Utils.isMobile()) {
                    blockAllBtn.addEventListener('touchend', (e) => {
                        e.stopPropagation(); e.preventDefault();
                        handleBlockAll(e);
                    }, { passive: false, capture: true });
                } else {
                    blockAllBtn.addEventListener('click', handleBlockAll, true);
                }
                blockAllBtn.dataset.hegeEventBound = 'true';
            }

            try {
                sortBtn.parentElement.style.display = 'flex';
                sortBtn.parentElement.style.alignItems = 'center';
                sortBtn.parentElement.insertBefore(blockAllBtn, sortBtn);
            } catch (e) {
                headerContainer.appendChild(blockAllBtn);
            }
        } else {
            if (!blockAllBtn.dataset.hegeEventBound) {
                if (Utils.isMobile()) {
                    blockAllBtn.addEventListener('touchend', (e) => {
                        e.stopPropagation(); e.preventDefault();
                        handleBlockAll(e);
                    }, { passive: false, capture: true });
                } else {
                    blockAllBtn.addEventListener('click', handleBlockAll, true);
                }
                blockAllBtn.dataset.hegeEventBound = 'true';
            }

            blockAllBtn.style.marginLeft = 'auto';
            blockAllBtn.style.marginRight = '8px';

            if (header.nextSibling) {
                headerContainer.insertBefore(blockAllBtn, header.nextSibling);
            } else {
                headerContainer.appendChild(blockAllBtn);
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
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));

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

                const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));
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

        const currentDB = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));

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
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));
        const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
        const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));

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
            btn.title = isUnblocking ? '正在解除封鎖，暫時無法封鎖' : '';
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

    runSameTabWorker: () => {
        const toAdd = Array.from(Core.pendingUsers);

        const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const newQ = [...new Set([...q, ...toAdd])];

        if (newQ.length === 0) {
            UI.showToast('沒有待處理的帳號');
            return;
        }

        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
        Storage.remove(CONFIG.KEYS.BG_CMD);
        Storage.remove('hege_worker_stats'); // Fresh stats for new session

        if (toAdd.length > 0) {
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
    }
};
