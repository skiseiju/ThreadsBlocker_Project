/**
 * 留友封 — GraphQL Fetch Interceptor (MAIN World)
 *
 * 此腳本在 Chrome Extension 中以 world: "MAIN" + document_start 執行，
 * 直接跑在頁面 context，可攔截 Threads 原生的 fetch/XHR 請求。
 *
 * 攔截到 likers 相關的 GraphQL 回應後，將 doc_id 存入 localStorage，
 * 供主腳本 (content.js) 的 fetchMassLikes 使用。
 */
(function() {
    'use strict';

    var _K = 'hege_graphql_likers_doc_id';
    var _V = 'hege_graphql_likers_vars';
    var _R = 'hege_graphql_likers_resp_key';
    var _D = 'hege_graphql_diag';
    var _LK = [
        'xdt_api__v1__media__likers',
        'xdt_media_likers',
        'likers',
        'xdt_api__v1__media__likers_connection',
        'media_likers',
        'xdt_likers',
        'edge_liked_by'
    ];

    function proc(json, docId, vs) {
        if (!json || !json.data) return;
        var dk = Object.keys(json.data);
        try {
            var dg = JSON.parse(localStorage.getItem(_D) || '[]');
            var hu = false;
            for (var i = 0; i < dk.length; i++) {
                var n = json.data[dk[i]];
                if (n && (Array.isArray(n.users) || Array.isArray(n.edges) || n.user_count !== undefined)) { hu = true; break; }
            }
            dg.push({ ts: new Date().toISOString(), doc_id: docId, vars: vs.substring(0, 200), keys: dk, hasUsers: hu });
            if (dg.length > 20) dg.splice(0, dg.length - 20);
            localStorage.setItem(_D, JSON.stringify(dg));
        } catch(e) {}
        console.log('[留友封 🔍] GraphQL | doc_id:' + docId + ' | keys:[' + dk.join(',') + ']');

        for (var j = 0; j < _LK.length; j++) { if (json.data[_LK[j]]) { sv(docId, _LK[j], vs); return; } }
        for (var k = 0; k < dk.length; k++) { if (dk[k].toLowerCase().indexOf('liker') !== -1) { sv(docId, dk[k], vs); return; } }
        for (var m = 0; m < dk.length; m++) {
            var nd = json.data[dk[m]];
            if (nd && typeof nd === 'object' && Array.isArray(nd.users) && nd.users.length > 0 && nd.users[0] && nd.users[0].username) {
                console.log('[留友封 🎯] 結構偵測: data.' + dk[m]); sv(docId, dk[m], vs); return;
            }
        }
    }

    function sv(docId, key, vs) {
        if (localStorage.getItem(_K) !== docId) {
            localStorage.setItem(_K, docId);
            localStorage.setItem(_R, key);
            try { localStorage.setItem(_V, vs); } catch(e) {}
            console.log('[留友封 🎯] 捕獲 likers doc_id:' + docId + ' (data.' + key + ')');
            console.log('[留友封 🎯] vars:' + vs);
        }
    }

    // Monkey-patch fetch
    var _oF = window.fetch;
    window.fetch = function() {
        var a = arguments;
        try {
            var r = a[0], o = a[1] || {};
            var u = (typeof r === 'string') ? r : (r && r.url) || '';
            if (u.indexOf('/api/graphql') !== -1 && (o.method || '').toUpperCase() === 'POST' && o.body) {
                var bs = typeof o.body === 'string' ? o.body : o.body.toString();
                var p = new URLSearchParams(bs);
                var di = p.get('doc_id');
                var vs = p.get('variables') || '';
                if (di && vs) {
                    return _oF.apply(window, a).then(function(resp) {
                        var c = resp.clone();
                        c.json().then(function(j) { proc(j, di, vs); }).catch(function() {});
                        return resp;
                    });
                }
            }
        } catch(e) {}
        return _oF.apply(window, a);
    };

    // Monkey-patch XMLHttpRequest
    var _oO = XMLHttpRequest.prototype.open, _oS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) { this._hu = u; this._hm = m; return _oO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(b) {
        try {
            if (this._hu && this._hu.indexOf('/api/graphql') !== -1 && (this._hm || '').toUpperCase() === 'POST' && b) {
                var bs = typeof b === 'string' ? b : b.toString();
                var p = new URLSearchParams(bs);
                var di = p.get('doc_id');
                var vs = p.get('variables') || '';
                if (di && vs) {
                    this.addEventListener('load', function() { try { proc(JSON.parse(this.responseText), di, vs); } catch(e) {} });
                }
            }
        } catch(e) {}
        return _oS.apply(this, arguments);
    };

    console.log('[留友封] MAIN World Interceptor Installed ✅ (document_start)');
})();
