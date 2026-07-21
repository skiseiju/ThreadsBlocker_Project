// Deterministic, fail-closed helpers for post activity dialog collection.
// This module deliberately keeps only classification evidence and aggregate
// counters; it never logs or exports account names.

const normalizeDialogText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const selectorMatchesLike = [
    'svg[viewBox="0 0 18 18"] path[d*="8.33956"]',
    '[data-hege-like="true"]',
].join(',');
const VERIFIED_LIKES_CLASSIFICATION = 'verified_likes_context';

const hrefUsername = (link) => {
    const href = link?.getAttribute?.('href') || '';
    const match = href.match(/^\/@([^/?#]+)/);
    return match?.[1] || '';
};

const profileLinksIn = (node) => Array.from(node?.querySelectorAll?.('a[href^="/@"]') || [])
    .filter(link => /^\/@[^/?#]+$/.test(link.getAttribute?.('href') || ''));

const hasNativeRowEvidence = (node, link) => {
    const native = Array.from(node?.querySelectorAll?.(
        'button, [role="button"], [data-testid*="follow" i], [data-testid*="badge" i], [data-testid*="action" i], [aria-label*="follow" i], [aria-label*="badge" i]'
    ) || []).filter(candidate => candidate !== link && !candidate.contains?.(link));
    return native.length > 0;
};

const hasHeaderLikeAncestor = (node, ctx) => {
    for (let current = node; current && current !== ctx; current = current.parentElement) {
        const className = String(current.getAttribute?.('class') || '');
        const testId = String(current.getAttribute?.('data-testid') || '');
        if (current.matches?.('header, [role="banner"], [role="heading"], h1, h2')
            || /(?:profile[-_ ]?header|account[-_ ]?header)/i.test(`${className} ${testId}`)) return true;
    }
    return false;
};

const isVerifiedLikesContext = (options = {}) => options?.verifiedLikesContext === true
    && options?.classificationStrategy === VERIFIED_LIKES_CLASSIFICATION;

const createAnchorDiagnostics = () => ({
    exactLinkCount: 0,
    uniqueExactAccountCount: 0,
    duplicateExactLinkCount: 0,
    acceptedUniqueAccountCount: 0,
    excludedInvalidCount: 0,
    excludedInvisibleCount: 0,
    excludedOutOfBoundsCount: 0,
    excludedHeadingHeaderCount: 0,
    excludedNavigationCount: 0,
    excludedNestedDialogCount: 0,
    classifiedLinkCount: 0,
    unclassifiedLinkCount: 0,
});

const finalizeAnchorDiagnostics = (diagnostics) => {
    const excludedCount = diagnostics.excludedInvalidCount
        + diagnostics.excludedInvisibleCount
        + diagnostics.excludedOutOfBoundsCount
        + diagnostics.excludedHeadingHeaderCount
        + diagnostics.excludedNavigationCount
        + diagnostics.excludedNestedDialogCount;
    diagnostics.classifiedLinkCount = diagnostics.acceptedUniqueAccountCount
        + diagnostics.duplicateExactLinkCount + excludedCount;
    diagnostics.unclassifiedLinkCount = Math.max(0, diagnostics.exactLinkCount - diagnostics.classifiedLinkCount);
    return { ...diagnostics };
};

export const DialogCollector = {
    normalizeText: normalizeDialogText,

    countExactAccountLinks: (ctx) => {
        if (!ctx?.querySelectorAll) return 0;
        const links = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter(link => {
            const href = link.getAttribute?.('href') || '';
            if (!/^\/@[^/?#]+\/?$/.test(href)) return false;
            if (link.closest?.('h1, h2, [role="heading"], header, [role="tab"]')) return false;
            return true;
        });
        return links.length;
    },

    pickBestAccountDialog: (fallbackCtx) => {
        if (!fallbackCtx || fallbackCtx === (typeof document !== 'undefined' ? document.body : null)) {
            return fallbackCtx;
        }
        const allDialogs = typeof document !== 'undefined'
            ? Array.from(document.querySelectorAll('[role="dialog"]'))
            : [];
        if (allDialogs.length === 0) return fallbackCtx;

        const scores = allDialogs.map(dialog => ({
            dialog,
            linkCount: DialogCollector.countExactAccountLinks(dialog),
        }));
        const bestScored = scores.reduce((best, current) =>
            current.linkCount > best.linkCount ? current : best,
            { dialog: null, linkCount: 0 }
        );

        // If the best dialog has at least one link, use it; otherwise fall back
        return bestScored.linkCount > 0 ? bestScored.dialog : fallbackCtx;
    },

    findLikesTab: (ctx, likesTexts = []) => {
        if (!ctx?.querySelectorAll) return null;
        const allowed = new Set(likesTexts.map(normalizeDialogText).filter(Boolean));
        const candidates = Array.from(ctx.querySelectorAll('[role="tab"], [role="button"], button, [role="link"]'));
        return candidates.find((candidate) => {
            const aria = normalizeDialogText(candidate.getAttribute?.('aria-label'));
            const text = normalizeDialogText(candidate.innerText || candidate.textContent);
            const testId = normalizeDialogText(candidate.getAttribute?.('data-testid'));
            const labelMatches = [aria, text, testId].some(value => value && [...allowed].some(item => value === item || value.startsWith(`${item} `)));
            if (!labelMatches) return false;
            return !!candidate.closest?.('[role="tab"], [role="button"], button, [role="link"]');
        }) || null;
    },

    isSelectedTab: (tab) => {
        if (!tab) return false;
        const ariaSelected = normalizeDialogText(tab.getAttribute?.('aria-selected'));
        const dataSelected = normalizeDialogText(tab.getAttribute?.('data-selected'));
        const cls = normalizeDialogText(tab.className);
        return ariaSelected === 'true' || dataSelected === 'true' || /(?:^|[\s_-])(active|selected)(?:$|[\s_-])/.test(cls);
    },

    // Threads sometimes changes the active Likes tab visually without
    // exposing aria-selected/data-selected/class markers. Keep the strict
    // marker helpers for evidence, but provide a bounded semantic readiness
    // check for a clicked Likes tab with a stable, identifiable account list.
    getLikesContextSnapshot: (ctx, likesTexts = []) => {
        const links = Array.from(ctx?.querySelectorAll?.('a[href^="/@"]') || [])
            .filter(link => /^\/@[^/?#]+$/.test(link.getAttribute?.('href') || ''));
        const uniqueCandidateCount = new Set(links.map(link => hrefUsername(link).toLowerCase()).filter(Boolean)).size;
        const rows = DialogCollector.inventoryVisibleRows(ctx);
        const tab = DialogCollector.findLikesTab(ctx, likesTexts.length ? likesTexts : ['Likes', '讚', '按讚', '喜歡']);
        const normalizedLikes = new Set((likesTexts.length ? likesTexts : ['Likes', '讚', '按讚', '喜歡'])
            .map(normalizeDialogText).filter(Boolean));
        const activityTabs = Array.from(ctx?.querySelectorAll?.('[role="tab"], [role="button"], button, [role="link"]') || []);
        const tabLabel = candidate => normalizeDialogText(candidate?.getAttribute?.('aria-label') || candidate?.innerText || candidate?.textContent);
        const otherSelected = activityTabs.some(candidate => {
            const value = tabLabel(candidate);
            const isKnownOther = /^(?:quotes|reposts|引用|轉發|轉推)(?:\s|$)/i.test(value);
            const isTabLike = candidate.matches?.('[role="tab"]') || isKnownOther;
            return isTabLike && DialogCollector.isSelectedTab(candidate)
                && ![...normalizedLikes].some(label => value === label || value.startsWith(`${label} `));
        });
        const heading = Array.from(ctx?.querySelectorAll?.('h1, h2, [role="heading"]') || [])
            .some(node => /^(likes|讚|按讚|喜歡)$/i.test(normalizeDialogText(node.innerText || node.textContent)));
        const otherHeading = Array.from(ctx?.querySelectorAll?.('h1, h2, [role="heading"]') || [])
            .some(node => /^(quotes|reposts|引用|轉發|轉推)$/i.test(normalizeDialogText(node.innerText || node.textContent)));
        const loading = /loading|載入|載入中|讀取/i.test(String(ctx?.innerText || ctx?.textContent || ''));
        const listRoot = rows[0]?.parentElement || links[0]?.parentElement || null;
        return {
            context: ctx || null,
            root: listRoot,
            candidateCount: links.length,
            uniqueCandidateCount,
            rowCount: rows.length || links.length,
            loading,
            tab: !!tab,
            heading,
            otherSelected,
            otherHeading,
            semanticRows: links.length > 0 && !loading && !otherSelected && !otherHeading,
            verifiedLikesContext: false,
            signature: `${links.length}:${rows.length}:${loading}:${!!tab}:${!!heading}:${otherSelected}:${otherHeading}`,
        };
    },

    waitForLikesContextReady: async (initialCtx, options = {}) => {
        const likesTexts = options.likesTexts || [];
        const getLiveContext = typeof options.getLiveContext === 'function' ? options.getLiveContext : (() => initialCtx);
        const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts) || 12));
        const waitMs = Math.max(20, Math.min(1000, Number(options.waitMs) || 150));
        const requireChange = options.requireChange === true;
        const initialSnapshot = DialogCollector.getLikesContextSnapshot(initialCtx, likesTexts);
        const initialTab = DialogCollector.findLikesTab(initialCtx, likesTexts);
        const initialSelected = DialogCollector.isSelectedTab(initialTab);
        let previousSignature = '';
        let stableObservations = 0;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const liveContext = getLiveContext();
            const pageRoot = typeof document !== 'undefined' ? document.body : null;
            const fallbackCandidate = liveContext && liveContext !== pageRoot ? liveContext : initialCtx;
            const candidate = DialogCollector.pickBestAccountDialog(fallbackCandidate);
            const tab = DialogCollector.findLikesTab(candidate, likesTexts);
            const selected = DialogCollector.isSelectedTab(tab);
            const evidence = DialogCollector.hasCurrentLikesEvidence(candidate);
            const snapshot = DialogCollector.getLikesContextSnapshot(candidate, likesTexts);
            const contextChanged = candidate !== initialCtx;
            const rootChanged = snapshot.root !== initialSnapshot.root;
            const listChanged = snapshot.signature !== initialSnapshot.signature;
            const selectionChanged = selected !== initialSelected;
            const signature = `${contextChanged ? 'new' : 'same'}:${selected}:${evidence}:${snapshot.signature}`;
            stableObservations = signature === previousSignature ? stableObservations + 1 : 0;
            previousSignature = signature;
            options.onObservation?.({ attempt, candidate, snapshot, selected, evidence, contextChanged, rootChanged, listChanged, stableObservations });
            if (!snapshot.loading && !snapshot.otherSelected && !snapshot.otherHeading && (selected || evidence)
                && (!requireChange || contextChanged || rootChanged || listChanged || selectionChanged)) {
                return {
                    ctx: candidate, snapshot, attempt, stableObservations, reason: 'marker_or_evidence',
                    verifiedLikesContext: true, classificationStrategy: VERIFIED_LIKES_CLASSIFICATION,
                };
            }
            const semanticReady = snapshot.semanticRows && snapshot.rowCount > 0 && !snapshot.loading
                && stableObservations >= 2
                && (!requireChange || contextChanged || rootChanged || listChanged);
            if (semanticReady) return {
                ctx: candidate, snapshot, attempt, stableObservations, reason: 'semantic_stable',
                verifiedLikesContext: true, classificationStrategy: VERIFIED_LIKES_CLASSIFICATION,
            };
            const emptyReady = !requireChange && snapshot.tab && !snapshot.loading
                && !snapshot.otherSelected && !snapshot.otherHeading && snapshot.candidateCount === 0
                && stableObservations >= 2;
            if (emptyReady) return {
                ctx: candidate, snapshot, attempt, stableObservations, reason: 'empty_stable',
                verifiedLikesContext: true, classificationStrategy: VERIFIED_LIKES_CLASSIFICATION,
            };
            if (attempt < maxAttempts - 1) await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        return null;
    },

    isLikesContextReady: (ctx, likesTexts = []) => {
        if (!ctx) return false;
        const tab = DialogCollector.findLikesTab(ctx, likesTexts.length ? likesTexts : ['Likes', '讚', '按讚', '喜歡']);
        if (DialogCollector.isSelectedTab(tab) || DialogCollector.hasCurrentLikesEvidence(ctx)) return true;
        const snapshot = DialogCollector.getLikesContextSnapshot(ctx, likesTexts);
        return snapshot.semanticRows && snapshot.tab;
    },

    findRowBoundary: (link, ctx, options = {}) => {
        if (!link) return null;
        // Like/follower evidence must be scoped to one verifiable row.  A
        // shared list/dialog/container is never a row boundary.
        for (let node = link.parentElement; node; node = node.parentElement) {
            if (node === ctx || node === document.body || node.getAttribute?.('role') === 'dialog') break;
            const links = profileLinksIn(node);
            if (links.length !== 1) continue;
            if (hasHeaderLikeAncestor(node, ctx)) continue;
            const explicit = node.matches?.('[role="listitem"], [data-row-key], [data-key], [data-testid*="row" i]');
            const className = String(node.getAttribute?.('class') || '');
            const verifiedRow = isVerifiedLikesContext(options)
                && (/(?:^|[\s_-])row(?:$|[\s_-])/i.test(className) || /(?:^|[\s_-])user[-_ ]?row(?:$|[\s_-])/i.test(className));
            if (explicit || verifiedRow || hasNativeRowEvidence(node, link)) return node;
        }
        return null;
    },

    findScrollableRoot: (ctx, options = {}) => {
        if (!ctx?.querySelectorAll) return ctx || null;
        const candidates = [ctx, ...Array.from(ctx.querySelectorAll('*'))].filter((node) => {
            const height = Number(node.scrollHeight || 0);
            const client = Number(node.clientHeight || 0);
            if (!(height > client + 4)) return false;
            // Never cross into a nested/background dialog from the selected
            // live context. Stacked dialogs remain mounted in the document.
            if (node !== ctx && node.closest?.('[role="dialog"]') && node.closest('[role="dialog"]') !== ctx) return false;
            const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(node) : null;
            return !style || /auto|scroll|overlay/i.test(`${style.overflowY || ''} ${style.overflow || ''}`);
        });
        const candidateSet = new Set(candidates);
        const metrics = new Map();
        const nearestCandidate = (link) => {
            for (let parent = link?.parentElement; parent; parent = parent.parentElement) {
                if (candidateSet.has(parent)) return parent;
                if (parent === ctx) break;
            }
            return candidateSet.has(ctx) ? ctx : null;
        };
        const validLinks = (node) => Array.from(node.querySelectorAll?.('a[href^="/@"]') || [])
            .filter(link => /^\/@[^/?#]+\/?$/.test(link.getAttribute?.('href') || ''))
            .filter(link => !link.closest?.('h1, h2, [role="heading"], header, [role="tab"]'));
        candidates.forEach((node) => {
            const directLinks = validLinks(node).filter(link => nearestCandidate(link) === node);
            const rowEvidence = directLinks.reduce((count, link) => count + (DialogCollector.findRowForLink(link, node, options) ? 1 : 0), 0);
            let depth = 0;
            for (let parent = node; parent && parent !== ctx && depth < 32; parent = parent.parentElement) depth += 1;
            metrics.set(node, {
                directLinks: directLinks.length,
                rowEvidence,
                depth,
                height: Math.min(10000, Number(node.scrollHeight || 0)),
                nestedScrollables: candidates.filter(child => child !== node && node.contains?.(child)).length,
            });
        });
        return candidates.sort((a, b) => {
            const score = (node) => {
                const item = metrics.get(node) || {};
                // Trusted direct account-row links are the primary signal. Raw
                // profile links in a shell/header/decoy must never outrank a
                // smaller list whose links resolve to verifiable rows.
                return (item.rowEvidence || 0) * 1e9
                    + (item.directLinks || 0) * 1e6
                    + (item.depth || 0) * 1000
                    + Math.min(1000, (item.height || 0) / 100)
                    - (item.nestedScrollables || 0) * 5000;
            };
            return score(b) - score(a);
        })[0] || ctx;
    },

    findRowForLink: (link, ctx, options = {}) => {
        return DialogCollector.findRowBoundary(link, ctx, options);
    },

    inventoryVisibleRows: (ctx, options = {}) => {
        if (!ctx?.querySelectorAll) return [];
        const containerRect = ctx.getBoundingClientRect?.() || { top: -Infinity, bottom: Infinity };
        const seen = new Set();
        return Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter((link) => {
            const rect = link.getBoundingClientRect?.() || { width: 1, height: 1, top: 0, bottom: 1, right: 1 };
            if (!(rect.width > 0 && rect.height > 0 && rect.right > 0
                && rect.top >= containerRect.top - 10 && rect.bottom <= containerRect.bottom + 10
                && !link.closest?.('h1, h2, [role="heading"]'))) return false;
            const row = DialogCollector.findRowForLink(link, ctx, options) || link;
            if (seen.has(row)) return false;
            seen.add(row);
            return true;
        });
    },

    hasLikeEvidence: (row) => !!row?.querySelector?.(selectorMatchesLike),

    hasCurrentLikesEvidence: (ctx) => {
        if (!ctx?.querySelectorAll) return false;
        const header = Array.from(ctx.querySelectorAll('h1, h2, [role="heading"]'))
            .some(node => /^(likes|讚|按讚|喜歡)$/i.test(normalizeDialogText(node.innerText || node.textContent)));
        if (!header) return false;
        return DialogCollector.inventoryVisibleRows(ctx).some(link => {
            const row = DialogCollector.findRowForLink(link, ctx);
            return !!row && DialogCollector.hasLikeEvidence(row);
        });
    },

    createFollowerState: () => ({
        users: new Set(),
        seenUsernames: new Set(),
        visibleRows: 0,
        unknownRows: 0,
        batches: 0,
        truncated: false,
        breakdown: { observedUnique: 0, eligibleNew: 0, duplicate: 0, selfTarget: 0, blocked: 0, queued: 0, unknown: 0, invalid: 0 },
    }),

    collectFollowerRows: (ctx, state, options = {}) => {
        const target = state || DialogCollector.createFollowerState();
        if (!ctx?.querySelectorAll) return { users: [...target.users], visibleRows: target.visibleRows, unknownRows: target.unknownRows, batches: target.batches, breakdown: { ...target.breakdown } };
        const skipUsers = new Set(Array.from(options.skipUsers || [], u => String(u).replace(/^@+/, '').toLowerCase()));
        const blockedUsers = new Set(Array.from(options.blockedUsers || [], u => String(u).replace(/^@+/, '').toLowerCase()));
        const queuedUsers = new Set(Array.from(options.queuedUsers || [], u => String(u).replace(/^@+/, '').toLowerCase()));
        const targetOwner = String(options.targetOwner || '').replace(/^@+/, '').toLowerCase();
        const selfUser = String(options.selfUser || '').replace(/^@+/, '').toLowerCase();
        const maxLimit = Number.isFinite(options.maxLimit) ? Math.max(1, Math.floor(options.maxLimit)) : 50;
        const links = DialogCollector.inventoryVisibleRows(ctx);
        for (const link of links) {
            const href = link.getAttribute?.('href') || '';
            const username = hrefUsername(link);
            if (!/^\/@[^/?#]+$/.test(href) || !username) {
                target.breakdown.invalid += 1;
                continue;
            }
            const row = DialogCollector.findRowForLink(link, ctx);
            target.visibleRows += 1;
            if (!row) {
                target.unknownRows += 1;
                target.breakdown.unknown += 1;
                continue;
            }
            const normalized = username.toLowerCase();
            if (target.seenUsernames.has(normalized)) {
                target.breakdown.duplicate += 1;
                continue;
            }
            target.seenUsernames.add(normalized);
            target.breakdown.observedUnique += 1;
            if (normalized === targetOwner || normalized === selfUser) {
                target.breakdown.selfTarget += 1;
                continue;
            }
            if (blockedUsers.has(normalized) || skipUsers.has(normalized)) {
                target.breakdown.blocked += 1;
                continue;
            }
            if (queuedUsers.has(normalized)) {
                target.breakdown.queued += 1;
                continue;
            }
            target.users.add(username);
            target.breakdown.eligibleNew += 1;
            if (target.users.size >= maxLimit) {
                target.truncated = true;
                break;
            }
        }
        target.batches += 1;
        return {
            users: [...target.users].slice(0, maxLimit),
            visibleRows: target.visibleRows,
            unknownRows: target.unknownRows,
            batches: target.batches,
            truncated: target.truncated,
            breakdown: { ...target.breakdown },
        };
    },

    createState: () => ({
        entries: new Map(),
        allUsers: new Set(),
        observedUsernames: new Set(),
        visibleRows: 0,
        uniqueVisibleRows: 0,
        validAccountRows: 0,
        uniqueUnknownRows: 0,
        likeRows: 0,
        nonLikeRows: 0,
        unknownRows: 0,
        activityVisibleCount: 0,
        collectorLikedCount: 0,
        batches: 0,
        verifiedLikesContext: false,
        classificationStrategy: 'unknown',
        anchorDiagnostics: createAnchorDiagnostics(),
    }),

    // Once waitForLikesContextReady has positively identified the live Likes
    // page, the page itself is the content boundary. Threads can render that
    // page with plain exact profile anchors and no stable row/action shape.
    // This escape hatch is intentionally opt-in and never applies to an
    // unverified, Quotes, or follower context.
    collectVerifiedLikesAnchors: (ctx, state, options = {}) => {
        const target = state || DialogCollector.createState();
        if (!ctx?.querySelectorAll || !isVerifiedLikesContext(options)
            || options.allowVerifiedLikesAnchorFallback !== true) return target;
        const contextRect = ctx.getBoundingClientRect?.() || { top: -Infinity, right: Infinity, bottom: Infinity, left: -Infinity };
        const viewportWidth = typeof window !== 'undefined' ? Number(window.innerWidth || Infinity) : Infinity;
        const viewportHeight = typeof window !== 'undefined' ? Number(window.innerHeight || Infinity) : Infinity;
        const seen = new Set();
        const uniqueAccounts = new Set();
        const anchorDiagnostics = createAnchorDiagnostics();
        const links = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter((link) => {
            anchorDiagnostics.exactLinkCount += 1;
            const href = link.getAttribute?.('href') || '';
            if (!/^\/@[^/?#]+$/.test(href)) {
                anchorDiagnostics.excludedInvalidCount += 1;
                return false;
            }
            const username = hrefUsername(link);
            const normalized = username.toLowerCase();
            if (!username) {
                anchorDiagnostics.excludedInvalidCount += 1;
                return false;
            }
            uniqueAccounts.add(normalized);
            // Collect raw observed anchors first. Core/usersFromState applies
            // self/owner/reply/queue skips downstream so skip-only pages still
            // produce observed/valid evidence and an end outcome.
            if (seen.has(normalized)) {
                anchorDiagnostics.duplicateExactLinkCount += 1;
                return false;
            }
            const headingHeader = link.closest?.('header, [role="banner"], [class*="profile-header" i], [class*="account-header" i], [data-testid*="profile-header" i], [data-testid*="account-header" i], h1, h2, [role="heading"]');
            const navigation = link.closest?.('nav, [role="navigation"], [data-testid*="navigation" i], [data-testid*="tabbar" i], [role="tab"]');
            if (headingHeader) anchorDiagnostics.excludedHeadingHeaderCount += 1;
            else if (navigation) anchorDiagnostics.excludedNavigationCount += 1;
            if (link.closest?.('header, nav, [role="navigation"], [role="banner"], [data-testid*="navigation" i], [data-testid*="tabbar" i], [class*="profile-header" i], [class*="account-header" i], [data-testid*="profile-header" i], h1, h2, [role="heading"], [role="tab"]')) return false;
            const nestedDialog = link.closest?.('[role="dialog"]');
            if (nestedDialog && nestedDialog !== ctx) {
                anchorDiagnostics.excludedNestedDialogCount += 1;
                return false;
            }
            const rect = link.getBoundingClientRect?.() || { width: 1, height: 1, top: 0, bottom: 1, left: 0, right: 1 };
            const visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0;
            if (!visible) {
                anchorDiagnostics.excludedInvisibleCount += 1;
                return false;
            }
            const inBounds = rect.left < viewportWidth && rect.top < viewportHeight
                && rect.right >= contextRect.left - 10 && rect.left <= contextRect.right + 10
                && rect.bottom >= contextRect.top - 10 && rect.bottom <= contextRect.bottom + 10;
            if (!inBounds) {
                anchorDiagnostics.excludedOutOfBoundsCount += 1;
                return false;
            }
            seen.add(normalized);
            anchorDiagnostics.acceptedUniqueAccountCount += 1;
            return true;
        });
        anchorDiagnostics.uniqueExactAccountCount = uniqueAccounts.size;
        const finalizedAnchorDiagnostics = finalizeAnchorDiagnostics(anchorDiagnostics);
        for (const link of links) {
            const username = hrefUsername(link);
            if (!username) continue;
            const normalized = username.toLowerCase();
            target.allUsers.add(username);
            const existing = target.entries.get(normalized) || {
                username, liked: false, nonLiked: false, valid: false, unresolved: false, marker: false,
            };
            existing.username = existing.username || username;
            existing.valid = true;
            existing.unresolved = false;
            existing.liked = true;
            target.entries.set(normalized, existing);
            target.observedUsernames.add(normalized);
        }
        target.verifiedLikesContext = true;
        target.classificationStrategy = VERIFIED_LIKES_CLASSIFICATION;
        target.visibleRows = target.observedUsernames.size;
        target.uniqueVisibleRows = target.visibleRows;
        target.validAccountRows = [...target.entries.values()].filter(entry => entry.valid).length;
        target.activityVisibleCount = target.validAccountRows;
        target.unknownRows = [...target.entries.values()].filter(entry => entry.unresolved && !entry.valid).length;
        target.uniqueUnknownRows = target.unknownRows;
        target.likeRows = [...target.entries.values()].filter(entry => entry.liked).length;
        target.nonLikeRows = [...target.entries.values()].filter(entry => entry.nonLiked && !entry.liked).length;
        target.collectorLikedCount = DialogCollector.usersFromState(target).length;
        target.anchorDiagnostics = finalizedAnchorDiagnostics;
        target.batches += 1;
        return target;
    },

    collectVisible: (ctx, state, options = {}) => {
        const target = state || DialogCollector.createState();
        if (!ctx?.querySelectorAll) return target;
        if (isVerifiedLikesContext(options) && options.allowVerifiedLikesAnchorFallback === true) {
            return DialogCollector.collectVerifiedLikesAnchors(options.anchorContext || ctx, target, options);
        }
        const containerRect = ctx.getBoundingClientRect?.() || { top: -Infinity, bottom: Infinity };
        const verified = isVerifiedLikesContext(options) || isVerifiedLikesContext(target);
        if (verified) {
            target.verifiedLikesContext = true;
            target.classificationStrategy = VERIFIED_LIKES_CLASSIFICATION;
        }
        const links = DialogCollector.inventoryVisibleRows(ctx, { ...options, verifiedLikesContext: verified, classificationStrategy: VERIFIED_LIKES_CLASSIFICATION });
        const seenRows = new Set();
        for (const link of links) {
            const rect = link.getBoundingClientRect?.() || { width: 1, height: 1, top: 0, bottom: 1, right: 1 };
            const visible = rect.width > 0 && rect.height > 0 && rect.right > 0
                && rect.top >= containerRect.top - 10 && rect.bottom <= containerRect.bottom + 10;
            if (!visible || link.closest?.('h1, h2, [role="heading"]')) continue;
            const username = hrefUsername(link);
            if (!username) continue;
            const normalizedUsername = username.toLowerCase();
            target.allUsers.add(username);
            const row = DialogCollector.findRowForLink(link, ctx, { ...options, verifiedLikesContext: verified, classificationStrategy: VERIFIED_LIKES_CLASSIFICATION });
            const rowKey = row || link;
            if (seenRows.has(rowKey)) continue;
            seenRows.add(rowKey);
            const existing = target.entries.get(normalizedUsername) || {
                username, liked: false, nonLiked: false, valid: false, unresolved: false, marker: false,
            };
            existing.username = existing.username || username;
            if (row) {
                const marked = DialogCollector.hasLikeEvidence(row);
                existing.valid = true;
                existing.unresolved = false;
                existing.marker = existing.marker || marked;
                if (verified || marked) existing.liked = true;
                if (!verified && !marked) existing.nonLiked = true;
            } else if (!existing.valid) {
                existing.unresolved = true;
            }
            target.entries.set(normalizedUsername, existing);
            target.observedUsernames.add(normalizedUsername);
        }
        target.visibleRows = target.observedUsernames.size;
        target.uniqueVisibleRows = target.visibleRows;
        target.validAccountRows = [...target.entries.values()].filter(entry => entry.valid).length;
        target.activityVisibleCount = target.validAccountRows;
        target.unknownRows = [...target.entries.values()].filter(entry => entry.unresolved && !entry.valid).length;
        target.uniqueUnknownRows = target.unknownRows;
        target.likeRows = [...target.entries.values()].filter(entry => entry.liked).length;
        target.nonLikeRows = [...target.entries.values()].filter(entry => entry.nonLiked && !entry.liked).length;
        target.collectorLikedCount = DialogCollector.usersFromState(target).length;
        target.batches += 1;
        return target;
    },

    usersFromState: (state, skipUsers = new Set(), maxLimit = Infinity) => {
        const users = [];
        for (const [normalizedUsername, evidence] of state?.entries || []) {
            const skip = [...skipUsers].some(value => String(value).toLowerCase() === normalizedUsername);
            const verified = state?.classificationStrategy === VERIFIED_LIKES_CLASSIFICATION;
            if ((verified ? evidence.valid : (evidence.liked && !evidence.nonLiked)) && !evidence.unresolved && !skip) {
                users.push(evidence.username || normalizedUsername);
                if (users.length >= maxLimit) break;
            }
        }
        return users;
    },
};
