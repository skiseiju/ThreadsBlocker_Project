// 只檢舉 Phase 1：在既有 likes dialog 內逐筆走 Threads 檢舉流程
import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { UI } from '../ui.js';
import { Utils } from '../utils.js';
import { Core } from '../core.js';
import { Worker } from '../worker.js';

const ACCOUNT_CONTENT_REASON = '該帳號發佈的內容不應該顯示在 Threads 上。';
const DEFAULT_REPORT_PATH = ['這是垃圾訊息'];
const REPORT_TEXTS = ['檢舉', '举报', 'Report'];
const REPORT_ACCOUNT_TEXTS = ['檢舉帳號', '檢舉賬號', '檢舉帐号', '檢舉用戶', '檢舉用户', '檢舉個人檔案', 'Report account', 'Report profile', 'Report user'];
const REPORT_CONTENT_TEXTS = ['檢舉貼文、訊息或留言', '檢舉貼文', '檢舉留言', '檢舉訊息', '檢舉內容', 'Report post', 'Report comment', 'Report message', 'Report content'];
const CONFIRM_TEXTS = ['下一步', '提交', '提交檢舉', '送出', '完成', 'Next', 'Done', 'Submit', 'Submit report'];
const REPORT_DONE_TEXTS = ['檢舉已送出', '感謝', 'Thanks', 'Report submitted', '已提交'];
const REPORT_THANK_YOU_TEXTS = [
    '謝謝你檢舉這個帳號',
    '謝謝你檢舉',
    '收到檢舉',
    '等待審查',
    '做出處置',
    'Thanks for reporting',
    'Report received',
];
const REPORT_OPTION_ALIASES = {
    '霸凌或擾人的聯繫': ['霸凌或擾人的聯繫', '霸凌或騷擾', '霸凌', '騷擾', '不想要的聯繫', '不受歡迎的聯繫', '騷擾或霸凌'],
    '威脅分享裸照': ['威脅分享裸照', '威脅分享私密影像', '威脅分享私密照片', '威脅散布裸照'],
    '霸凌或騷擾': ['霸凌或騷擾', '騷擾或霸凌', '霸凌', '騷擾'],
    '我': ['我', '自己', '本人'],
    '朋友': ['朋友', '我認識的人', '其他人'],
    '我不認識對方': ['我不認識對方', '我不認識這個人', '我不認識此人', '陌生人'],
    '該帳號發佈的內容不應該顯示在 Threads 上。': ['該帳號發佈的內容不應該顯示在 Threads 上。', '該帳號發布的內容不應該顯示在 Threads 上', '該帳號發佈的內容不應該顯示在Threads上', '內容不應該顯示在 Threads 上', '發佈的內容不應該顯示', '發布的內容不應該顯示'],
    '這是垃圾訊息': ['這是垃圾訊息', '垃圾訊息', '垃圾信息', 'Spam'],
    '垃圾訊息': ['垃圾訊息', '垃圾信息', 'Spam'],
    '暴力、仇恨或剝削': ['暴力、仇恨或剝削', '暴力', '仇恨', '剝削', '暴力或仇恨', 'Violence', 'Hate'],
    '對安全構成具體威脅': ['對安全構成具體威脅', '可信的暴力威脅', '暴力威脅', '具體威脅'],
    '疑似為恐怖主義或組織犯罪': ['疑似為恐怖主義或組織犯罪', '恐怖主義', '組織犯罪'],
    '似乎涉及剝削': ['似乎涉及剝削', '剝削'],
    '人口販運': ['人口販運', '人口贩运'],
    '似乎涉及性剝削': ['似乎涉及性剝削', '性剝削'],
    '仇恨言論或象徵符號': ['仇恨言論或象徵符號', '仇恨言論', '仇恨符號', '仇恨象徵'],
    '煽動暴力': ['煽動暴力', '鼓吹暴力'],
    '展示暴力、死亡或重傷畫面': ['展示暴力、死亡或重傷畫面', '暴力畫面', '死亡或重傷', '血腥暴力'],
    '虐待動物': ['虐待動物', '虐待动物'],
    '裸露或性行為': ['裸露或性行為', '裸露', '性行為', '成人裸露或性行為'],
    '似乎涉及賣淫': ['似乎涉及賣淫', '賣淫', '性交易'],
    '詐騙或詐欺': ['詐騙或詐欺', '詐欺或詐騙', '詐騙', '詐欺', 'Scam', 'Fraud'],
    '詐騙、詐欺或垃圾訊息': ['詐騙、詐欺或垃圾訊息', '詐騙或詐欺', '詐欺或詐騙', '詐騙', '詐欺', '垃圾訊息', 'Scam', 'Fraud', 'Spam'],
    '詐欺或詐騙': ['詐欺或詐騙', '詐騙或詐欺', '詐騙', '詐欺', 'Scam', 'Fraud'],
    '金融或投資詐騙': ['金融或投資詐騙', '金融詐騙', '投資詐騙'],
    '身分盜用': ['身分盜用', '身份盜用', '冒用身分', '冒用身份'],
    '銷售虛假商品或服務': ['銷售虛假商品或服務', '虛假商品', '虛假服務', '假商品', '假服務'],
    '生理或心理威脅': ['生理或心理威脅', '身體或心理威脅', '人身威脅', '心理威脅'],
    '可疑或擾人的聯繫': ['可疑或擾人的聯繫', '可疑聯繫', '擾人的聯繫', '可疑或騷擾'],
    '可疑連結': ['可疑連結', '可疑链接', '可疑網址'],
    '我想減少看到這類內容': ['我想減少看到這類內容', '減少看到這類內容', '不想看到這類內容'],
    '不實資訊': ['不實資訊', '錯誤資訊', '假訊息', 'Misinformation'],
    '否': ['否', '不是', 'No'],
    '是': ['是', 'Yes'],
};

