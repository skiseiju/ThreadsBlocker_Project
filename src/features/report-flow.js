// 只檢舉 Phase 1：在既有 likes dialog 內逐筆走 Threads 檢舉流程
import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { UI } from '../ui.js';
import { Utils } from '../utils.js';
import { Core } from '../core.js';
import { Worker, PROFILE_ROOT_WAIT_MS } from '../worker.js';
import { MoreLocator } from '../more-locator.js';

const ACCOUNT_CONTENT_REASON = '該帳號發佈的內容不應該顯示在 Threads 上。';
const DEFAULT_REPORT_PATH = ['這是垃圾訊息'];
// Keep report menu timing aligned with Worker.autoBlock: tolerate a slow Threads
// menu for up to 8 seconds and retry the original More button once after 3s.
const REPORT_MENU_TIMEOUT_MS = 8000;
const REPORT_MENU_RETRY_AFTER_MS = 3000;
const REPORT_OPTION_TIMEOUT_MS = 8000;
const PROFILE_ROOT_INVALID_PHRASES = ['連結失效', '頁面不存在', 'Page not found', 'Broken link', 'Sorry, this page', '找不到頁面'];
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
        _blankDialogFirstSeenAt: 0,
        _blankDialogSignature: '',
        _diagnosticOperationId: null,

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

        hasExplicitRestrictionSignal() {
            const phrases = ['稍後再試', 'Try again later', '為了保護', 'protect our community', '受到限制', 'restrict certain activity', 'rate limit', '頻率限制'];
            const roots = [...Core.ReportDriver.getVisibleDialogs(), ...Array.from(document.querySelectorAll('[role="alert"]'))];
            return roots.some(root => phrases.some(phrase => (root.innerText || root.textContent || '').includes(phrase)));
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

        diagnosticPhaseForReason(reason = '') {
            if (['missing_dialog', 'missing_profile_root'].includes(reason)) return 'root_resolve';
            if (['missing_more_button'].includes(reason)) return 'more_resolve';
            if (['private_manual_required'].includes(reason)) return 'menu_resolve';
            if (['navigation_mismatch', 'navigated_to_post_during_report_flow'].includes(reason)) return 'navigation_check';
            if (['menu_not_found', 'missing_report_menu_item'].includes(reason)) return 'menu_resolve';
            if (['missing_report_option', 'missing_report_step', 'blank_dialog_stuck', 'blank_report_dialog_stuck'].includes(reason)) return 'action_resolve';
            if (['submit_not_confirmed'].includes(reason)) return 'confirm_resolve';
            return 'action_resolve';
        },

        recordSafetyDiagnostic(phase, result = 'unknown', extra = {}, timing = {}) {
            const counts = {
                moreCandidates: extra.moreCandidates ?? 0,
                menuItems: extra.menuItems ?? 0,
                confirmButtons: extra.confirmButtons ?? 0,
                postFallbackAttempts: extra.postFallbackAttempts ?? 0,
            };
            return Worker.recordSafetyDiagnostic(
                phase,
                result,
                MoreLocator.routeType(),
                counts,
                {
                    elapsedMs: timing.elapsedMs ?? extra.elapsedMs ?? 0,
                    retryCount: timing.retryCount ?? extra.retryCount ?? 0,
                },
                {
                    feature: 'report',
                    operationId: Core.ReportDriver._diagnosticOperationId,
                    fields: { ...(timing.fields || {}), ...(extra.fields || {}) },
                },
            );
        },

        findClickableByText(text, { exact = true, root = document, visibleOnly = false } = {}) {
            const nodes = root.querySelectorAll('div[role="menuitem"], div[role="button"], button, span[dir="auto"], a[role="link"]');
            for (const node of nodes) {
                const target = node.closest('div[role="menuitem"], div[role="button"], button, a[role="link"]') || node;
                if (Core.ReportDriver.isHegeUiElement(target)) continue;
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
                .filter(item => item.text.length > 0 && !Core.ReportDriver.isHegeUiElement(item.node));
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
            // 沒有檢舉視窗就沒有下一層選項，直接放棄。舊版在這裡退回整份 document，
            // 於是文字比對會掃到左側主導覽（訊息／搜尋／個人檔案…），點下去就導去
            // 別的頁面，接著送出鈕當然找不到（BUGLIST #10、#13）。這是 fail-open，
            // 必須 fail-closed。
            if (dialogs.length === 0) return null;
            const roots = dialogs;

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
            // 同上：沒有視窗就回空陣列。否則診斷訊息會列出整頁的可點文字，
            // 讓人以為那些是檢舉選項。
            const root = dialogs[0];
            if (!root) return [];
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
            const explicitRestriction = Core.ReportDriver.hasExplicitRestrictionSignal();
            const privateManualGate = extra.privateProfile === true
                && ['missing_more_button', 'menu_not_found', 'missing_report_menu_item', 'missing_report_option', 'blank_dialog_stuck', 'blank_report_dialog_stuck', 'submit_not_confirmed'].includes(reason);
            const result = explicitRestriction ? 'rate_limited'
                : privateManualGate ? 'private_manual_required'
                : reason === 'navigation_mismatch' ? 'navigation_mismatch'
                : reason === 'private_manual_required' ? 'private_manual_required'
                    : reason === 'navigated_to_post_during_report_flow' ? 'navigated_to_post'
                    : ['missing_more_button', 'missing_report_menu_item', 'missing_report_option'].includes(reason) ? 'menu_not_found'
                        : reason;
            Core.ReportDriver.recordSafetyDiagnostic(
                Core.ReportDriver.diagnosticPhaseForReason(reason),
                result,
                { menuItems: extra.menuItems, confirmButtons: extra.confirmButtons, fields: extra.fields || {} },
                { elapsedMs: extra.elapsedMs ?? extra.elapsedSinceMenuClickMs, retryCount: extra.retryCount },
            );
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

        getMoreButtonText(el) {
            return MoreLocator.textOf(el);
        },

        getMoreButtonClickable(el) {
            let node = el;
            for (let depth = 0; node && depth < 8; depth++) {
                if (node.matches?.('button, div[role="button"], [role="menuitem"], [tabindex="0"]')) return node;
                node = node.parentElement;
            }
            return el?.closest?.('button, div[role="button"], [role="menuitem"], [tabindex="0"]') || el;
        },

        looksLikeMoreButton(el) {
            if (!el) return false;
            const svg = el.matches?.('svg') ? el : (el.querySelector?.(CONFIG.SELECTORS.MORE_SVG) || el.querySelector?.('svg[aria-label]'));
            const text = [
                Core.ReportDriver.getMoreButtonText(el),
                Core.ReportDriver.getMoreButtonText(svg),
            ].join(' ');
            return MoreLocator.LABEL_RE.test(text)
                || !!MoreLocator.explicitAriaLabel(el)
                || MoreLocator.isMoreShape(el)
                || MoreLocator.isMoreShape(svg);
        },

        findMoreButtonCandidates(root = document, mode = 'row') {
            return MoreLocator.findCandidates(root, { mode });
        },

        findRowMoreButton(row) {
            if (!row) return null;
            return Core.ReportDriver.findMoreButtonCandidates(row, 'row')[0]?.el || null;
        },

        findProfileMoreButton(user = '') {
            if (Worker?.findMoreButton) return Worker.findMoreButton(PROFILE_ROOT_WAIT_MS, user);
            const profileRoot = Core.findProfileRoot?.(user);
            if (!profileRoot) return null;
            return Utils.pollUntil(() => MoreLocator.find(profileRoot, { mode: 'profile', trustedRoot: true }), PROFILE_ROOT_WAIT_MS, 150);
        },

        findPostContentMoreButton() {
            return Utils.pollUntil(() => MoreLocator.find(document, { mode: 'post' }), PROFILE_ROOT_WAIT_MS, 150);
        },

        isInvalidProfilePage() {
            const bodyText = document.body?.innerText || document.body?.textContent || '';
            return PROFILE_ROOT_INVALID_PHRASES.some(phrase => bodyText.includes(phrase));
        },

        async waitForProfileRoot(user = '') {
            const startedAt = Date.now();
            let profileRoot = null;
            let rootSeenThenMissing = false;
            await Utils.pollUntil(() => {
                if (Core.ReportDriver.isInvalidProfilePage()) return true;
                const nextRoot = Core.findProfileRoot?.(user) || null;
                if (profileRoot && !nextRoot) rootSeenThenMissing = true;
                profileRoot = nextRoot;
                return !!profileRoot;
            }, PROFILE_ROOT_WAIT_MS);

            if (Core.ReportDriver.isInvalidProfilePage()) {
                return { root: null, reason: 'vanished', waitMs: Date.now() - startedAt };
            }

            // 逾時後再補查一次，避免最後一輪輪詢與逾時之間出現空窗。
            if (!profileRoot) profileRoot = Core.findProfileRoot?.(user) || null;
            const observation = Core.getProfileRootObservation?.(user) || {};
            const liveRoot = profileRoot ? Core.findProfileRoot?.(user) || null : null;
            if (profileRoot && !liveRoot) rootSeenThenMissing = true;
            return {
                root: profileRoot,
                reason: profileRoot ? 'success' : 'missing_profile_root',
                waitMs: Date.now() - startedAt,
                observation: {
                    ...observation,
                    rootSeenThenMissing,
                    invalidProfilePage: Core.ReportDriver.isInvalidProfilePage(),
                    restrictionSignal: Core.ReportDriver.hasExplicitRestrictionSignal(),
                },
            };
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

        isHegeUiElement(el) {
            return !!el?.closest?.('#hege-panel, #hege-worker-cover, #hege-three-no-worker-overlay, #hege-toast');
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
            if (dialogs.length === 0 || blankDialogs.length !== dialogs.length) {
                Core.ReportDriver._blankDialogFirstSeenAt = 0;
                Core.ReportDriver._blankDialogSignature = '';
                return null;
            }
            const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
            if (visibleOptions.length > 0) {
                Core.ReportDriver._blankDialogFirstSeenAt = 0;
                Core.ReportDriver._blankDialogSignature = '';
                return null;
            }
            const signature = rawDialogs.map(dialog => {
                const rect = dialog.getBoundingClientRect();
                return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
            }).join('|');
            const now = Date.now();
            if (Core.ReportDriver._blankDialogSignature !== signature) {
                Core.ReportDriver._blankDialogSignature = signature;
                Core.ReportDriver._blankDialogFirstSeenAt = now;
                return null;
            }
            if (now - Core.ReportDriver._blankDialogFirstSeenAt < 7000) return null;
            return {
                dialogs,
                blankCount: blankDialogs.length,
                blankForMs: now - Core.ReportDriver._blankDialogFirstSeenAt,
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
            const findTarget = () => {
                const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
                const hasTargetChooser = visibleOptions.some(t => t.includes('檢舉貼文') || t.includes('檢舉帳號') || t.includes('Report post') || t.includes('Report account'));
                if (!hasTargetChooser) return null;
                return kind === 'content'
                    ? Core.ReportDriver.findReportContentTarget()
                    : Core.ReportDriver.findReportAccountTarget();
            };

            const directPaths = kind === 'account'
                ? [Core.ReportDriver.getReportPath(), Core.ReportDriver.getExecutionPath('profile')]
                : [Core.ReportDriver.getExecutionPath('post')];
            const waitStartedAt = Date.now();
            const waitUntil = waitStartedAt + 10000;
            let nextWaitLogAt = waitStartedAt;
            let target = null;
            while (Date.now() < waitUntil) {
                target = findTarget();
                if (target) break;
                if (
                    Core.ReportDriver.findConfirmationButton()
                    || Core.ReportDriver.checkReportDone()
                    || directPaths.some(path => Core.ReportDriver.findNextReportOption(path, 0))
                ) {
                    break;
                }
                const elapsedMs = Date.now() - waitStartedAt;
                if (Date.now() >= nextWaitLogAt) {
                    const elapsedSec = Math.floor(elapsedMs / 1000);
                    if (window.hegeLog) window.hegeLog(`[只檢舉] 等待 Meta 檢舉視窗載入中：${elapsedSec} 秒`);
                    Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                        state: 'running',
                        current: `只檢舉等待 Meta 檢舉視窗載入: @${user} (${elapsedSec} 秒)`,
                        lastUpdate: Date.now(),
                    });
                    nextWaitLogAt += 1000;
                }
                await Utils.safeSleep(120);
            }
            if (!target) target = findTarget();

            if (target) {
                const waitElapsedMs = Date.now() - waitStartedAt;
                if (window.hegeLog) window.hegeLog(`[只檢舉] 偵測到檢舉對象選擇層，等待 ${Math.round(waitElapsedMs / 1000)} 秒，選擇「${kind === 'content' ? '檢舉貼文、訊息或留言' : '檢舉帳號'}」`);
                Core.ReportDriver.logVisibleOptions('檢舉對象選擇前', { target: kind });
                Core.ReportDriver.recordDebugTrace('target_chooser_shown', user, options, { target: kind, waitElapsedMs }, false);
                await Core.ReportDriver.visualStep(options, user, `準備選擇「${kind === 'content' ? '檢舉貼文、訊息或留言' : '檢舉帳號'}」`, target, 320);
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
                    if (Core.ReportDriver.hasExplicitRestrictionSignal()) Core.ReportDriver.remindReportRateLimit(user, 'target_chooser_not_advanced');
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
            const operationId = Core.RuntimeDiagnostics?.begin('report', { strategy: 'route', queuedCount: queue.length });
            Core.ReportDriver._diagnosticOperationId = operationId;
            Core.RuntimeDiagnostics?.record('report', 'report', { operationId, queuedCount: queue.length, active: true });
            const diagnosticStartedAt = Date.now();
            let diagnosticRetryCount = 0;
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
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_dialog', '找不到互動名單 dialog');
                }
                if (needsDialog) Core.ReportDriver.recordSafetyDiagnostic('root_resolve', 'success');

                const row = mode === 'profile' || mode === 'post' ? null : Core.ReportDriver.findRowForUser(ctx, user);
                const profileRootResult = mode === 'profile'
                    ? await Core.ReportDriver.waitForProfileRoot(user)
                    : { root: null, reason: '', waitMs: 0 };
                const profileRoot = profileRootResult.root;
                if (mode === 'profile' && profileRootResult.reason === 'vanished') {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'vanished', `@${user} 的帳號頁面已失效`, {
                        elapsedMs: profileRootResult.waitMs,
                    });
                }
                if (mode === 'profile' && !profileRoot) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_profile_root', `@${user} 的帳號頁面尚未載入完成`, {
                        elapsedMs: profileRootResult.waitMs,
                        waitMs: profileRootResult.waitMs,
                        fields: profileRootResult.observation || {},
                    });
                }
                if (mode === 'profile') {
                    Core.ReportDriver.recordSafetyDiagnostic('root_resolve', 'success', {}, {
                        elapsedMs: profileRootResult.waitMs,
                        fields: profileRootResult.observation || {},
                    });
                }
                const privateState = mode === 'profile' ? MoreLocator.detectPrivateProfileState(profileRoot) : { private: false };
                const routeBeforeMore = MoreLocator.routeType();
                const moreBtn = mode === 'post'
                    ? await Core.ReportDriver.findPostContentMoreButton()
                    : (mode === 'profile'
                        ? await Core.ReportDriver.findProfileMoreButton(user)
                        : Core.ReportDriver.findRowMoreButton(row));
                if (!moreBtn) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_more_button', `找不到 @${user} 的可信更多按鈕`, {
                        privateProfile: privateState.private,
                    });
                }
                Core.ReportDriver.recordSafetyDiagnostic('more_resolve', 'success', { moreCandidates: 1 });

                await Core.ReportDriver.visualStep(options, user, mode === 'post' ? '準備點來源貼文的更多' : '準備點使用者主頁的更多', moreBtn, 320);
                Utils.simClick(moreBtn);
                await Utils.safeSleep(60);
                if (!MoreLocator.routeMatches(routeBeforeMore, MoreLocator.routeType(), mode === 'post' ? 'post' : 'profile')) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'navigation_mismatch', `@${user} 的 More 點擊後路由不符`, {
                        routeBefore: routeBeforeMore,
                        routeAfter: MoreLocator.routeType(),
                    });
                }
                Core.ReportDriver.recordSafetyDiagnostic('navigation_check', 'success');
                let reportMenuClickRetried = false;
                const reportMenuStartedAt = Date.now();
                const reportMenuItem = await Utils.pollUntil(() => {
                    const item = Core.ReportDriver.findAnyText(REPORT_TEXTS, { exact: false });
                    if (item) return item;

                    // Match the block worker's recovery path: only retry when no
                    // native menu item appeared, so an already-open menu is not toggled closed.
                    if (!reportMenuClickRetried && Date.now() - reportMenuStartedAt > REPORT_MENU_RETRY_AFTER_MS) {
                        const menuItems = document.querySelectorAll('div[role="menuitem"]');
                        if (menuItems.length === 0) {
                            reportMenuClickRetried = true;
                            diagnosticRetryCount++;
                            if (window.hegeLog) window.hegeLog('[只檢舉] 選單未開啟，重試 simClick...');
                            Utils.simClick(moreBtn);
                        }
                    }
                    return null;
                }, REPORT_MENU_TIMEOUT_MS, 150);
                if (!reportMenuItem) {
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'menu_not_found', `@${user} 選單內找不到可信檢舉項目`, {
                        privateProfile: privateState.private,
                    });
                }
                Core.ReportDriver.recordSafetyDiagnostic('menu_resolve', 'success', {
                    menuItems: document.querySelectorAll('div[role="menuitem"], div[role="button"]').length,
                }, { retryCount: diagnosticRetryCount });

                Core.ReportDriver.recordSafetyDiagnostic('action_resolve', 'success', {}, {
                    elapsedMs: Date.now() - diagnosticStartedAt,
                    retryCount: diagnosticRetryCount,
                });
                await Core.ReportDriver.visualStep(options, user, '準備點「檢舉」', reportMenuItem, 300);
                Core.ThreeNoWatch?.appendNetworkActionMarker?.('report_menu_click', {
                    user,
                    mode,
                    phase: 'before_click',
                });
                Utils.simClick(reportMenuItem);
                const reportMenuClickAt = Date.now();
                Core.ReportDriver.recordDebugTrace('report_menu_clicked', user, options, { mode }, false);
                await Utils.safeSleep(220);
                await Core.ReportDriver.selectReportTargetIfShown(mode === 'post' ? 'content' : 'account', options, user);
                const blankDialogAfterMenu = Core.ReportDriver.getBlankDialogState();
                if (blankDialogAfterMenu) {
                    if (Core.ReportDriver.hasExplicitRestrictionSignal()) Core.ReportDriver.remindReportRateLimit(user, 'blank_report_dialog_after_menu');
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'blank_report_dialog_stuck', `@${user} 的檢舉視窗出現空白 dialog，內容沒有載入`, {
                        blankDialogs: blankDialogAfterMenu.dialogs,
                        blankCount: blankDialogAfterMenu.blankCount,
                        elapsedSinceMenuClickMs: Date.now() - reportMenuClickAt,
                        privateProfile: privateState.private,
                    });
                }

                const path = Core.ReportDriver.getExecutionPath(mode);
                if (window.hegeLog) window.hegeLog(`[只檢舉] 執行檢舉路徑=${JSON.stringify(path)}`);
                Core.ReportDriver.logVisibleOptions('準備進入檢舉路徑', { mode, user });
                let pathIndex = 0;
                let reachedConfirmationGate = false;
                let loggedFirstPathResolution = false;
                while (pathIndex < path.length) {
                    const waitStartedAt = Date.now();
                    const match = await Utils.pollUntil(() => {
                        if (Core.ReportDriver.findConfirmationButton() || Core.ReportDriver.checkReportDone()) {
                            return { done: true };
                        }
                        return Core.ReportDriver.findNextReportOption(path, pathIndex);
                    }, REPORT_OPTION_TIMEOUT_MS, 150);
                    const waitElapsedMs = Date.now() - waitStartedAt;
                    const sinceMenuClickMs = Date.now() - reportMenuClickAt;
                    if (match?.done) reachedConfirmationGate = true;
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
                            if (Core.ReportDriver.hasExplicitRestrictionSignal()) Core.ReportDriver.remindReportRateLimit(user, 'blank_report_dialog_mid_flow');
                            return Core.ReportDriver.skipOrPauseForDebug(user, options, 'blank_report_dialog_stuck', `@${user} 的檢舉視窗出現空白 dialog，內容沒有載入`, {
                                pathIndex,
                                remainingPath: path.slice(pathIndex),
                                blankDialogs: blankDialogState.dialogs,
                                blankCount: blankDialogState.blankCount,
                                elapsedSinceMenuClickMs: Date.now() - reportMenuClickAt,
                                privateProfile: privateState.private,
                            });
                        }
                        const visibleOptions = Core.ReportDriver.getVisibleReportOptionTexts();
                        if (window.hegeLog) {
                            window.hegeLog(`[只檢舉] 找不到檢舉選項，期待剩餘 path=${JSON.stringify(path.slice(pathIndex))}`);
                            window.hegeLog(`[只檢舉] 目前可見選項=${JSON.stringify(visibleOptions)}`);
                        }
                        if (pathIndex === 0) {
                            if (Core.ReportDriver.hasExplicitRestrictionSignal()) Core.ReportDriver.remindReportRateLimit(user, 'missing_first_report_option');
                        }
                        const missingReason = pathIndex > 0 ? 'missing_report_step' : 'missing_report_option';
                        const missingMessage = pathIndex > 0
                            ? `檢舉第 ${pathIndex + 1} 步尚未出現`
                            : `找不到檢舉選項「${path[pathIndex]}」`;
                        return Core.ReportDriver.skipOrPauseForDebug(user, options, missingReason, missingMessage, {
                            pathIndex,
                            remainingPath: path.slice(pathIndex),
                            visibleOptions,
                            privateProfile: privateState.private,
                            elapsedMs: waitElapsedMs,
                            fields: {
                                waitingForStep: pathIndex > 0,
                                nextStepIndex: pathIndex,
                                actionCount: pathIndex,
                                dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                            },
                        });
                    }
                    if (match.done) break;
                    if (match.offset > 0 && window.hegeLog) {
                        window.hegeLog(`[只檢舉] 略過不存在的檢舉層級: ${JSON.stringify(path.slice(pathIndex, pathIndex + match.offset))}`);
                    }
                    if (window.hegeLog) {
                        window.hegeLog(`[只檢舉] 選擇檢舉項目「${match.step}」 pathIndex=${pathIndex} offset=${match.offset}`);
                    }
                    await Core.ReportDriver.visualStep(options, user, `準備選擇「${match.step}」`, match.option, 320);
                    Core.ThreeNoWatch?.appendNetworkActionMarker?.('report_option_click', {
                        user,
                        mode,
                        pathIndex,
                        step: match.step,
                        phase: 'before_click',
                    });
                    Utils.simClick(match.option);
                    Core.ReportDriver.recordSafetyDiagnostic('action_resolve', 'success', {}, {
                        elapsedMs: Date.now() - diagnosticStartedAt,
                        retryCount: diagnosticRetryCount,
                        fields: {
                            waitingForStep: pathIndex + match.offset + 1 < path.length,
                            nextStepIndex: pathIndex + match.offset + 1,
                            actionCount: pathIndex + 1,
                            dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                        },
                    });
                    pathIndex += match.offset + 1;
                    await Utils.safeSleep(700);
                    Core.ReportDriver.logVisibleOptions(`選擇「${match.step}」後`, { nextPath: path.slice(pathIndex) });
                    // 保險絲：選項只該在檢舉視窗裡切換層級，不該讓頁面換路由。真的離開
                    // 個人頁／貼文頁就代表點到了視窗以外的東西，立刻停手而不是繼續點。
                    const routeAfterOption = MoreLocator.routeType();
                    if (!MoreLocator.routeMatches(routeBeforeMore, routeAfterOption, mode === 'post' ? 'post' : 'profile')) {
                        return Core.ReportDriver.skipOrPauseForDebug(user, options, 'navigation_mismatch', `@${user} 選擇「${match.step}」後離開了原本的頁面`, {
                            pathIndex,
                            step: match.step,
                            routeBefore: routeBeforeMore,
                            routeAfter: routeAfterOption,
                        });
                    }
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
                    await Core.ReportDriver.visualStep(options, user, `準備點「${confirmText || '提交/完成'}」`, confirmBtn, 320);
                    Core.ThreeNoWatch?.appendNetworkActionMarker?.('report_confirm_click', {
                        user,
                        mode,
                        round: i + 1,
                        confirmText: confirmText || '',
                        phase: 'before_click',
                    });
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
                    const submitReason = !reachedConfirmationGate && pathIndex < path.length
                        ? 'missing_report_step'
                        : 'submit_not_confirmed';
                    const submitMessage = submitReason === 'missing_report_step'
                        ? `檢舉第 ${pathIndex + 1} 步尚未出現`
                        : `@${user} 沒有拿到明確送出成功訊號`;
                    return Core.ReportDriver.skipOrPauseForDebug(user, options, submitReason, submitMessage, {
                        remainingPath: path.slice(pathIndex),
                        visibleOptions: Core.ReportDriver.getVisibleReportOptionTexts(),
                        hadConfirmDialog: !!submitOriginDialog,
                        privateProfile: privateState.private,
                        elapsedMs: Date.now() - reportMenuClickAt,
                        fields: {
                            waitingForStep: submitReason === 'missing_report_step',
                            nextStepIndex: pathIndex,
                            actionCount: pathIndex,
                            dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                            waitingForConfirm: submitReason === 'submit_not_confirmed',
                        },
                    });
                }
                Core.ReportDriver.recordSafetyDiagnostic('confirm_resolve', 'success', {
                    confirmButtons: submitOriginDialog ? submitOriginDialog.querySelectorAll('div[role="button"], button').length : 0,
                }, {
                    elapsedMs: Date.now() - diagnosticStartedAt,
                    retryCount: diagnosticRetryCount,
                });
                Core.ReportDriver.recordDebugTrace('report_success', user, options, {
                    finalSignal: finalSubmitState.signal || 'unknown',
                    totalElapsedMs: Date.now() - reportMenuClickAt,
                }, false);
                Core.ThreeNoWatch?.appendNetworkActionMarker?.('report_success', {
                    user,
                    mode,
                    finalSignal: finalSubmitState.signal || 'unknown',
                    totalElapsedMs: Date.now() - reportMenuClickAt,
                });

                Storage.recordReport();
                Core.clearReportFailureSnapshots?.();
                Core.ReportDriver.recordHistory(user, options);
                if (typeof options.onSuccess === 'function') {
                    options.onSuccess(user);
                }
                Core.ReportDriver.removeCurrent(user);
                Core.ReportDriver.recordSafetyDiagnostic('queue_advance', 'success', {}, {
                    elapsedMs: Date.now() - diagnosticStartedAt,
                    retryCount: diagnosticRetryCount,
                });
                if (window.hegeLog) window.hegeLog(`[只檢舉] @${user} 檢舉流程已記錄完成，剩餘 queue=${Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length}`);
                UI.showToast(`已送出 @${user} 的只檢舉流程`, 2500);
                Core.ReportDriver.scheduleNext(options);
                Core.RuntimeDiagnostics?.end(operationId, 'finish', { reason: 'success', ok: true, complete: true, committed: true, elapsedMs: Date.now() - diagnosticStartedAt });
                return true;
            } catch (err) {
                console.error('[ReportDriver] processNext failed:', err);
                Core.RuntimeDiagnostics?.record('report', 'error', { operationId, reason: 'failure', ok: false, errorName: err?.name || 'Error', errorCode: 'process_failed', elapsedMs: Date.now() - diagnosticStartedAt });
                return Core.ReportDriver.skipOrPauseForDebug(user, options, 'exception', `只檢舉流程發生錯誤：${err.message || err}`, {
                    errorName: err?.name || '',
                    errorMessage: err?.message || String(err),
                    stack: String(err?.stack || '').slice(0, 800),
                });
            } finally {
                if (Core.RuntimeDiagnostics?.enabled?.() && operationId && Core.RuntimeDiagnostics.get().some(entry => entry.operationId === operationId && entry.fields?.terminal === true) === false) {
                    Core.RuntimeDiagnostics.end(operationId, 'terminal', { reason: 'failure', ok: false, elapsedMs: Date.now() - diagnosticStartedAt });
                }
                Core.ReportDriver._running = false;
                Core.ReportDriver._diagnosticOperationId = null;
            }
        },
    },
});
