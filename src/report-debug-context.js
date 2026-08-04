// Closed-schema, privacy-safe report failure context. This module deliberately has
// no DOM/storage dependencies so read and write paths use the exact same validator.
export const ReportDebugContext = {
    SCHEMA: 'threadsblocker.debug_context_v2',
    TTL_MS: 48 * 60 * 60 * 1000,
    MAX_EVENTS: 25,
    MAX_COUNT: 1000000,
    MAX_ELAPSED_MS: 120000,
    MAX_RETRY_COUNT: 20,
    PHASES: new Set([
        'root_resolve',
        'more_resolve',
        'navigation_check',
        'menu_resolve',
        'action_resolve',
        'confirm_resolve',
        'queue_advance',
    ]),
    STAGES: new Set(['block', 'report', 'three_no']),
    RESULTS: new Set([
        'failed',
        'menu_not_found',
        'navigation_mismatch',
        'private_manual_required',
        'vanished',
        'rate_limited',
        'cooldown',
        'blank_dialog_stuck',
        'submit_not_confirmed',
        'navigated_to_post',
        'missing_dialog',
        'missing_report_option',
        'missing_profile_root',
        'exception',
        'unknown',
        'popup_blocked',
        'worker_bootstrap_timeout',
        'worker_blocked',
        'not_logged_in',
        'worker_start_failed',
        'owner_unknown',
        'scan_in_flight',
        'worker_busy',
        'stopped',
        'completed',
        'success',
        'already_blocked',
        'already_unblocked',
    ]),
    ROUTES: new Set(['profile', 'post', 'search_tags', 'tags', 'other', 'unknown']),
    COUNT_KEYS: ['queue', 'failed', 'success', 'skipped', 'vanished'],
    DIAGNOSTIC_COUNT_KEYS: ['moreCandidates', 'menuItems', 'confirmButtons', 'postFallbackAttempts'],
    THREE_NO_COUNT_KEYS: ['checked', 'candidates', 'findings'],
    CONTEXT_PATHS: new Set(['message', 'profile', 'post', 'unknown']),
    CONTEXT_TABS: new Set(['likes', 'quotes', 'reposts', 'followers', 'unknown']),
    CONTEXT_FEATURES: new Set(['followers', 'clean_list', 'likes', 'message_route', 'unknown']),
    CONTEXT_STAGES: new Set(['collect', 'tab_switch', 'row_discovery', 'route', 'unknown']),
    CONTEXT_STOP_REASONS: new Set(['end', 'completed', 'threads_partial', 'scroll_stall', 'timeout', 'stopped', 'rows_unknown', 'likes_tab_switch_failed', 'limited', 'max_scrolls', 'unknown']),

    finiteInt(value) {
        return Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= this.MAX_COUNT;
    },

    sanitizeCounts(raw, stage = '') {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        if (stage === 'three_no') {
            const counts = {};
            for (const key of this.THREE_NO_COUNT_KEYS) {
                const value = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : 0;
                if (!this.finiteInt(value)) return null;
                counts[key] = value;
            }
            return counts;
        }
        const counts = {};
        for (const key of this.COUNT_KEYS) {
            const value = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : 0;
            if (!this.finiteInt(value)) return null;
            counts[key] = value;
        }
        return counts;
    },

    sanitizeDiagnosticCounts(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const counts = {};
        for (const key of this.DIAGNOSTIC_COUNT_KEYS) {
            const value = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : 0;
            if (!this.finiteInt(value)) return null;
            counts[key] = value;
        }
        return counts;
    },

    sanitizeContext(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const bounded = (value, max = 1000000) => Number.isInteger(value) && value >= 0 && value <= max ? value : 0;
        const bool = value => value === true;
        const context = {
            appVersion: /^\d+\.\d+\.\d+(?:-beta\d+)?$/i.test(String(raw.appVersion || ''))
                ? String(raw.appVersion).slice(0, 32) : 'unknown',
            pathnameCategory: this.CONTEXT_PATHS.has(raw.pathnameCategory) ? raw.pathnameCategory : 'unknown',
            feature: this.CONTEXT_FEATURES.has(raw.feature) ? raw.feature : 'unknown',
            stage: this.CONTEXT_STAGES.has(raw.stage) ? raw.stage : 'unknown',
            activeTabCategory: this.CONTEXT_TABS.has(raw.activeTabCategory) ? raw.activeTabCategory : 'unknown',
            dialogFound: bool(raw.dialogFound),
            listFound: bool(raw.listFound),
            scrollRootFound: bool(raw.scrollRootFound),
            candidateCount: bounded(raw.candidateCount),
            eligibleCount: bounded(raw.eligibleCount),
            selectedCount: bounded(raw.selectedCount),
            routeSignals: {
                messageRoute: bool(raw.routeSignals?.messageRoute),
                profileRoute: bool(raw.routeSignals?.profileRoute),
                postRoute: bool(raw.routeSignals?.postRoute),
                routeUnchanged: bool(raw.routeSignals?.routeUnchanged),
            },
            messageShellSignals: {
                conversationList: bool(raw.messageShellSignals?.conversationList),
                activeConversation: bool(raw.messageShellSignals?.activeConversation),
                composer: bool(raw.messageShellSignals?.composer),
                actionArea: bool(raw.messageShellSignals?.actionArea),
            },
            stopReason: this.CONTEXT_STOP_REASONS.has(raw.stopReason) ? raw.stopReason : 'unknown',
        };
        return context;
    },

    boundedTiming(value, max) {
        return Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= max
            ? value
            : null;
    },

    sanitizeEvent(raw, now = Date.now()) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const ts = Number(raw.ts);
        const stage = raw.stage;
        const phase = raw.phase;
        const result = raw.result;
        const routeType = raw.routeType;
        if (!this.RESULTS.has(result) || !this.ROUTES.has(routeType)) return null;
        if (!Number.isFinite(ts) || !Number.isInteger(ts) || ts <= 0 || ts > now + 5 * 60 * 1000 || now - ts > this.TTL_MS) return null;

        // Beta50 diagnostics use a separate, closed phase schema. Keep the
        // beta47 stage schema readable for old snapshots, but never mix the
        // two count/timing shapes.
        if (phase !== undefined) {
            if (!this.PHASES.has(phase)) return null;
            const counts = this.sanitizeDiagnosticCounts(raw.counts);
            const elapsedMs = this.boundedTiming(raw.elapsedMs, this.MAX_ELAPSED_MS);
            const retryCount = this.boundedTiming(raw.retryCount, this.MAX_RETRY_COUNT);
            if (!counts || elapsedMs === null || retryCount === null) return null;
            const context = this.sanitizeContext(raw.context);
            return context ? { ts, phase, result, routeType, counts, elapsedMs, retryCount, context }
                : { ts, phase, result, routeType, counts, elapsedMs, retryCount };
        }

        if (!this.STAGES.has(stage)) return null;
        const counts = this.sanitizeCounts(raw.counts, stage);
        if (!counts) return null;
        const context = this.sanitizeContext(raw.context);
        return context ? { ts, stage, result, routeType, counts, context }
            : { ts, stage, result, routeType, counts };
    },

    sanitizeSnapshot(raw, now = Date.now()) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        if (raw.schema !== this.SCHEMA || !Array.isArray(raw.events)) return null;
        const events = raw.events
            .map(event => this.sanitizeEvent(event, now))
            .filter(Boolean)
            .slice(-this.MAX_EVENTS);
        if (events.length === 0) return null;
        const updatedAt = Math.max(...events.map(event => event.ts));
        return {
            schema: this.SCHEMA,
            updatedAt,
            expiresAt: updatedAt + this.TTL_MS,
            events,
        };
    },

    append(rawSnapshot, rawEvent, now = Date.now()) {
        const event = this.sanitizeEvent(rawEvent, now);
        if (!event) return null;
        const previous = this.sanitizeSnapshot(rawSnapshot, now);
        const events = [...(previous?.events || []), event].slice(-this.MAX_EVENTS);
        return {
            schema: this.SCHEMA,
            updatedAt: event.ts,
            expiresAt: event.ts + this.TTL_MS,
            events,
        };
    },

    contextFromSnapshot(snapshot, now = Date.now()) {
        const safe = this.sanitizeSnapshot(snapshot, now);
        if (!safe) return null;
        return { schema: this.SCHEMA, updatedAt: safe.updatedAt, last: safe.events[safe.events.length - 1] };
    },
};
