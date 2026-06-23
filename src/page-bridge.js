(function() {
    'use strict';
    if (window.__hegeThreadsAboutPassiveBridge) {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-status', {
            detail: { ready: true, source: 'page_bridge_existing' },
        }));
        return;
    }
    window.__hegeThreadsAboutPassiveBridge = true;
    const stripPrefix = text => String(text || '').startsWith('for (;;);') ? String(text || '').slice(9) : String(text || '');
    const clean = value => String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\s+/g, ' ').trim();
    const readBoundText = value => {
        const text = clean(value);
        const match = text.match(/"([^"]*)"\s*,\s*"([^"]+)"/);
        return match ? clean(match[1] || match[2]) : text;
    };
    const ABOUT_TEMPLATE_MAX_AGE_MS = 12 * 3600 * 1000;
    const session = {};
    const userIds = new Map();
    const publishedUserIds = new Set();
    let aboutRequestTemplate = null;
    const emitStatus = (detail = {}) => {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-status', {
            detail: {
                ready: detail.ready === true,
                source: 'page_bridge',
                href: location.href,
                hasFbDtsg: !!session.fb_dtsg,
                knownUserIds: userIds.size,
                hasAboutTemplate: !!aboutRequestTemplate,
                aboutTemplateAgeMs: aboutRequestTemplate?.capturedAt ? Date.now() - aboutRequestTemplate.capturedAt : 0,
                ...detail,
            },
        }));
    };
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
    const publishUserId = (uname, uid, source = 'passive_payload') => {
        const key = `${uname}:${uid}`;
        if (publishedUserIds.has(key)) return;
        publishedUserIds.add(key);
        window.dispatchEvent(new CustomEvent('hege:threads-profile-user-id', {
            detail: {
                username: uname,
                userId: uid,
                source,
                capturedAt: Date.now(),
            },
        }));
    };
    const rememberUser = (username, id, source = 'passive_payload') => {
        const uname = clean(username).replace(/^@+/, '').toLowerCase();
        const uid = clean(id).replace(/\D+/g, '');
        if (uname && uid.length >= 4) {
            userIds.set(uname, uid);
            publishUserId(uname, uid, source);
        }
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
            if (foundId) rememberUser(username, foundId, 'document_state');
            const trimmed = text.trim();
            if ((trimmed.startsWith('{') || trimmed.startsWith('[') || text.startsWith('for (;;);')) && text.length < 600000) {
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
        return '';
    };
    const resolveUserId = (username) => {
        const uname = clean(username).replace(/^@+/, '').toLowerCase();
        scanDocumentState(uname);
        if (userIds.has(uname)) return userIds.get(uname);
        const profileMatch = location.pathname.match(/\/(@[A-Za-z0-9_.]+)/);
        if (profileMatch && clean(profileMatch[1]).replace(/^@+/, '').toLowerCase() === uname) {
            const bodyId = findUserIdNearUsername(uname, document.documentElement?.innerHTML || '');
            if (bodyId) rememberUser(uname, bodyId, 'document_state');
        }
        return userIds.get(uname) || '';
    };
    const templateIsFresh = (template) => !!template
        && template.capturedAt
        && Date.now() - template.capturedAt <= ABOUT_TEMPLATE_MAX_AGE_MS;
    const sanitizeAboutTemplate = (transport, rawUrl = '', body = '', headers = {}) => {
        let parsedUrl;
        try { parsedUrl = new URL(String(rawUrl || ''), location.origin); } catch (_) { return null; }
        if (!parsedUrl.href.includes('about_this_profile_async_action')) return null;
        let params = null;
        try { params = new URLSearchParams(String(body || '')); } catch (_) { params = null; }
        let bloksParams = {};
        if (params?.get('params')) {
            try { bloksParams = JSON.parse(params.get('params') || '{}') || {}; } catch (_) { bloksParams = {}; }
        }
        const headerValue = (name) => {
            const lower = String(name || '').toLowerCase();
            if (!headers || typeof headers !== 'object') return '';
            if (typeof headers.get === 'function') return clean(headers.get(name) || headers.get(lower) || '');
            const entry = Object.entries(headers).find(([key]) => String(key || '').toLowerCase() === lower);
            return entry ? clean(entry[1]) : '';
        };
        const template = {
            capturedAt: Date.now(),
            source: `passive_${transport || 'network'}`,
            path: parsedUrl.pathname,
            appid: clean(parsedUrl.searchParams.get('appid') || 'com.bloks.www.text_post_app.about_this_profile_async_action'),
            type: clean(parsedUrl.searchParams.get('type') || 'app'),
            bkv: clean(parsedUrl.searchParams.get('__bkv') || ''),
            friendlyName: headerValue('X-FB-Friendly-Name') || clean(params?.get('fb_api_req_friendly_name') || 'BarcelonaProfileAboutThisProfileAsyncActionQuery'),
            refererType: clean(bloksParams.referer_type || 'TextPostAppProfileOverflow'),
            paramKeys: Object.keys(bloksParams).slice(0, 20),
            formKeys: params ? Array.from(new Set(Array.from(params.keys())))
                .filter(key => !['fb_dtsg', 'lsd', 'jazoest'].includes(key))
                .slice(0, 40) : [],
        };
        aboutRequestTemplate = template;
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-template', { detail: template }));
        return template;
    };
    const seedAboutTemplate = (detail = {}) => {
        const template = detail && typeof detail === 'object' ? detail : {};
        const capturedAt = parseInt(template.capturedAt || '0', 10) || 0;
        if (!template.path || !template.appid || !capturedAt) return;
        if (Date.now() - capturedAt > ABOUT_TEMPLATE_MAX_AGE_MS) return;
        aboutRequestTemplate = {
            capturedAt,
            source: clean(template.source || 'content_cache'),
            path: clean(template.path || '/async/wbloks/fetch/'),
            appid: clean(template.appid || 'com.bloks.www.text_post_app.about_this_profile_async_action'),
            type: clean(template.type || 'app'),
            bkv: clean(template.bkv || ''),
            friendlyName: clean(template.friendlyName || 'BarcelonaProfileAboutThisProfileAsyncActionQuery'),
            refererType: clean(template.refererType || 'TextPostAppProfileOverflow'),
            paramKeys: Array.isArray(template.paramKeys) ? template.paramKeys.slice(0, 20).map(clean).filter(Boolean) : [],
            formKeys: Array.isArray(template.formKeys) ? template.formKeys.slice(0, 40).map(clean).filter(Boolean) : [],
        };
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
    let networkDiscoveryEnabled = false;
    const discoveryMaxChars = 300000;
    const discoveryUrlSummary = (rawUrl = '') => {
        let parsed;
        try { parsed = new URL(String(rawUrl || ''), location.href); } catch (_) { parsed = null; }
        const path = parsed ? parsed.pathname : String(rawUrl || '').split('?')[0].slice(0, 220);
        const queryKeys = parsed ? Array.from(parsed.searchParams.keys()).slice(0, 20) : [];
        const lower = path.toLowerCase();
        const kind = lower.includes('about_this_profile_async_action') ? 'about_profile'
            : (lower.includes('graphql') ? 'graphql'
                : (lower.includes('bulk-route') ? 'bulk_route'
                    : (lower.includes('/wbloks/') || lower.includes('bloks') ? 'wbloks'
                        : (lower.includes('/api/') ? 'api' : (lower.includes('/ajax/') ? 'ajax' : 'other')))));
        return {
            host: parsed ? parsed.host : '',
            path: path.slice(0, 220),
            queryKeys,
            kind,
        };
    };
    const detectActionHints = (...parts) => {
        const text = parts.map(part => String(part || '')).join(' ').toLowerCase();
        const hints = [];
        if (/about_this_profile|about this profile|barcelonaprofileabout/.test(text)) hints.push('about_profile');
        if (/report|xar|abuse|violation|spam|harassment|bully|hate|terror|nudity|scam|fraud|檢舉|举报/.test(text)) hints.push('report');
        if (/unblock|unblock_user|解除封鎖|取消封鎖|取消屏蔽/.test(text)) hints.push('unblock');
        if (/(^|[^a-z])block([^a-z]|$)|block_user|blockuser|blocked_user|封鎖|屏蔽/.test(text)) hints.push('block');
        if (/hide|mute|restrict|隱藏|靜音|限制/.test(text)) hints.push('moderation_other');
        if (/graphql|doc_id|fb_api_req_friendly_name/.test(text)) hints.push('graphql_like');
        if (/wbloks|bloks/.test(text)) hints.push('bloks_like');
        if (/rate.?limit|temporarily blocked|try again later|稍後再試|限制/.test(text)) hints.push('rate_limit');
        if (/reply|replies|回覆|回文/.test(text)) hints.push('replies');
        if (/repost|reposts|reshare|轉發|轉貼/.test(text)) hints.push('reposts');
        if (/thread|post|timeline|feed|串文|貼文/.test(text)) hints.push('profile_content');
        return Array.from(new Set(hints)).slice(0, 12);
    };
    const profileRouteKind = (value = '') => {
        let path = '';
        try { path = new URL(String(value || ''), location.origin).pathname; } catch (_) { path = String(value || '').split('?')[0]; }
        path = decodeURIComponent(path || '').toLowerCase().replace(/\/+$/, '');
        if (/^\/@[a-z0-9_.]+\/replies$/.test(path)) return 'profile_replies';
        if (/^\/@[a-z0-9_.]+\/reposts$/.test(path)) return 'profile_reposts';
        if (/^\/@[a-z0-9_.]+$/.test(path)) return 'profile_base';
        if (path.includes('/post/')) return 'post';
        return 'other';
    };
    const summarizeRouteUrls = (params) => {
        if (!params || typeof params.forEach !== 'function') return { count: 0, kinds: [] };
        const kinds = [];
        params.forEach((value, key) => {
            if (!/^route_urls\[\d+\]$/.test(String(key || ''))) return;
            kinds.push(profileRouteKind(value));
        });
        const counts = kinds.reduce((acc, kind) => {
            acc[kind] = (acc[kind] || 0) + 1;
            return acc;
        }, {});
        return {
            count: kinds.length,
            kinds: Array.from(new Set(kinds)).slice(0, 12),
            base: counts.profile_base || 0,
            replies: counts.profile_replies || 0,
            reposts: counts.profile_reposts || 0,
            posts: counts.post || 0,
            other: counts.other || 0,
        };
    };
    const currentPageKind = () => {
        const path = String(location.pathname || '').toLowerCase().replace(/\/+$/, '');
        if (/^\/@[a-z0-9_.]+\/replies$/.test(path)) return 'profile_replies';
        if (/^\/@[a-z0-9_.]+\/reposts$/.test(path)) return 'profile_reposts';
        if (/^\/@[a-z0-9_.]+$/.test(path)) return 'profile_base';
        if (path.includes('/post/')) return 'post';
        if (path === '/' || path === '') return 'home';
        return path.split('/').filter(Boolean)[0] || 'unknown';
    };
    const parseBodySummary = (body = '') => {
        const text = String(body || '').slice(0, discoveryMaxChars);
        const out = {
            bytes: String(body || '').length,
            keys: [],
            docId: '',
            friendlyName: '',
            hasVariables: false,
            variableKeys: [],
            paramKeys: [],
            routeUrls: { count: 0, kinds: [] },
            hasTargetUserId: false,
            actionHints: [],
        };
        if (!text) return out;
        let params = null;
        try { params = new URLSearchParams(text); } catch (_) { params = null; }
        if (params) {
            out.keys = Array.from(new Set(Array.from(params.keys()))).slice(0, 30);
            out.docId = clean(params.get('doc_id') || params.get('docID') || '');
            out.friendlyName = clean(params.get('fb_api_req_friendly_name') || params.get('fb_api_caller_class') || '');
            out.routeUrls = summarizeRouteUrls(params);
            const variables = params.get('variables');
            out.hasVariables = !!variables;
            if (variables) {
                try {
                    const parsed = JSON.parse(variables);
                    out.variableKeys = Object.keys(parsed || {}).slice(0, 30);
                } catch (_) {}
            }
            const rawParams = params.get('params');
            if (rawParams) {
                try {
                    const parsed = JSON.parse(rawParams);
                    out.paramKeys = Object.keys(parsed || {}).slice(0, 30);
                    out.hasTargetUserId = Object.prototype.hasOwnProperty.call(parsed || {}, 'target_user_id');
                } catch (_) {}
            }
        }
        if (!out.docId) {
            const docMatch = text.match(/(?:^|[&"'])doc_id(?:=|["']?\s*:\s*["'])(\d{5,})/);
            if (docMatch) out.docId = docMatch[1];
        }
        if (!out.friendlyName) {
            const friendlyMatch = text.match(/(?:fb_api_req_friendly_name|X-FB-Friendly-Name)(?:=|["']?\s*:\s*["'])([^&"'\s]+)/);
            if (friendlyMatch) out.friendlyName = clean(decodeURIComponent(friendlyMatch[1] || ''));
        }
        out.actionHints = detectActionHints(out.friendlyName, out.keys.join(' '), out.variableKeys.join(' '), out.paramKeys.join(' '), text);
        return out;
    };
    const extractAllowedScalars = (stripped = '') => {
        const allowed = [
            'initial_thread_count',
            'max_thread_count',
            'owner_posts_count_for_crawlers',
            'is_reply',
            'is_self_profile',
            'should_show_related_profiles',
            'has_more',
            'has_next_page',
            'is_private',
            'text_post_app_is_private',
        ];
        const scalars = {};
        for (const key of allowed) {
            const found = [];
            const re = new RegExp(`"${key}"\\s*:\\s*(true|false|null|-?\\d+(?:\\.\\d+)?)`, 'g');
            let match;
            while ((match = re.exec(stripped)) && found.length < 12) {
                const raw = match[1];
                const value = raw === 'true' ? true : (raw === 'false' ? false : (raw === 'null' ? null : Number(raw)));
                if (!found.some(item => item === value)) found.push(value);
            }
            if (found.length) scalars[key] = found;
        }
        const presence = {};
        for (const key of ['injected_media_ids', 'thread_items', 'edges', 'nodes']) {
            presence[key] = new RegExp(`"${key}"\\s*:`).test(stripped);
        }
        return { scalars, presence };
    };
    const responseSummary = (body = '', status = 0, contentType = '') => {
        const source = String(body || '');
        const sample = source.slice(0, discoveryMaxChars);
        const stripped = stripPrefix(sample);
        const typenames = Array.from(new Set(Array.from(stripped.matchAll(/"__typename"\s*:\s*"([^"]+)"/g)).map(match => match[1]))).slice(0, 20);
        const keys = Array.from(new Set(Array.from(stripped.matchAll(/"([A-Za-z_][A-Za-z0-9_]{2,60})"\s*:/g)).map(match => match[1])))
            .filter(key => /thread|reply|repost|profile|user|timeline|media|page|edges|nodes|items|is_|has_|count|viewer|data|errors/i.test(key))
            .slice(0, 30);
        const scalarSummary = extractAllowedScalars(stripped);
        return {
            status,
            bytes: source.length,
            contentType: String(contentType || '').split(';')[0].slice(0, 80),
            prefix: source.startsWith('for (;;);') ? 'for_prefix' : '',
            typenames,
            keys,
            scalarSummary,
            flags: {
                hasErrors: /"errors"\s*:/.test(stripped),
                hasThreadItems: /thread_items|threadItems|text_post_app_thread/i.test(stripped),
                hasRepliesSignal: /reply|replies|profile_threads_reply/i.test(stripped),
                hasRepostsSignal: /repost|reposts|reshare/i.test(stripped),
                hasEmptySignal: /empty|no_posts|No posts|尚無|沒有/i.test(stripped),
                hasPrivateSignal: /private|不公開|私人|is_private/i.test(stripped),
                hasBlockSignal: /blocked|block_user|unblock|封鎖|解除封鎖|屏蔽/i.test(stripped),
                hasReportSignal: /report|reported|xar|abuse|violation|檢舉|举报|感謝|thanks/i.test(stripped),
                hasRateLimitSignal: /rate.?limit|temporarily blocked|try again later|稍後再試|限制/i.test(stripped),
            },
            actionHints: detectActionHints(stripped.slice(0, 50000), typenames.join(' '), keys.join(' ')),
        };
    };
    const emitNetworkDiscovery = (transport, method, rawUrl, body, response, responseBody = '') => {
        if (!networkDiscoveryEnabled) return;
        const url = discoveryUrlSummary(rawUrl);
        if (!/graphql|bulk_route|api|ajax|about_profile|wbloks/.test(url.kind)) return;
        const request = parseBodySummary(body);
        const responseInfo = responseSummary(responseBody, response?.status || 0, response?.headers?.get?.('content-type') || '');
        const actionHints = Array.from(new Set([
            ...detectActionHints(url.path, url.queryKeys.join(' '), request.friendlyName, request.keys.join(' '), request.variableKeys.join(' '), request.paramKeys.join(' ')),
            ...(request.actionHints || []),
            ...(responseInfo.actionHints || []),
        ])).slice(0, 16);
        const workflow = actionHints.includes('report') ? 'report'
            : (actionHints.includes('unblock') ? 'unblock'
                : (actionHints.includes('block') ? 'block'
                    : (actionHints.includes('about_profile') ? 'about_profile'
                        : ((actionHints.includes('replies') || actionHints.includes('reposts') || actionHints.includes('profile_content')) ? 'profile_content' : 'unknown'))));
        window.dispatchEvent(new CustomEvent('hege:threads-network-discovery', {
            detail: {
                ts: Date.now(),
                hrefKind: currentPageKind(),
                transport,
                method: String(method || 'GET').toUpperCase().slice(0, 12),
                url,
                workflow,
                actionHints,
                request,
                response: responseInfo,
            },
        }));
    };
    const shouldInspectNetworkUrl = (rawUrl = '') => {
        if (!networkDiscoveryEnabled) return false;
        return /graphql|bulk_route|api|ajax|about_profile|wbloks/.test(discoveryUrlSummary(rawUrl).kind);
    };
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
            joined: clean((joined || {}).value || ''),
            location: clean((location || {}).value || ''),
            isVerified: !!verified,
        };
    };
    const publish = (body) => {
        rememberText(body);
        const data = parseAbout(body);
        if (data && (data.username || data.joined || data.location)) {
            window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: data }));
        }
    };
    const emitActiveResponse = (requestId, detail) => {
        window.dispatchEvent(new CustomEvent('hege:threads-about-profile-fetch-response', {
            detail: { requestId, bridgeReady: true, ...detail },
        }));
    };
    const fetchActiveAbout = async (requestId, username, seededTargetUserId = '') => {
        try {
            const normalized = clean(username).replace(/^@+/, '').toLowerCase();
            const targetUserId = clean(seededTargetUserId).replace(/\D+/g, '') || resolveUserId(normalized);
            const template = templateIsFresh(aboutRequestTemplate) ? aboutRequestTemplate : null;
            const bkv = findBkv() || template?.bkv || '';
            if (!requestId || !normalized) return;
            if (!template) return emitActiveResponse(requestId, { ok: false, error: 'missing_about_template' });
            if (!targetUserId) return emitActiveResponse(requestId, { ok: false, error: 'missing_user_id' });
            if (!session.fb_dtsg) return emitActiveResponse(requestId, { ok: false, error: 'missing_fb_dtsg' });
            if (!bkv) return emitActiveResponse(requestId, { ok: false, error: 'missing_bkv' });
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
                referer_type: template.refererType || 'TextPostAppProfileOverflow',
                target_user_id: targetUserId,
            }));
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'X-FB-Friendly-Name': template.friendlyName || 'BarcelonaProfileAboutThisProfileAsyncActionQuery',
            };
            if (session.lsd) headers['X-FB-LSD'] = session.lsd;
            const url = `${template.path || '/async/wbloks/fetch/'}?appid=${encodeURIComponent(template.appid)}&type=${encodeURIComponent(template.type || 'app')}&__bkv=${encodeURIComponent(bkv)}`;
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: form.toString(),
            });
            const body = await response.text();
            rememberText(body);
            if (response.status === 429) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'rate_limited' });
            if (!response.ok) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'http_' + response.status });
            const data = parseAbout(body);
            if (data && (data.username || data.joined || data.location)) {
                if (!data.username) data.username = normalized;
                window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: { ...data, source: 'accelerated_about_api' } }));
                return emitActiveResponse(requestId, { ok: true, status: response.status, data });
            }
            return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'empty_about_payload' });
        } catch (error) {
            return emitActiveResponse(requestId, { ok: false, error: String(error?.message || error || 'active_about_error') });
        }
    };
    window.addEventListener('hege:threads-about-profile-bridge-ping', () => {
        scanDocumentState();
        emitStatus({
            ready: true,
            hasFetch: typeof window.fetch === 'function',
            hasXhr: typeof XMLHttpRequest !== 'undefined',
        });
    });
    window.addEventListener('hege:threads-about-profile-fetch-request', (event) => {
        const detail = event?.detail || {};
        const requestId = clean(detail.requestId || '');
        const username = clean(detail.username || '');
        const targetUserId = clean(detail.targetUserId || '');
        if (!requestId || !username) return;
        fetchActiveAbout(requestId, username, targetUserId);
    });
    window.addEventListener('hege:threads-profile-user-id-seed', (event) => {
        const items = Array.isArray(event?.detail?.items) ? event.detail.items : [];
        items.forEach(item => rememberUser(item?.username || '', item?.userId || '', 'content_cache_seed'));
    });
    window.addEventListener('hege:threads-about-profile-template-seed', (event) => {
        seedAboutTemplate(event?.detail || {});
    });
    window.addEventListener('hege:threads-network-discovery-toggle', (event) => {
        networkDiscoveryEnabled = event?.detail?.enabled === true;
    });
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = async function(...args) {
            const url = String(args[0]?.url || args[0] || '');
            const method = String(args[0]?.method || args[1]?.method || 'GET');
            const body = String(args[0]?.body || args[1]?.body || '');
            const headers = args[0]?.headers || args[1]?.headers || {};
            rememberText(body);
            const response = await originalFetch.apply(this, args);
            if (url.includes('about_this_profile_async_action')) {
                sanitizeAboutTemplate('fetch', url, body, headers);
                response.clone().text().then(publish).catch(() => {});
            }
            if (shouldInspectNetworkUrl(url)) {
                response.clone().text()
                    .then(text => {
                        rememberText(text);
                        emitNetworkDiscovery('fetch', method, url, body, response, text);
                    })
                    .catch(() => emitNetworkDiscovery('fetch', method, url, body, response, ''));
            }
            return response;
        };
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__hegeAboutUrl = String(url || '');
        this.__hegeDiscoveryMethod = String(method || 'GET');
        this.__hegeRequestHeaders = {};
        return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this.__hegeRequestHeaders = this.__hegeRequestHeaders || {};
        this.__hegeRequestHeaders[String(name || '')] = String(value || '');
        return originalSetRequestHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function(...args) {
        const requestBody = String(args[0] || '');
        rememberText(requestBody);
        if (this.__hegeAboutUrl && this.__hegeAboutUrl.includes('about_this_profile_async_action')) {
            sanitizeAboutTemplate('xhr', this.__hegeAboutUrl, requestBody, this.__hegeRequestHeaders || {});
            this.addEventListener('load', function() {
                let responseText = '';
                try { responseText = this.responseText || ''; } catch (_) {}
                publish(responseText);
            });
        }
        if (shouldInspectNetworkUrl(this.__hegeAboutUrl || '')) {
            this.addEventListener('load', function() {
                let responseText = '';
                try { responseText = this.responseText || ''; } catch (_) {}
                rememberText(responseText);
                emitNetworkDiscovery('xhr', this.__hegeDiscoveryMethod || 'GET', this.__hegeAboutUrl || '', requestBody, {
                    status: this.status || 0,
                    headers: { get: () => this.getResponseHeader?.('content-type') || '' },
                }, responseText);
            });
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
