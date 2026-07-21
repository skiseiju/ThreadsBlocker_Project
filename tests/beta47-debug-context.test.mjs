import test from 'node:test';
import assert from 'node:assert/strict';
import { ReportDebugContext } from '../src/report-debug-context.js';

const NOW = 1_800_000_000_000;
const counts = { queue: 3, failed: 1, success: 2, skipped: 0, vanished: 0 };

function event(ts, result = 'menu_not_found', extra = {}) {
    return {
        ts,
        stage: 'report',
        result,
        routeType: 'profile',
        counts,
        ...extra,
    };
}

test('beta47 debug_context_v2 enforces 25-event cap and 48h expiry', () => {
    let snapshot = null;
    for (let i = 0; i < 30; i += 1) {
        snapshot = ReportDebugContext.append(snapshot, event(NOW + i), NOW + i);
    }
    assert.equal(snapshot.schema, 'threadsblocker.debug_context_v2');
    assert.equal(snapshot.events.length, 25);
    assert.equal(snapshot.events[0].ts, NOW + 5);
    assert.equal(snapshot.expiresAt, NOW + 29 + ReportDebugContext.TTL_MS);

    const withExpired = ReportDebugContext.append(
        { ...snapshot, events: [event(NOW - ReportDebugContext.TTL_MS - 1)] },
        event(NOW + 31),
        NOW + 31,
    );
    assert.equal(withExpired.events.length, 1, 'expired events are removed before append');
    assert.equal(withExpired.events[0].ts, NOW + 31);
});

test('beta47 debug_context_v2 strips non-schema fields and rejects invalid events', () => {
    const safe = ReportDebugContext.append(null, event(NOW, 'failed', {
        username: 'secret_user',
        postText: 'private post text',
        href: 'https://threads.net/@secret_user/post/123?token=secret',
        dom: '<article>secret</article>',
    }), NOW);
    assert.ok(safe);
    assert.deepEqual(Object.keys(safe.events[0]).sort(), ['counts', 'result', 'routeType', 'stage', 'ts']);
    assert.equal(JSON.stringify(safe).includes('secret_user'), false);
    assert.equal(JSON.stringify(safe).includes('private post text'), false);
    assert.equal(JSON.stringify(safe).includes('threads.net'), false);
    assert.equal(ReportDebugContext.append(null, event(NOW, 'not-allowed'), NOW), null);
    assert.equal(ReportDebugContext.append(null, event(NOW, 'failed', { counts: { queue: -1 } }), NOW), null);
});