Object.assign(Core, {
    ReportDriver: {
        _running: false,
        _cooldownTimer: null,
        _dialogContext: null,

        rememberDialogContext(ctx) {
            if (ctx && ctx !== document.body && ctx.isConnected) {
                Core.ReportDriver._dialogContext = ctx;
            }
        },

        getDialogContext(user, options = {}) {
            const candidates = [
                options.ctx,
                Core.ReportDriver._dialogContext,
                Core.getTopContext(),
                ...Array.from(document.querySelectorAll('[role="dialog"]')).reverse(),
            ];

            for (const ctx of candidates) {
                if (!ctx || ctx === document.body || !ctx.isConnected) continue;
                if (!user || Core.ReportDriver.findRowForUser(ctx, user)) {
                    Core.ReportDriver.rememberDialogContext(ctx);
                    return ctx;
                }
            }

            return null;
        },

        getReportPath() {
            const parsePath = (raw) => {
                if (Array.isArray(raw)) {
                    return raw.length > 0 ? raw : null;
                }
                try {
                    const parsed = raw ? JSON.parse(raw) : [];
                    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
                } catch (e) {
                    return null;
                }
            };
            return parsePath(Storage.get(CONFIG.KEYS.REPORT_BATCH_PATH))
                || DEFAULT_REPORT_PATH;
        },

        getExecutionPath(mode) {
            const path = Core.ReportDriver.getReportPath();
            if (mode !== 'profile') return path;
            return path[0] === ACCOUNT_CONTENT_REASON ? path : [ACCOUNT_CONTENT_REASON, ...path];
        },

        clearBatchPathIfQueueEmpty() {
            if (Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length === 0) {
                Storage.remove(CONFIG.KEYS.REPORT_BATCH_PATH);
            }
        },

        warnReportLimit(message) {
            if (window.hegeLog) window.hegeLog(`[只檢舉][LIMIT] ${message}`);
            Core.ReportDriver.recordDebugTrace('limit_warning', '', {}, { message }, false);
            UI.showToast(message, 4000);
            return false;
        },

        remindReportRateLimit(user = '', detail = '') {
            const reminder = Worker.noteReportRateLimit({ user, detail });
            if (reminder.changed) {
                UI.showToast(reminder.toastMessage, 6500);
            }
            return reminder;
        },

        recordDebugTrace(kind, user = '', options = {}, extra = {}, includeSnapshot = false) {
            const payload = {
                user,
                mode: options.mode || 'profile',
                href: location.href,
                pathname: location.pathname,
                visibleOptions: Core.ReportDriver.getVisibleReportOptionTexts(),
                dialogs: Core.ReportDriver.summarizeDialogsForDebug(),
                extra,
            };
            if (includeSnapshot && user) {
                payload.snapshot = Core.ReportDriver.getDebugSnapshot(user, options, kind, extra);
            }
            Core.appendReportDebugTrace(kind, payload);
        },

        findClickableByText(text, { exact = true, root = document, visibleOnly = false } = {}) {
            const nodes = root.querySelectorAll('div[role="menuitem"], div[role="button"], button, span[dir="auto"], a[role="link"]');
            for (const node of nodes) {
                const target = node.closest('div[role="menuitem"], div[role="button"], button, a[role="link"]') || node;
                if (visibleOnly && !Core.ReportDriver.isElementVisible(target)) continue;
                const nodeText = (node.innerText || node.textContent || '').trim();
                const matched = exact ? nodeText === text : nodeText.includes(text);
                if (!matched) continue;
                return target;
            }
            return null;
        },

        normalizeOptionText(text) {
            return (text || '').replace(/\s+/g, '').replace(/[，,。．.：:！!？?（）()]/g, '').trim();
        },

        getClickableTextNodes(root = document) {
            return Array.from(root.querySelectorAll('div[role="menuitem"], div[role="button"], button, span[dir="auto"], a[role="link"]'))
                .map(node => ({
                    node,
                    text: (node.innerText || node.textContent || '').trim(),
                }))
                .filter(item => item.text.length > 0);
        },

        getStepAliases(step) {
            return [...new Set([step, ...(REPORT_OPTION_ALIASES[step] || [])])];
        },

        findReportOptionForStep(step, root = document) {
            const aliases = Core.ReportDriver.getStepAliases(step);
            const normalizedAliases = aliases.map(a => Core.ReportDriver.normalizeOptionText(a)).filter(Boolean);
            const nodes = Core.ReportDriver.getClickableTextNodes(root);

            for (const item of nodes) {
                const normalizedText = Core.ReportDriver.normalizeOptionText(item.text);
                if (normalizedAliases.some(alias => normalizedText === alias || normalizedText.includes(alias) || alias.includes(normalizedText))) {
                    return item.node.closest('div[role="menuitem"], div[role="button"], button, a[role="link"]') || item.node;
                }
            }
            return null;
        },

        findNextReportOption(path, startIndex = 0) {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).reverse();
            const roots = dialogs.length > 0 ? [...dialogs, document] : [document];

            for (let offset = 0; startIndex + offset < path.length; offset++) {
                const step = path[startIndex + offset];
                for (const root of roots) {
                    const option = Core.ReportDriver.findReportOptionForStep(step, root);
                    if (option) return { option, step, offset };
                }
            }
            return null;
        },

        getVisibleReportOptionTexts() {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).reverse();
            const root = dialogs[0] || document;
            return Core.ReportDriver.getClickableTextNodes(root)
                .map(item => item.text.replace(/\s+/g, ' ').trim().slice(0, 40))
                .filter(Boolean)
                .slice(0, 20);
        },

        logVisibleOptions(label, extra = {}) {
            if (!window.hegeLog) return;
            const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            const details = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
            window.hegeLog(`[只檢舉] ${label} 可見選項=${JSON.stringify(visibleOptions)} dialogs=${dialogs.length}${details}`);
        },

        compactDebugText(text, max = 160) {
            return (text || '').replace(/\s+/g, ' ').trim().slice(0, max);
        },

        summarizeDialogsForDebug() {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            return dialogs.map((dialog, index) => ({
                index,
                text: Core.ReportDriver.compactDebugText(dialog.innerText || dialog.textContent, 220),
                buttons: Core.ReportDriver.getClickableTextNodes(dialog)
                    .map(item => Core.ReportDriver.compactDebugText(item.text, 60))
                    .filter(Boolean)
                    .slice(0, 16),
                userLinks: Array.from(dialog.querySelectorAll('a[href^="/@"]'))
                    .map(a => a.getAttribute('href'))
                    .filter(Boolean)
                    .slice(0, 12),
            })).slice(-5);
        },

        summarizeMoreButtonsForDebug() {
            return Array.from(document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG))
                .map((svg, index) => {
                    const btn = svg.closest('div[role="button"], button, a[role="link"]');
                    const rect = btn ? btn.getBoundingClientRect() : svg.getBoundingClientRect();
                    return {
                        index,
                        aria: svg.getAttribute('aria-label') || '',
                        circles: svg.querySelectorAll('circle').length,
                        paths: svg.querySelectorAll('path').length,
                        inDialog: !!svg.closest('div[role="dialog"]'),
                        buttonText: Core.ReportDriver.compactDebugText(btn ? (btn.innerText || btn.textContent) : '', 80),
                        rect: {
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                        },
                    };
                })
                .slice(0, 20);
        },

        getDebugSnapshot(user, options = {}, reason = 'unknown', extra = {}) {
            Storage.invalidate(CONFIG.KEYS.REPORT_QUEUE);
            Storage.invalidate(CONFIG.KEYS.REPORT_CONTEXT);
            const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            const contextMap = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
            const reportContext = options.reportContext || contextMap[user] || null;
            return {
                reason,
                user,
                mode: options.mode || 'dialog',
                href: location.href,
                pathname: location.pathname,
                queueHead: queue[0] || null,
                queueLength: queue.length,
                reportContext,
                reportPath: Core.ReportDriver.getReportPath(),
                visibleOptions: Core.ReportDriver.getVisibleReportOptionTexts(),
                dialogs: Core.ReportDriver.summarizeDialogsForDebug(),
                moreButtons: Core.ReportDriver.summarizeMoreButtonsForDebug(),
                bodyText: Core.ReportDriver.compactDebugText(document.body.innerText || document.body.textContent, 300),
                extra,
            };
        },

        pauseForDebug(user, options = {}, reason, message, extra = {}) {
            const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            const snapshot = Core.ReportDriver.getDebugSnapshot(user, options, reason, extra);
            const current = `只檢舉診斷停住：${message}`;
            Core.appendReportDebugTrace(`pause:${reason}`, {
                user,
                mode: options.mode || 'profile',
                message,
                snapshot,
            });
            Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                state: 'paused',
                current,
                progress: 0,
                total: queue.length,
                lastUpdate: Date.now(),
                debug: snapshot,
            });
            if (window.hegeLog) {
                window.hegeLog(`[只檢舉][DIAG:${reason}] ${message}`);
                window.hegeLog(`[只檢舉][DIAG:${reason}] ${JSON.stringify(snapshot)}`);
            }
            UI.showToast(`${message}，worker 已停住可測試`, 5000);
            return true;
        },

        skipOrPauseForDebug(user, options = {}, reason, message, extra = {}) {
            Core.ReportDriver.recordDebugTrace(`skip:${reason}`, user, options, { message, ...extra }, true);
            if (options.keepWorkerOpenOnError) {
                return Core.ReportDriver.pauseForDebug(user, options, reason, message, extra);
            }
            if (typeof options.onSkipped === 'function') {
                options.onSkipped(user, reason, message);
            }
            UI.showToast(`${message}，已跳過 @${user}`, 3000);
            Core.ReportDriver.removeCurrent(user);
            Core.ReportDriver.scheduleNext(options);
            return true;
        },

        isVisualDebugEnabled(options = {}) {
            if (typeof options.visualDebug === 'function') return !!options.visualDebug();
            return !!options.visualDebug;
        },

        async visualStep(options = {}, user, label, el = null, delay = 900) {
            if (!Core.ReportDriver.isVisualDebugEnabled(options)) return;
            const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            const current = `只檢舉可視化：${label}`;
            Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                state: 'running',
                current,
                progress: 0,
                total: queue.length,
                lastUpdate: Date.now(),
            });
            const statusEl = document.getElementById('bg-status');
            if (statusEl) statusEl.textContent = current;
            const progressText = document.getElementById('hege-progress-text');
            if (progressText) progressText.textContent = label;

            if (window.hegeLog) window.hegeLog(`[只檢舉][VISUAL] @${user} ${label}`);

            if (el && el.style) {
                const oldOutline = el.style.outline;
                const oldBoxShadow = el.style.boxShadow;
                const oldBorderRadius = el.style.borderRadius;
                el.style.outline = '3px solid #ffd60a';
                el.style.boxShadow = '0 0 0 6px rgba(255,214,10,0.28)';
                el.style.borderRadius = oldBorderRadius || '8px';
                setTimeout(() => {
                    if (!el.isConnected) return;
                    el.style.outline = oldOutline;
                    el.style.boxShadow = oldBoxShadow;
                    el.style.borderRadius = oldBorderRadius;
                }, Math.max(delay + 1200, 1600));
            }

            await Utils.safeSleep(delay);
        },

        findAnyText(texts, opts = {}) {
            for (const text of texts) {
                const el = Core.ReportDriver.findClickableByText(text, opts);
                if (el) return el;
            }
            return null;
        },

        findRowForUser(ctx, user) {
            const links = Array.from(ctx.querySelectorAll('a[href^="/@"]'));
            const link = links.find(a => {
                const href = a.getAttribute('href') || '';
                const candidate = href.includes('/@') ? href.split('/@')[1].split('/')[0] : '';
                return candidate === user;
            });
            if (!link) return null;

            let row = link.closest('div[role="listitem"], div[data-pressable-container="true"]');
            if (row && row.querySelector(CONFIG.SELECTORS.MORE_SVG)) return row;

            row = link;
            for (let i = 0; i < 12 && row && row !== ctx; i++) {
                if (row.querySelector && row.querySelector(CONFIG.SELECTORS.MORE_SVG)) return row;
                row = row.parentElement;
            }
            return link.closest('div') || link;
        },

        findRowMoreButton(row) {
            if (!row) return null;
            const svg = row.querySelector(CONFIG.SELECTORS.MORE_SVG);
            return svg ? svg.closest('div[role="button"]') : null;
        },

        findProfileMoreButton() {
            return Utils.pollUntil(() => {
                const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
                for (let svg of moreSvgs) {
                    if (svg.querySelector('circle') && svg.querySelectorAll('path').length >= 3) {
                        const btn = svg.closest('div[role="button"]');
                        if (btn) return btn;
                    }
                }
                if (moreSvgs.length > 0) return moreSvgs[0].closest('div[role="button"]');
                return null;
            }, 12000, 150);
        },

        findPostContentMoreButton() {
            return Utils.pollUntil(() => {
                const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
                for (let svg of moreSvgs) {
                    const circleCount = svg.querySelectorAll('circle').length;
                    const pathCount = svg.querySelectorAll('path').length;
                    if (circleCount >= 3 && pathCount === 0) {
                        const btn = svg.closest('div[role="button"]');
                        if (btn) return btn;
                    }
                }
                return null;
            }, 12000, 150);
        },

        findConfirmationButton() {
            const dialogRoots = Core.ReportDriver.getVisibleDialogs().reverse();
            for (const root of dialogRoots) {
                const button = Core.ReportDriver.findAnyText(CONFIRM_TEXTS, { exact: false, root, visibleOnly: true });
                if (button) return button;
            }
            if (dialogRoots.length === 0) {
                return Core.ReportDriver.findAnyText(CONFIRM_TEXTS, { exact: false, visibleOnly: true });
            }
            return null;
        },

        isElementVisible(el) {
            if (!el || !el.isConnected) return false;
            const style = window.getComputedStyle(el);
            if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },

        getVisibleDialogs() {
            return Array.from(document.querySelectorAll('div[role="dialog"]'))
                .filter(dialog => Core.ReportDriver.isElementVisible(dialog));
        },

        summarizeDialogDebug(dialog, index = 0) {
            return {
                index,
                visible: Core.ReportDriver.isElementVisible(dialog),
                text: Core.ReportDriver.compactDebugText(dialog.innerText || dialog.textContent, 220),
                buttons: Core.ReportDriver.getClickableTextNodes(dialog)
                    .map(item => Core.ReportDriver.compactDebugText(item.text, 60))
                    .filter(Boolean)
                    .slice(0, 16),
                userLinks: Array.from(dialog.querySelectorAll('a[href^="/@"]'))
                    .map(a => a.getAttribute('href'))
                    .filter(Boolean)
                    .slice(0, 12),
            };
        },

        getVisibleDialogDebugSummary() {
            return Core.ReportDriver.getVisibleDialogs().map((dialog, index) =>
                Core.ReportDriver.summarizeDialogDebug(dialog, index)
            );
        },

        getBlankDialogState() {
            const rawDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            const dialogs = rawDialogs.map((dialog, index) => Core.ReportDriver.summarizeDialogDebug(dialog, index));
            const blankDialogs = dialogs.filter(dialog =>
                !dialog.text &&
                dialog.buttons.length === 0 &&
                dialog.userLinks.length === 0
            );
            if (dialogs.length === 0 || blankDialogs.length !== dialogs.length) return null;
            const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
            if (visibleOptions.length > 0) return null;
            return {
                dialogs,
                blankCount: blankDialogs.length,
            };
        },

        getThankYouSubmitState() {
            const dialogs = Core.ReportDriver.getVisibleDialogs();
            for (const dialog of dialogs) {
                const text = dialog.innerText || dialog.textContent || '';
                const buttons = Core.ReportDriver.getClickableTextNodes(dialog)
                    .map(item => (item.text || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                const hasThankYouText = REPORT_THANK_YOU_TEXTS.some(item => text.includes(item));
                const hasDoneButton = buttons.some(item => ['完成', 'Done'].includes(item));
                if (hasThankYouText && hasDoneButton) {
                    return { confirmed: true, signal: 'thank_you_dialog' };
                }
            }
            return null;
        },

        hasActionableReportUI() {
            const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
            return visibleOptions.some(text => !['返回', '關閉', 'Back', 'Close'].includes(text));
        },

        getSubmitSuccessState(originDialog = null) {
            const thankYouState = Core.ReportDriver.getThankYouSubmitState();
            if (thankYouState) return thankYouState;

            if (Core.ReportDriver.checkReportDone() && !Core.ReportDriver.hasActionableReportUI()) {
                return { confirmed: true, signal: 'done_text' };
            }

            if (originDialog && (!originDialog.isConnected || !Core.ReportDriver.isElementVisible(originDialog))) {
                return { confirmed: true, signal: 'origin_dialog_closed' };
            }

            const dialogs = Core.ReportDriver.getVisibleDialogs();
            if (originDialog && dialogs.length > 0 && !dialogs.includes(originDialog) && !Core.ReportDriver.hasActionableReportUI()) {
                return { confirmed: true, signal: 'dialog_replaced' };
            }

            return null;
        },

        didNavigateToUserPost(user = '') {
            const pathname = location.pathname || '';
            if (!pathname.includes('/post/')) return false;
            if (!user) return true;
            return pathname.startsWith(`/@${user}/post/`);
        },

        findReportAccountTarget() {
            return Core.ReportDriver.findAnyText(REPORT_ACCOUNT_TEXTS, { exact: false });
        },

        findReportContentTarget() {
            return Core.ReportDriver.findAnyText(REPORT_CONTENT_TEXTS, { exact: false });
        },

        async selectReportTargetIfShown(kind = 'account', options = {}, user = '') {
            const target = await Utils.pollUntil(() => {
                const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
                const hasTargetChooser = visibleOptions.some(t => t.includes('檢舉貼文') || t.includes('檢舉帳號') || t.includes('Report post') || t.includes('Report account'));
                if (!hasTargetChooser) return null;
                return kind === 'content'
                    ? Core.ReportDriver.findReportContentTarget()
                    : Core.ReportDriver.findReportAccountTarget();
            }, 2000, 120);

            if (target) {
                if (window.hegeLog) window.hegeLog(`[只檢舉] 偵測到檢舉對象選擇層，選擇「${kind === 'content' ? '檢舉貼文、訊息或留言' : '檢舉帳號'}」`);
                Core.ReportDriver.logVisibleOptions('檢舉對象選擇前', { target: kind });
                Core.ReportDriver.recordDebugTrace('target_chooser_shown', user, options, { target: kind }, false);
                await Core.ReportDriver.visualStep(options, user, `準備選擇「${kind === 'content' ? '檢舉貼文、訊息或留言' : '檢舉帳號'}」`, target, 650);
                Utils.simClick(target);
                await Utils.safeSleep(420);
                const chooserStillVisible = await Utils.pollUntil(() => {
                    const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
                    const hasTargetChooser = visibleOptions.some(t => t.includes('檢舉貼文') || t.includes('檢舉帳號') || t.includes('Report post') || t.includes('Report account'));
                    return hasTargetChooser ? null : true;
                }, 1200, 120);
                Core.ReportDriver.logVisibleOptions('檢舉對象選擇後', { target: kind, advanced: !!chooserStillVisible });
                if (!chooserStillVisible) {
                    Core.ReportDriver.recordDebugTrace('target_chooser_not_advanced', user, options, { target: kind }, true);
                    Core.ReportDriver.remindReportRateLimit(user, 'target_chooser_not_advanced');
                    return false;
                }
                Core.ReportDriver.recordDebugTrace('target_chooser_advanced', user, options, { target: kind }, false);
                return true;
            }
            Core.ReportDriver.logVisibleOptions('沒有出現檢舉對象選擇層', { target: kind });
            Core.ReportDriver.recordDebugTrace('target_chooser_not_shown', user, options, { target: kind }, false);
            return false;
        },

        checkReportDone() {
            const dialogs = Core.ReportDriver.getVisibleDialogs();
            const sources = dialogs.length > 0 ? dialogs : [document.body];
            return sources.some(source => {
                const text = source.innerText || source.textContent || '';
                return REPORT_DONE_TEXTS.some(t => text.includes(t));
            });
        },

        removeCurrent(user) {
            const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            if (queue[0] === user) {
                queue.shift();
                Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, queue);
            } else {
                Storage.queueRemove(CONFIG.KEYS.REPORT_QUEUE, user);
            }
            const context = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
            if (context[user]) {
                delete context[user];
                Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, context);
            }
            Core.ReportDriver.clearBatchPathIfQueueEmpty();
        },

        recordHistory(user, options = {}) {
            if (!user) return;
            const contextMap = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
            const context = contextMap[user] || options.reportContext || {};
            const path = Core.ReportDriver.getReportPath();
            const history = Storage.getJSON(CONFIG.KEYS.REPORT_HISTORY, []);
            const entry = {
                type: 'report',
                username: user,
                t: Date.now(),
                sourceUrl: context.sourceUrl || '',
                source: context.source || '',
                sourceText: context.sourceText || '',
                sourceOwner: context.sourceOwner || '',
                targetType: context.targetType || 'account',
                path,
            };
            history.push(entry);
            if (history.length > 5000) history.splice(0, history.length - 5000);
            Storage.setJSON(CONFIG.KEYS.REPORT_HISTORY, history);
            Storage.evidence.captureFromReportHistory(entry, context);
        },

        scheduleNext(options = {}) {
            const delay = 120 + Math.floor(Math.random() * 140);
            const next = options.continueWith || (() => Core.ReportDriver.processNext(options));
            setTimeout(next, delay);
        },

        async processNext(options = {}) {
            if (Core.ReportDriver._running) return true;

            Storage.invalidate(CONFIG.KEYS.REPORT_QUEUE);
            const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            const user = queue[0];
            if (!user) {
                Core.ReportDriver.clearBatchPathIfQueueEmpty();
                return false;
            }

            if (!Storage.isUnderReportLimit()) {
                const limit = Storage.getDailyReportLimit();
                const done = Storage.getReportsLast24h();
                Core.ReportDriver.warnReportLimit(`只檢舉已超過每日提醒門檻 ${done}/${limit}`);
            }

            Core.ReportDriver._running = true;
            try {
                Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                    state: 'running',
                    current: `只檢舉: @${user}`,
                    progress: 0,
                    total: queue.length,
                    lastUpdate: Date.now(),
                });

                const mode = options.mode || 'dialog';
                const needsDialog = mode === 'dialog';
                const ctx = needsDialog ? Core.ReportDriver.getDialogContext(user, options) : null;
                if (needsDialog && !ctx) {
                    if (options.keepWorkerOpenOnError) {
                        return Core.ReportDriver.pauseForDebug(user, options, 'missing_dialog', '找不到互動名單 dialog');
                    }
                    Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                        state: 'paused',
                        current: '只檢舉等待互動名單 dialog',
                        progress: 0,
                        total: queue.length,
                        lastUpdate: Date.now(),
                    });
                    UI.showToast('找不到互動名單 dialog，只檢舉佇列已保留', 3500);
                    return false;
                }

                const row = mode === 'profile' || mode === 'post' ? null : Core.ReportDriver.findRowForUser(ctx, user);
                const moreBtn = mode === 'post'
                    ? await Core.ReportDriver.findPostContentMoreButton()
                    : (mode === 'profile'
                        ? await Core.ReportDriver.findProfileMoreButton()
                        : Core.ReportDriver.findRowMoreButton(row));
                if (!moreBtn) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_more_button', `找不到 @${user} 的更多按鈕`);
                }

                await Core.ReportDriver.visualStep(options, user, mode === 'post' ? '準備點來源貼文的更多' : '準備點使用者主頁的更多', moreBtn, 650);
                Utils.simClick(moreBtn);
                const reportMenuItem = await Utils.pollUntil(() => {
                    return Core.ReportDriver.findAnyText(REPORT_TEXTS, { exact: false });
                }, 2000, 120);
                if (!reportMenuItem) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_report_menu_item', `@${user} 選單內找不到檢舉項目`);
                }

                await Core.ReportDriver.visualStep(options, user, '準備點「檢舉」', reportMenuItem, 600);
                Utils.simClick(reportMenuItem);
                const reportMenuClickAt = Date.now();
                Core.ReportDriver.recordDebugTrace('report_menu_clicked', user, options, { mode }, false);
                await Utils.safeSleep(220);
                await Core.ReportDriver.selectReportTargetIfShown(mode === 'post' ? 'content' : 'account', options, user);
                const blankDialogAfterMenu = Core.ReportDriver.getBlankDialogState();
                if (blankDialogAfterMenu) {
                    Core.ReportDriver.remindReportRateLimit(user, 'blank_report_dialog_after_menu');
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'blank_report_dialog_stuck', `@${user} 的檢舉視窗出現空白 dialog，內容沒有載入`, {
                        blankDialogs: blankDialogAfterMenu.dialogs,
                        blankCount: blankDialogAfterMenu.blankCount,
                        elapsedSinceMenuClickMs: Date.now() - reportMenuClickAt,
                    });
                }

                const path = Core.ReportDriver.getExecutionPath(mode);
                if (window.hegeLog) window.hegeLog(`[只檢舉] 執行檢舉路徑=${JSON.stringify(path)}`);
                Core.ReportDriver.logVisibleOptions('準備進入檢舉路徑', { mode, user });
                let pathIndex = 0;
                let loggedFirstPathResolution = false;
                while (pathIndex < path.length) {
                    const waitStartedAt = Date.now();
                    const match = await Utils.pollUntil(() => {
                        if (Core.ReportDriver.findConfirmationButton() || Core.ReportDriver.checkReportDone()) {
                            return { done: true };
                        }
                        return Core.ReportDriver.findNextReportOption(path, pathIndex);
                    }, 3500, 120);
                    const waitElapsedMs = Date.now() - waitStartedAt;
                    const sinceMenuClickMs = Date.now() - reportMenuClickAt;
                    if (!loggedFirstPathResolution && pathIndex === 0) {
                        if (!match) {
                            Core.ReportDriver.recordDebugTrace('report_flow_timeout_after_menu_click', user, options, {
                                mode,
                                waitElapsedMs,
                                sinceMenuClickMs,
                                remainingPath: path.slice(pathIndex),
                            }, true);
                        } else if (match.done) {
                            Core.ReportDriver.recordDebugTrace('report_flow_reached_confirm_without_path', user, options, {
                                mode,
                                waitElapsedMs,
                                sinceMenuClickMs,
                            }, true);
                            loggedFirstPathResolution = true;
                        } else {
                            Core.ReportDriver.recordDebugTrace(
                                sinceMenuClickMs >= 2500 ? 'slow_report_flow_start' : 'report_flow_started',
                                user,
                                options,
                                {
                                    mode,
                                    waitElapsedMs,
                                    sinceMenuClickMs,
                                    firstStep: match.step,
                                    offset: match.offset,
                                },
                                sinceMenuClickMs >= 2500
                            );
                            loggedFirstPathResolution = true;
                        }
                    }
                    if (!match) {
                        const blankDialogState = Core.ReportDriver.getBlankDialogState();
                        if (blankDialogState) {
                            Core.ReportDriver.remindReportRateLimit(user, 'blank_report_dialog_mid_flow');
                            return Core.ReportDriver.skipOrPauseForDebug(user, options, 'blank_report_dialog_stuck', `@${user} 的檢舉視窗出現空白 dialog，內容沒有載入`, {
                                pathIndex,
                                remainingPath: path.slice(pathIndex),
                                blankDialogs: blankDialogState.dialogs,
                                blankCount: blankDialogState.blankCount,
                                elapsedSinceMenuClickMs: Date.now() - reportMenuClickAt,
                            });
                        }
                        const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
                        if (window.hegeLog) {
                            window.hegeLog(`[只檢舉] 找不到檢舉選項，期待剩餘 path=${JSON.stringify(path.slice(pathIndex))}`);
                            window.hegeLog(`[只檢舉] 目前可見選項=${JSON.stringify(visibleOptions)}`);
                        }
                        if (pathIndex === 0) {
                            Core.ReportDriver.remindReportRateLimit(user, 'missing_first_report_option');
                        }
                        return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_report_option', `找不到檢舉選項「${path[pathIndex]}」`, {
                            pathIndex,
                            remainingPath: path.slice(pathIndex),
                            visibleOptions,
                        });
                    }
                    if (match.done) break;
                    if (match.offset > 0 && window.hegeLog) {
                        window.hegeLog(`[只檢舉] 略過不存在的檢舉層級: ${JSON.stringify(path.slice(pathIndex, pathIndex + match.offset))}`);
                    }
                    if (window.hegeLog) {
                        window.hegeLog(`[只檢舉] 選擇檢舉項目「${match.step}」 pathIndex=${pathIndex} offset=${match.offset}`);
                    }
                    await Core.ReportDriver.visualStep(options, user, `準備選擇「${match.step}」`, match.option, 650);
                    Utils.simClick(match.option);
                    pathIndex += match.offset + 1;
                    await Utils.safeSleep(700);
                    Core.ReportDriver.logVisibleOptions(`選擇「${match.step}」後`, { nextPath: path.slice(pathIndex) });
                }

                let submitOriginDialog = null;
                for (let i = 0; i < 3; i++) {
                    const confirmBtn = await Utils.pollUntil(() => {
                        return Core.ReportDriver.findConfirmationButton();
                    }, i === 0 ? 2200 : 1200, 120);
                    if (!confirmBtn) break;
                    const originDialog = confirmBtn.closest('div[role="dialog"]');
                    submitOriginDialog = originDialog || submitOriginDialog;
                    const confirmText = (confirmBtn.innerText || confirmBtn.textContent || '').replace(/\s+/g, ' ').trim();
                    if (window.hegeLog) window.hegeLog(`[只檢舉] 準備點確認按鈕「${confirmText || '提交/完成'}」 round=${i + 1}`);
                    await Core.ReportDriver.visualStep(options, user, `準備點「${confirmText || '提交/完成'}」`, confirmBtn, 650);
                    Utils.simClick(confirmBtn);
                    await Utils.safeSleep(700);
                    const submitState = Core.ReportDriver.getSubmitSuccessState(originDialog);
                    Core.ReportDriver.logVisibleOptions(`點「${confirmText || '提交/完成'}」後`, submitState || { done: false });
                    if (submitState) break;
                }

                const finalSubmitState = await Utils.pollUntil(() => {
                    return Core.ReportDriver.getSubmitSuccessState(submitOriginDialog);
                }, 3000, 150);
                Core.ReportDriver.logVisibleOptions('檢舉送出檢查後', finalSubmitState || { done: false });
                if (!finalSubmitState) {
                    if (Core.ReportDriver.didNavigateToUserPost(user)) {
                        return Core.ReportDriver.skipOrPauseForDebug(user, options, 'navigated_to_post_during_report_flow', `@${user} 的檢舉流程中途跳到了貼文頁`, {
                            remainingPath: path.slice(pathIndex),
                            visibleOptions: Core.ReportDriver.getVisibleReportOptionTexts(),
                            hadConfirmDialog: !!submitOriginDialog,
                            pathname: location.pathname,
                        });
                    }
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'submit_not_confirmed', `@${user} 沒有拿到明確送出成功訊號`, {
                        remainingPath: path.slice(pathIndex),
                        visibleOptions: Core.ReportDriver.getVisibleReportOptionTexts(),
                        hadConfirmDialog: !!submitOriginDialog,
                    });
                }
                Core.ReportDriver.recordDebugTrace('report_success', user, options, {
                    finalSignal: finalSubmitState.signal || 'unknown',
                    totalElapsedMs: Date.now() - reportMenuClickAt,
                }, false);

                Storage.recordReport();
                Core.ReportDriver.recordHistory(user, options);
                if (typeof options.onSuccess === 'function') {
                    options.onSuccess(user);
                }
                Core.ReportDriver.removeCurrent(user);
                if (window.hegeLog) window.hegeLog(`[只檢舉] @${user} 檢舉流程已記錄完成，剩餘 queue=${Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length}`);
                UI.showToast(`已送出 @${user} 的只檢舉流程`, 2500);
                Core.ReportDriver.scheduleNext(options);
                return true;
            } catch (err) {
                console.error('[ReportDriver] processNext failed:', err);
                return Core.ReportDriver.skipOrPauseForDebug(user, options, 'exception', `只檢舉流程發生錯誤：${err.message || err}`, {
                    errorName: err?.name || '',
                    errorMessage: err?.message || String(err),
                    stack: String(err?.stack || '').slice(0, 800),
                });
            } finally {
                Core.ReportDriver._running = false;
            }
        },
    },
});
