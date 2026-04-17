// 大蟑螂名單 (Cockroach Radar)
// 追蹤反覆出現的封鎖帳號，10 天未檢查自動提醒
import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { UI } from '../ui.js';
import { Utils } from '../utils.js';
import { Core } from '../core.js';

Object.assign(Core, {
    checkCockroachRadar: (rawUsers, countOverride) => {
        const count = countOverride || (rawUsers ? rawUsers.length : 0);
        if (count < 30) return;

        const postOwner = Utils.getPostOwner();
        if (!postOwner) return;

        const dbRaw = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
        const cockroachSet = new Set(dbRaw.map(x => x.username || x));
        if (cockroachSet.has(postOwner)) return;

        UI.showConfirm(
            `【大蟑螂名單】偵測到您單次圈選了 ${count} 人。\n\n是否將該發文者 ( @${Utils.escapeHTML(postOwner)} ) 列為「大蟑螂」？\n我們將自動跳過封鎖他，並在每 10 天提醒您回頭檢查蟑螂窩。`,
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

                Core.updateControllerUI();
                UI.showToast(`已加入大蟑螂名單：@${postOwner}`);
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
                UI.showToast(`已從大蟑螂名單中移除 ${usersToRemove.length} 名使用者`);
                Core.openCockroachManager(onBack);
            }, onBack);
        } catch (e) {
            alert('Core Error: ' + e.message + '\n' + e.stack);
        }
    }
});
