(function() {
    'use strict';
    if (window.__hegeThreadsAboutPassiveBridge) {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-status', {
            detail: { ready: true, source: 'page_bridge_existing' },
        }));
        return;
    }
    window.__hegeThreadsAboutPassiveBridge = true;
    const DEFAULT_ABOUT_PROFILE_BKV = '22713cafbb647b89c4e9c1acdea97d89c8c2046e2f4b18729760e9b1ae0724f7';

    const emitStatus = (detail = {}) => {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-status', {
            detail: {
                ready: detail.ready === true,
                source: 'page_bridge',
                href: location.href,
                ...detail,
            },
        }));
    };
    const stripPrefix = text => String(text || '').startsWith('for (;;);') ? String(text || '').slice(9) : String(text || '');
    const clean = value => String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\s+/g, ' ').trim();
    const readBoundText = value => {
        const text = clean(value);
        const match = text.match(/"([^"]*)"\s*,\s*"([^"]+)"/);
        return match ? clean(match[1] || match[2]) : text;
    };
    const walk = (node, state) => {
        if (!node || typeof node !== 'object') return;
        const textNode = node['bk.components.Text'];
        if (textNode && typeof textNode === 'object') {
            const labelish = clean(textNode.text || readBoundText(textNode.on_bind || ''));
            const style = clean(textNode.text_style || '');
            if (style === 'semibold' && labelish) state.lastLabel = labelish;
            else if (style === 'normal' && labelish && state.lastLabel) {
                state.pairs.push({ label: state.lastLabel, value: labelish });
                state.lastLabel = '';
            }
        }
        const rich = node['bk.components.RichText'];
        if (rich && Array.isArray(rich.children)) {
            const joined = rich.children.map(child => clean(child?.['bk.components.TextSpan']?.text || '')).join('').trim();
            const profile = joined.match(/^(.+?)\s*[（(]@([\w.]+)[)）]?/) || joined.match(/@([\w.]+)/);
            if (profile) {
                if (profile[2]) {
                    state.displayName = clean(profile[1]);
                    state.username = clean(profile[2]);
                } else {
                    state.username = clean(profile[1]);
                }
            }
        }
        Object.values(node).forEach(value => {
            if (Array.isArray(value)) value.forEach(child => walk(child, state));
            else if (value && typeof value === 'object') walk(value, state);
        });
    };
    const labelIn = (label, values) => values.some(value => clean(label).toLowerCase() === value.toLowerCase());
    const parseAbout = text => {
        let parsed;
        try { parsed = JSON.parse(stripPrefix(text)); } catch (_) { return null; }
        const state = { pairs: [], lastLabel: '', username: '', displayName: '' };
        walk(parsed, state);
        if (!state.pairs.length && !state.username) return null;
        const joinedLabels = ['Joined', '已加入', '參加日', '参加日', '가입일', '가입 날짜'];
        const locationLabels = ['Based in', '所在地點', '所在地', '位置', '거주지'];
        const verifiedLabels = ['Verified by Meta', 'Meta 驗證', 'Meta 验证', 'Meta認証', 'Meta 인증'];
        const relevant = state.pairs.filter(pair => !labelIn(pair.label, ['Name', '名稱', '名称', '名前', '이름', 'Former usernames', 'Previous usernames', '先前的使用者名稱', '先前的用戶名稱', '以前のユーザーネーム', '이전 사용자 이름']));
        const joined = relevant.find(pair => labelIn(pair.label, joinedLabels));
        const location = relevant.find(pair => labelIn(pair.label, locationLabels));
        const verified = relevant.find(pair => labelIn(pair.label, verifiedLabels));
        return {
            username: state.username,
            displayName: state.displayName,
            joined: clean((joined || relevant[0] || {}).value || ''),
            location: clean((location || relevant[1] || {}).value || ''),
            isVerified: !!verified,
        };
    };
    const session = {};
    const userIds = new Map();
    const rememberToken = (key, value) => {
        const cleanValue = clean(value);
        if (key && cleanValue && cleanValue !== 'null' && cleanValue !== 'undefined') session[key] = cleanValue;
    };
    const rememberText = (text) => {
        const source = String(text || '');
        if (!source) return;
        [
            ['fb_dtsg', /"fb_dtsg"\s*:\s*"([^"]+)"/],
            ['fb_dtsg', /"DTSGInitialData"[\s\S]{0,800}?"token"\s*:\s*"([^"]+)"/],
            ['fb_dtsg', /\["DTSGInitData",\[\],\{"token":"([^"]+)"/],
            ['lsd', /"lsd"\s*:\s*"([^"]+)"/],
            ['lsd', /"LSD"[\s\S]{0,500}?"token"\s*:\s*"([^"]+)"/],
            ['jazoest', /(?:^|[?&"'\s])jazoest(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__user', /(?:^|[?&"'\s])__user(?:=|["']?\s*:\s*["'])(\d+)/],
            ['__user', /"USER_ID"\s*:\s*"(\d{4,})"/],
            ['__user', /"viewer_id"\s*:\s*"?(\d{4,})"?/],
            ['__hs', /(?:^|[?&"'\s])__hs(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__hsi', /(?:^|[?&"'\s])__hsi(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__comet_req', /(?:^|[?&"'\s])__comet_req(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__ccg', /(?:^|[?&"'\s])__ccg(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__a', /(?:^|[?&"'\s])__a(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__d', /(?:^|[?&"'\s])__d(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__spin_r', /(?:^|[?&"'\s])__spin_r(?:=|["']?\s*:\s*["'])(\d+)/],
            ['__spin_b', /(?:^|[?&"'\s])__spin_b(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__spin_t', /(?:^|[?&"'\s])__spin_t(?:=|["']?\s*:\s*["'])(\d+)/],
            ['__dyn', /(?:^|[?&"'\s])__dyn(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__csr', /(?:^|[?&"'\s])__csr(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
            ['__rev', /(?:^|[?&"'\s])__rev(?:=|["']?\s*:\s*["'])(\d+)/],
            ['__s', /(?:^|[?&"'\s])__s(?:=|["']?\s*:\s*["'])([^&"'\s]+)["']?/],
        ].forEach(([key, pattern]) => {
            const match = source.match(pattern);
            if (match) rememberToken(key, decodeURIComponent(match[1] || ''));
        });
        const rawForm = source.includes('%') ? source.replace(/\+/g, ' ') : source;
        ['fb_dtsg', 'lsd', 'jazoest', '__user', '__a', '__hs', '__hsi', '__spin_r', '__spin_b', '__spin_t', '__dyn', '__csr', '__rev', '__s', '__comet_req', '__ccg', '__d'].forEach(key => {
            const match = rawForm.match(new RegExp('(?:^|&)' + key.replace(/_/g, '\\_') + '=([^&]+)'));
            if (match) rememberToken(key, decodeURIComponent(match[1] || ''));
        });
    };
    const rememberUser = (username, id) => {
        const uname = clean(username).replace(/^@+/, '').toLowerCase();
        const uid = clean(id).replace(/\D+/g, '');
        if (uname && uid.length >= 4) userIds.set(uname, uid);
    };
    const collectUsers = (node, depth = 0) => {
        if (!node || depth > 12) return;
        if (Array.isArray(node)) {
            node.forEach(child => collectUsers(child, depth + 1));
            return;
        }
        if (typeof node !== 'object') return;
        const username = node.username || node.user_name || node.profile_username || node.handle || node.display_username;
        const id = node.id || node.pk || node.user_id || node.profile_user_id || node.strong_id__;
        if (username && id) rememberUser(username, id);
        Object.values(node).forEach(value => collectUsers(value, depth + 1));
    };
    const findUserIdNearUsername = (username, text) => {
        const uname = clean(username).replace(/^@+/, '').toLowerCase();
        if (!uname || !text) return '';
        const lower = String(text).toLowerCase();
        const idx = lower.indexOf(uname);
        if (idx < 0) return '';
        const slice = String(text).slice(Math.max(0, idx - 1800), idx + 2400);
        const patterns = [
            /"(?:id|pk|user_id|profile_user_id|strong_id__)"\s*:\s*"?([0-9]{4,})"?/g,
            /(?:id|pk|user_id|profile_user_id)=([0-9]{4,})/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(slice))) {
                if (match[1]) return match[1];
            }
        }
        return '';
    };
    const scanDocumentState = (username = '') => {
        Array.from(document.querySelectorAll('script')).forEach(script => {
            const text = script.textContent || script.src || '';
            if (!text) return;
            rememberText(text);
            const foundId = findUserIdNearUsername(username, text);
            if (foundId) rememberUser(username, foundId);
            if ((text.trim().startsWith('{') || text.trim().startsWith('[') || text.startsWith('for (;;);')) && text.length < 600000) {
                try { collectUsers(JSON.parse(stripPrefix(text))); } catch (_) {}
            }
        });
    };
    const findBkv = () => {
        const sources = [
            location.href,
            ...Array.from(document.querySelectorAll('script[src], link[href]')).map(el => el.src || el.href || ''),
            ...Array.from(document.querySelectorAll('script')).slice(0, 25).map(el => el.textContent || ''),
        ];
        for (const source of sources) {
            const text = String(source || '');
            const byUrl = text.match(/[?&]__bkv=([^&"'\s]+)/);
            if (byUrl) return clean(decodeURIComponent(byUrl[1]));
            const byJson = text.match(/"__bkv"\s*:\s*"([^"]+)"/);
            if (byJson) return clean(byJson[1]);
        }
        return DEFAULT_ABOUT_PROFILE_BKV;
    };
    const resolveUserId = (username) => {
        const uname = clean(username).replace(/^@+/, '').toLowerCase();
        scanDocumentState(uname);
        if (userIds.has(uname)) return userIds.get(uname);
        const profileMatch = location.pathname.match(new RegExp('/(@[A-Za-z0-9_.]+)'));
        if (profileMatch && clean(profileMatch[1]).replace(/^@+/, '').toLowerCase() === uname) {
            const bodyId = findUserIdNearUsername(uname, document.documentElement?.innerHTML || '');
            if (bodyId) rememberUser(uname, bodyId);
        }
        return userIds.get(uname) || '';
    };
    const emitActiveResponse = (requestId, detail) => {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-fetch-response', {
            detail: { requestId, ...detail },
        }));
    };
    const fetchActiveAbout = async (requestId, username) => {
        try {
            const targetUserId = resolveUserId(username);
            const bkv = findBkv();
            if (!targetUserId) return emitActiveResponse(requestId, { ok: false, error: 'missing_user_id', bridgeReady: true });
            if (!session.fb_dtsg) return emitActiveResponse(requestId, { ok: false, error: 'missing_fb_dtsg', bridgeReady: true });
            const form = new URLSearchParams();
            form.set('av', session.__user || '0');
            form.set('__user', session.__user || '0');
            form.set('__a', session.__a || '1');
            form.set('__req', 'hege_about');
            form.set('__hs', session.__hs || '');
            form.set('dpr', String(window.devicePixelRatio || 1));
            form.set('__ccg', session.__ccg || 'EXCELLENT');
            form.set('__comet_req', session.__comet_req || '29');
            form.set('__d', session.__d || 'www');
            ['__rev', '__s', '__hsi', '__dyn', '__csr', '__spin_r', '__spin_b', '__spin_t', 'jazoest', 'lsd'].forEach(key => {
                if (session[key]) form.set(key, session[key]);
            });
            form.set('fb_dtsg', session.fb_dtsg);
            form.set('params', JSON.stringify({
                atpTriggerSessionID: crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                referer_type: 'TextPostAppProfileOverflow',
                target_user_id: targetUserId,
            }));
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-FB-Friendly-Name': 'BarcelonaProfileAboutThisProfileAsyncActionQuery',
            };
            if (session.lsd) headers['X-FB-LSD'] = session.lsd;
            const url = '/async/wbloks/fetch/?appid=com.bloks.www.text_post_app.about_this_profile_async_action&type=app&__bkv=' + encodeURIComponent(bkv);
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: form.toString(),
            });
            const body = await response.text();
            rememberText(body);
            if (response.status === 429) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'rate_limited', bridgeReady: true });
            if (!response.ok) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'http_' + response.status, bridgeReady: true });
            const data = parseAbout(body);
            if (data && (data.username || data.joined || data.location)) {
                if (!data.username) data.username = clean(username).replace(/^@+/, '');
                window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: { ...data, source: 'accelerated_about_api' } }));
                return emitActiveResponse(requestId, { ok: true, status: response.status, data, bridgeReady: true });
            }
            return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'empty_about_payload', bridgeReady: true });
        } catch (error) {
            return emitActiveResponse(requestId, { ok: false, error: String(error?.message || error || 'active_about_error'), bridgeReady: true });
        }
    };
    const publish = (body) => {
        rememberText(body);
        const data = parseAbout(body);
        if (data && (data.username || data.joined || data.location)) {
            window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: data }));
        }
    };
    window.addEventListener('hege:threads-about-profile-fetch-request', (event) => {
        const detail = event?.detail || {};
        const requestId = clean(detail.requestId || '');
        const username = clean(detail.username || '');
        if (!requestId || !username) return;
        fetchActiveAbout(requestId, username);
    });
    window.addEventListener('hege:threads-about-profile-bridge-ping', () => {
        emitStatus({
            ready: true,
            hasFetch: typeof window.fetch === 'function',
            hasXhr: typeof XMLHttpRequest !== 'undefined',
            sessionKeys: Object.keys(session).filter(key => key !== 'fb_dtsg').join(','),
            hasFbDtsg: !!session.fb_dtsg,
            knownUserIds: userIds.size,
            hasDefaultBkv: !!DEFAULT_ABOUT_PROFILE_BKV,
        });
    });
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = async function(...args) {
            const url = String(args[0]?.url || args[0] || '');
            rememberText(String(args[1]?.body || ''));
            const response = await originalFetch.apply(this, args);
            if (url.includes('about_this_profile_async_action')) {
                response.clone().text().then(publish).catch(() => {});
            } else if (/graphql|bulk-route|api/i.test(url)) {
                response.clone().text().then(body => {
                    rememberText(body);
                    if (body && body.length < 600000) {
                        try { collectUsers(JSON.parse(stripPrefix(body))); } catch (_) {}
                    }
                }).catch(() => {});
            }
            return response;
        };
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__hegeAboutUrl = String(url || '');
        return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
        rememberText(String(args[0] || ''));
        if (this.__hegeAboutUrl && this.__hegeAboutUrl.includes('about_this_profile_async_action')) {
            this.addEventListener('load', function() { publish(this.responseText || ''); });
        }
        return originalSend.apply(this, args);
    };
    scanDocumentState();
    emitStatus({
        ready: true,
        hasFetch: typeof originalFetch === 'function',
        hasXhr: typeof originalOpen === 'function' && typeof originalSend === 'function',
    });
})();
