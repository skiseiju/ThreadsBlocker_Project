// Shared, fail-closed locator for Threads "More" controls.
// Block and report flows must use this module so their DOM assumptions cannot drift.
export const MoreLocator = {
    LABEL_RE: /更多|More|もっと見る|더 보기|เพิ่มเติม|Lainnya|Más|Plus|Mehr|Altro|Mais|Ещё|Więcej|Diğer|Thêm|المزيد|और|Meer|Higit pa/i,
    SEARCH_RE: /(^|\/)search(?:\/|$)/i,
    PRIVATE_RE: /私人帳號|私人账号|此帳號為私人帳號|此账号为私人账号|This account is private|Private account|This profile is private/i,

    textOf(el) {
        if (!el) return '';
        const attrs = [
            el.getAttribute?.('aria-label') || '',
            el.getAttribute?.('title') || '',
            el.getAttribute?.('alt') || '',
        ];
        const descendants = Array.from(el.querySelectorAll?.('[aria-label], [title], img[alt], svg[aria-label]') || [])
            .map(node => [
                node.getAttribute?.('aria-label') || '',
                node.getAttribute?.('title') || '',
                node.getAttribute?.('alt') || '',
            ].join(' ')).join(' ');
        return [...attrs, descendants, el.innerText || '', el.textContent || '']
            .join(' ').replace(/\s+/g, ' ').trim();
    },

    explicitAriaLabel(el) {
        if (!el) return '';
        const direct = el.getAttribute?.('aria-label') || '';
        if (this.LABEL_RE.test(direct)) return direct;
        const svg = el.matches?.('svg[aria-label]') ? el : el.querySelector?.('svg[aria-label]');
        const nested = svg?.getAttribute?.('aria-label') || '';
        return this.LABEL_RE.test(nested) ? nested : '';
    },

    clickableAncestor(el) {
        let node = el;
        for (let depth = 0; node && depth < 8; depth++) {
            if (node.matches?.('button, div[role="button"], [tabindex="0"]')) return node;
            node = node.parentElement;
        }
        return el?.closest?.('button, div[role="button"], [tabindex="0"]') || el;
    },

    routeType(locationLike = (typeof location !== 'undefined' ? location : {})) {
        const pathname = String(locationLike?.pathname || '');
        const search = String(locationLike?.search || '');
        if (this.SEARCH_RE.test(pathname) || /(?:^|[?&])serp_type=tags(?:&|$)/i.test(search)) return 'search_tags';
        if (/\/tags(?:\/|$)/i.test(pathname)) return 'tags';
        if (/\/post\//i.test(pathname)) return 'post';
        if (/\/@[^/]+(?:\/|$)/.test(pathname)) return 'profile';
        return 'other';
    },

    isUnsafeRoute(locationLike) {
        const type = this.routeType(locationLike);
        return type === 'search_tags' || type === 'tags';
    },

    isVisible(el) {
        if (!el || !el.isConnected) return false;
        if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return true;
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect?.();
        return !rect || (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth);
    },

    isMoreShape(el) {
        const svg = el?.matches?.('svg') ? el : el?.querySelector?.('svg[aria-label], svg');
        if (!svg) return false;
        const circles = svg.querySelectorAll?.('circle').length || 0;
        const paths = svg.querySelectorAll?.('path').length || 0;
        return (circles === 3 && paths === 0) || (circles >= 1 && paths >= 3);
    },

    isHegeElement(el) {
        return !!el?.closest?.('#hege-panel, #hege-worker-cover, #hege-three-no-worker-overlay, .hege-manager-overlay');
    },

    isLinkCandidate(el) {
        return !!el?.closest?.('a, [role="link"]');
    },

    hasPostScope(el, root = null) {
        const post = el?.closest?.('article, [role="article"], [data-pressable-container], [role="listitem"], [data-hege-more-scope="post"]');
        if (!post) return false;
        if (root && !(typeof document !== 'undefined' && root === document) && !root.contains(post) && !post.contains(root)) return false;
        return !!post.querySelector?.('a[href*="/post/"]') || !!post.closest?.('a[href*="/post/"]') || post.getAttribute?.('data-hege-more-scope') === 'post';
    },

    hasRowScope(el, root = null) {
        if (!root || (typeof document !== 'undefined' && root === document) || !root.contains?.(el)) return false;
        const marked = root.matches?.('[role="listitem"], [data-pressable-container], [data-hege-more-scope="row"]');
        const userLink = !!root.querySelector?.('a[href^="/@"]');
        return !!(marked || userLink);
    },

    hasProfileScope(el, root = null, trustedRoot = false) {
        const forbiddenPost = el?.closest?.('article, [role="article"], [data-pressable-container], [role="listitem"]');
        if (forbiddenPost) return false;
        if (trustedRoot && root && (typeof document === 'undefined' || root !== document) && root.contains?.(el)) return true;
        const marked = this.getProfileScope(el);
        if (!marked) return false;
        if (root && !(typeof document !== 'undefined' && root === document) && !root.contains?.(marked)) return false;
        return true;
    },

    getProfileScope(root) {
        if (!root) return null;
        if (typeof document !== 'undefined' && root === document) return null;
        return root;
    },

    detectPrivateProfileState(root) {
        const scope = this.getProfileScope(root);
        if (!scope) return { known: false, private: false };
        const explicit = scope.matches?.('[data-private="true"], [data-private-account="true"]') || false;
        let text = this.textOf(scope);
        // Native menus/dialogs are overlays, not profile state. Remove them from
        // the bounded profile copy before checking the positive private signal.
        try {
            const copy = scope.cloneNode?.(true);
            copy?.querySelectorAll?.('[role="dialog"], [role="menu"]').forEach((node) => node.remove());
            if (copy) text = this.textOf(copy);
        } catch (_) { /* fail closed to the original bounded scope */ }
        return { known: true, private: explicit || this.PRIVATE_RE.test(text), scope };
    },

    candidateInfo(el, { mode = 'profile', root = null, trustedRoot = false } = {}) {
        if (!el || this.isHegeElement(el) || !this.isVisible(el)) return null;
        if (this.isUnsafeRoute()) return null;
        if (el.closest?.('[role="dialog"], [role="menu"]')) return null;
        if (this.isLinkCandidate(el)) return null;
        const explicit = this.explicitAriaLabel(el);
        const shape = this.isMoreShape(el);
        if (!explicit && !shape) return null;
        if (mode === 'profile' && !this.hasProfileScope(el, root, trustedRoot)) return null;
        if (mode === 'post' && !this.hasPostScope(el, root)) return null;
        if (mode === 'row' && !this.hasRowScope(el, root)) return null;
        const rect = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
        let score = explicit ? 0 : 100; // explicit aria-label always wins over shape fallback
        if (mode === 'profile') {
            if (rect.top < 520) score -= 20;
            if (rect.left < 80) score += 30;
        } else if (mode === 'post') {
            if (rect.top < 90) score += 20;
        }
        return { el, score, explicit, shape };
    },

    findCandidates(root = (typeof document !== 'undefined' ? document : null), { mode = 'profile', trustedRoot = false } = {}) {
        if (!root || this.isUnsafeRoute()) return [];
        if (mode === 'profile' && (!trustedRoot || (typeof document !== 'undefined' && root === document))) return [];
        const selector = 'button, div[role="button"], [tabindex="0"], svg[aria-label], svg';
        const seen = new Set();
        const candidates = [];
        for (const node of Array.from(root.querySelectorAll?.(selector) || [])) {
            const el = this.clickableAncestor(node);
            if (!el || seen.has(el)) continue;
            seen.add(el);
            const info = this.candidateInfo(el, { mode, root, trustedRoot });
            if (info) candidates.push(info);
        }
        return candidates.sort((a, b) => a.score - b.score || (a.el.getBoundingClientRect?.().top || 0) - (b.el.getBoundingClientRect?.().top || 0));
    },

    find(root, options = {}) {
        return this.findCandidates(root, options)[0]?.el || null;
    },

    routeMatches(before, after, expected = '') {
        if (!before || !after) return true;
        if (after === 'search_tags' || after === 'tags') return false;
        return !expected || after === expected;
    },
};

if (typeof window !== 'undefined') window.MoreLocator = MoreLocator;
