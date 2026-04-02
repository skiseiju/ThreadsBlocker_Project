import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { UI } from './ui.js';
import { Core } from './core.js';
import { Worker } from './worker.js';

(function () {
    'use strict';

    // (Early-boot interceptor removed to prevent Safari Userscripts crash)
    Utils.initConsoleInterceptor();
    console.log('[留友封] Extension Script Initializing...');

    if (Storage.get(CONFIG.KEYS.VERSION_CHECK) !== CONFIG.VERSION) {
        // DB_KEY 遷移：舊版本使用 "undefined" 作為 key（CONFIG.KEYS.DB_KEY 未定義的 bug）
        const legacyDB = localStorage.getItem('undefined');
        if (legacyDB && !localStorage.getItem(CONFIG.KEYS.DB_KEY)) {
            localStorage.setItem(CONFIG.KEYS.DB_KEY, legacyDB);
            localStorage.removeItem('undefined');
            console.log('[留友封] DB migrated from legacy "undefined" key');
        }

        // 清除暫存佇列
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});

        Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
        Storage.remove(CONFIG.KEYS.COOLDOWN);
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
        Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});

        // 清除歷史遺留 key
        localStorage.removeItem('hege_ios_active');
        localStorage.removeItem('hege_mac_mode');

        Storage.set(CONFIG.KEYS.VERSION_CHECK, CONFIG.VERSION);
        console.log(`[留友封] Updated to v${CONFIG.VERSION}. Cleared all temporary queues.`);
    }

    // Unconditional safety clear: if the user manually fired an event but they are stuck, force them away
    const forceClear = new URLSearchParams(window.location.search).get('hege_clear');
    if (forceClear === 'true') {
        localStorage.removeItem('hege_cooldown_queue');
        localStorage.removeItem('hege_rate_limit_until');
        localStorage.removeItem('hege_block_timestamps');
        localStorage.removeItem('hege_worker_stats');
        alert('緊急清除完成，請重新整理頁面。');
    }

    const isBgPage = new URLSearchParams(window.location.search).get('hege_bg') === 'true';

    // Initialize
    function main() {
        if (isBgPage) {
            Worker.init();
        } else {
            // Prevent running in iframes for Controller (Beta46 logic)
            if (window.top !== window.self) return;

            UI.injectStyles();
            
            // Task 2: Check for Endless Sweep Resumption
            const endlessState = sessionStorage.getItem('hege_endless_state');
            const endlessTarget = sessionStorage.getItem('hege_endless_target');
            if (endlessState === 'RELOADING' && endlessTarget === window.location.href) {
                Core.resumeEndlessSweep();
            } else if (endlessState) {
                // If user navigated away, clear state
                if (endlessTarget !== window.location.href) {
                    sessionStorage.removeItem('hege_endless_state');
                    sessionStorage.removeItem('hege_endless_target');
                    sessionStorage.removeItem('hege_endless_last_first_user');
                }
            }

            // Task 2: Cockroach Reminder
            setTimeout(() => {
                const cockroachDB = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                const now = Date.now();
                const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
                const toRemind = cockroachDB.filter(c => (now - c.timestamp) >= tenDaysMs);

                if (toRemind.length > 0) {
                    const listStr = toRemind.map(c => `@${c.username}`).join('\n');
                    UI.showConfirm(`【大蟑螂回望提醒】\n\n以下網軍頭領已經超過 10 天未檢查，是否要開啟他們的主頁看看有沒有新的網軍？\n\n${listStr}`, () => {
                        toRemind.forEach(c => {
                            window.open(`https://www.threads.net/@${c.username}`, '_blank');
                            c.timestamp = now; // Reset timer
                        });
                        Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, cockroachDB);
                    }, () => {
                        toRemind.forEach(c => {
                            c.timestamp = now; // Dismiss for now
                        });
                        Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, cockroachDB);
                    });
                }
            }, 2000);

            const handleMainButton = () => {
                const pending = Core.pendingUsers;
                const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
                if (cooldownUntil > Date.now()) {
                    const remainHrs = Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60));
                    UI.showConfirm(
                        `⚠️ 目前處於冷卻保護中（約 ${remainHrs} 小時後自動解除）\n\n強制取消冷卻並繼續封鎖？\n\n若您確認今日封鎖未超過 100 位，這可能是系統誤判，可放心繼續執行。\n\n若已大量封鎖，後續操作可能失敗，Meta 也可能對您的帳號施加額外限制。`,
                        () => {
                            // Force cancel cooldown and resume
                            const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
                            const currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                            const pendingArr = Array.from(pending);
                            const merged = [...new Set([...currentQueue, ...cooldownQueue, ...pendingArr])];
                            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, merged);
                            Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
                            Storage.remove(CONFIG.KEYS.COOLDOWN);
                            Storage.invalidate(CONFIG.KEYS.COOLDOWN);
                            Storage.invalidate(CONFIG.KEYS.COOLDOWN_QUEUE);

                            if (pendingArr.length > 0) {
                                Core.pendingUsers.clear();
                                Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                            }

                            Core.updateControllerUI();
                            UI.showToast(`已恢復佇列，共 ${merged.length} 筆，開始執行`);

                            // Directly start worker with restored queue
                            Storage.remove(CONFIG.KEYS.BG_CMD);
                            if (Utils.isMobile()) {
                                Core.runSameTabWorker();
                            } else {
                                // window.open must be called directly in the click handler to preserve user gesture
                                Utils.openWorkerWindow();
                            }
                        }
                    );
                    return;
                }

                const delayEnabled = Storage.get(CONFIG.KEYS.DELAYED_BLOCK_ENABLED) === 'true';
                let toAdd = Array.from(pending);
                let currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);

                if (delayEnabled) {
                    const dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                    const lastTime = parseInt(Storage.get(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
                    const now = Date.now();
                    const delayMs = CONFIG.DELAY_HOURS * 60 * 60 * 1000;
                    
                    if (lastTime > 0 && (now - lastTime) < delayMs) {
                        // 在冷卻期內，圈選名單優先進入水庫
                        if (toAdd.length > 0) {
                            const newDq = [...new Set([...dq, ...toAdd])];
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, newDq);
                            const remainHrs = ((delayMs - (now - lastTime)) / (1000 * 60 * 60)).toFixed(1);
                            UI.showToast(`📥 已存入延時水庫（共 ${newDq.length} 人排隊中），預計於 ${Math.ceil(remainHrs)} 小時後釋放`);
                            
                            Core.pendingUsers.clear();
                            Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                            Core.updateControllerUI();
                        }
                        
                        // 如果背景沒有正在跑的佇列，就不需要啟動 Worker
                        if (currentQueue.length === 0) {
                            if (toAdd.length === 0) UI.showToast('水庫冷卻中，選取名單將自動被加入水庫。');
                            return; 
                        } else {
                            toAdd = []; // 已進入水庫，不直接加入 BG_QUEUE
                        }
                    } else {
                        // 能夠發放 (lastTime == 0 或已滿 13 小時)
                        const allCandidates = [...new Set([...dq, ...toAdd])];
                        if (allCandidates.length > CONFIG.MAX_BLOCKS_PER_BATCH) {
                            toAdd = allCandidates.slice(0, CONFIG.MAX_BLOCKS_PER_BATCH);
                            const remainder = allCandidates.slice(CONFIG.MAX_BLOCKS_PER_BATCH);
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, remainder);
                            UI.showToast(`💧 水庫排程：發放 ${toAdd.length} 人，剩餘 ${remainder.length} 人待下次發動`);
                        } else {
                            toAdd = allCandidates;
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                        }
                        
                        if (toAdd.length > 0) {
                            Storage.set(CONFIG.KEYS.LAST_BATCH_TIME, now.toString());
                        }
                    }
                }

                if (toAdd.length === 0 && currentQueue.length === 0) { UI.showToast('請先勾選用戶！'); return; }

                if (Utils.isMobile()) {
                    Core.runSameTabWorker(toAdd);
                } else {
                    Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                    const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    const newQ = [...new Set([...q, ...toAdd])];
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
                    
                    if (toAdd.length > 0 && !delayEnabled) {
                        UI.showToast(`已提交 ${toAdd.length} 筆至背景佇列`);
                    }

                    const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
                    const running = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
                    if (!running) {
                        Storage.remove(CONFIG.KEYS.BG_CMD);
                        Utils.openWorkerWindow();
                    }
                }
            };

            const callbacks = {
                onMainClick: handleMainButton,
                onClearSel: () => {
                    UI.showConfirm('確定要清除目前的「選取清單」與所有「背景排隊」的帳號嗎？\n(這不會影響已完成的封鎖歷史紀錄)', () => {
                        Core.pendingUsers.clear();
                        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});
                        Core.blockQueue.forEach(b => {
                            const cb = b.parentElement.querySelector('.hege-checkbox-container');
                            if (cb) cb.classList.remove('checked');
                        });
                        Core.blockQueue.clear();
                        Core.updateControllerUI();
                        UI.showToast('待封鎖清單與背景佇列已全數清除');
                    });
                },
                onClearDB: () => { UI.showConfirm('清空歷史？', () => { Storage.setJSON(CONFIG.KEYS.DB_KEY, []); Core.updateControllerUI(); }); },
                onDeepMine: () => {
                    const postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    if (postQueue.length === 0) {
                        UI.showToast('目前水庫為空。請先進入單一貼文頁面，啟動變強封鎖對話框后點標記大蟑螂穩。');
                        return;
                    }
                    const list = postQueue.map(p => {
                        const url = p.url || '';
                        const lastSweep = p.lastSweptAt ? new Date(p.lastSweptAt).toLocaleString() : '尚未執行';
                        return `${url}\n  \u2514 上次: ${lastSweep}`;
                    }).join('\n');
                    UI.showConfirm(`【深層清理水庫】目前有 ${postQueue.length} 篇貼文排程中：\n\n${list}\n\n是否要現在就展開清理？`, () => {
                        Core.checkPostQueueWakeup();
                    });
                },
                onCockroach: () => Core.openCockroachManager(),
                onSettings: () => {
                    const openSettings = () => {
                        UI.showSettingsModal({
                            onManage: () => Core.openBlockManager(),
                            onImport: () => Core.importList(),
                            onExport: () => Core.exportHistory(),
                            onClearDB: () => { UI.showConfirm('確定清除所有歷史紀錄？', () => { Storage.setJSON(CONFIG.KEYS.DB_KEY, []); Core.updateControllerUI(); }); },
                            onCockroach: () => Core.openCockroachManager(() => openSettings())
                        });
                    };
                    openSettings();
                },
                onImport: () => Core.importList(),
                onManage: () => Core.openBlockManager(),
                onExport: () => Core.exportHistory(),
                onRetryFailed: () => Core.retryFailedQueue(),
                onReport: () => Core.showReportDialog(),
                onStop: () => { UI.showConfirm('確定要停止背景執行？', () => {
                    Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
                    Storage.remove('hege_endless_worker_standby');
                }); }
            };

            const panel = UI.createPanel(callbacks);

            // Sync Logic (Restored from beta46)
            window.addEventListener('storage', (e) => {
                if (e.key === CONFIG.KEYS.BG_STATUS || e.key === CONFIG.KEYS.DB_KEY || e.key === CONFIG.KEYS.BG_QUEUE || e.key === CONFIG.KEYS.COOLDOWN || e.key === CONFIG.KEYS.COOLDOWN_QUEUE || e.key === CONFIG.KEYS.FAILED_QUEUE || e.key === CONFIG.KEYS.DELAYED_QUEUE || e.key === CONFIG.KEYS.POST_QUEUE) {
                    Storage.invalidate(e.key); // Force cache clear so getJSON fetches fresh data
                    Core.updateControllerUI();
                }
            });
            setInterval(() => {
                Storage.invalidate(CONFIG.KEYS.DB_KEY);
                Storage.invalidate(CONFIG.KEYS.BG_STATUS);
                Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                Storage.invalidate(CONFIG.KEYS.COOLDOWN);
                Storage.invalidate(CONFIG.KEYS.COOLDOWN_QUEUE);
                Storage.invalidate(CONFIG.KEYS.FAILED_QUEUE);
                Storage.invalidate(CONFIG.KEYS.DB_TIMESTAMPS);
                Storage.invalidate(CONFIG.KEYS.DELAYED_QUEUE);
                Storage.invalidate(CONFIG.KEYS.POST_QUEUE);
                Core.updateControllerUI();
            }, 2000); // Polling backup

            // Env Log
            const _envPlatform = navigator.userAgentData?.platform || navigator.platform || '';
            const isIPad = (_envPlatform === 'macOS' || _envPlatform === 'MacIntel') && navigator.maxTouchPoints > 1;
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPad;
            Utils.log(`Env: ${_envPlatform}, TP:${navigator.maxTouchPoints}\nDevice: ${isIOS ? 'iOS/iPad' : 'Desktop'}\nUA: ${navigator.userAgent.substring(0, 50)}...`);

            // Anchor Loop
            UI.anchorPanel();
            setInterval(() => {
                if (!document.getElementById('hege-panel')) {
                    console.warn('[留友封] Panel missing from DOM! Attempting re-inject?');
                }
                UI.anchorPanel();
            }, 1500);

            // Task 1: 貼文深層收割 8hr 排程定期巡檢 (每 1 分鐘檢查一次)
            setInterval(() => {
                Core.checkPostQueueWakeup();
            }, 60000);

            // Task 1: Debug 測試後門，允許無視 8H 直接歸零並立即跳轉
            window.HegeDebug = {
                forceWakeup: () => {
                    let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    queue.forEach(q => q.lastSweptAt = 0);
                    Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
                    console.log('[DeepSweep-Q] 測試後門觸發：已將所有深層清理貼文的冷卻時間歸零！');
                    Core.checkPostQueueWakeup();
                }
            };

            Core.init();

            // Log Sync
            if (CONFIG.DEBUG_MODE) {
                // Console only
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    // --- 全局除錯/測試函式 ---
    window.__DEBUG_HEGE_FAST_FORWARD_TIME = (hours = 8) => {
        const ms = hours * 60 * 60 * 1000;
        const lastTime = parseInt(localStorage.getItem(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
        if (lastTime > 0) {
            localStorage.setItem(CONFIG.KEYS.LAST_BATCH_TIME, (lastTime - ms).toString());
            console.log(`[DEBUG] 延時水庫時鐘已倒轉 ${hours} 小時！`);
        } else {
            console.log(`[DEBUG] LAST_BATCH_TIME 為空，水庫本來就可以直接發放！`);
        }
    };

    window.__DEBUG_GENERATE_COCKROACH = (username = 'test_roach_' + Math.floor(Math.random()*1000)) => {
        const db = JSON.parse(localStorage.getItem(CONFIG.KEYS.COCKROACH_DB) || '[]');
        // 設定為 11 天前，以觸發 10 天提醒
        db.push({ username, timestamp: Date.now() - (11 * 24 * 60 * 60 * 1000) });
        localStorage.setItem(CONFIG.KEYS.COCKROACH_DB, JSON.stringify(db));
        console.log(`[DEBUG] 已注入大蟑螂 @${username} (時標為 11 天前)。重新裝載網頁後將會觸發回望提醒！`);
    };

})();
