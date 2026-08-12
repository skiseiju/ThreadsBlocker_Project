import test from 'node:test';
import assert from 'node:assert/strict';

const { THREE_NO_DENSITY_ALERT_MIN_RUN } = await import('../src/config.js');
const { analyze, computeMaxConsecutiveNamePattern } = await import('../src/three-no-name-pattern.js');

test('beta23 analyze mirrors the pinyin-name structure rule', () => {
    for (const username of ['chenyuxin8661', 'linpeiyan496', 'qiuyayan50']) {
        assert.ok(analyze(username), `${username} should match`);
    }
    assert.equal(analyze('love0822tw'), null, 'love0822tw is not a pinyin surname structure');
    assert.equal(analyze('abcdefgh123'), null, 'pure English username should not match');
});

test('beta23 computes the longest consecutive hit run by sequence', () => {
    const matchingUsernames = [
        'chenyuxin8661',
        'linpeiyan496',
        'qiuyayan50',
        'zhangyiming123',
        'wangyuexin8',
        'liujiawei77',
    ];
    const rows = matchingUsernames.map((username, index) => ({
        sequence: 10 + index,
        username,
    })).reverse();
    const result = computeMaxConsecutiveNamePattern(rows);
    assert.equal(result.maxRun, 6);
    assert.equal(result.runUsernames.length, 6);
    assert.deepEqual(result.runUsernames, matchingUsernames);
    assert.equal(result.totalHits, 6);

    const interrupted = computeMaxConsecutiveNamePattern([
        { sequence: 10, username: matchingUsernames[0] },
        { sequence: 11, username: matchingUsernames[1] },
        { sequence: 12, username: 'love0822tw' },
        { sequence: 13, username: matchingUsernames[2] },
        { sequence: 14, username: matchingUsernames[3] },
        { sequence: 15, username: matchingUsernames[4] },
    ]);
    assert.equal(interrupted.maxRun, 3);
    assert.deepEqual(interrupted.runUsernames, matchingUsernames.slice(2, 5));
    assert.equal(interrupted.totalHits, 5);
});

test('beta23 density threshold uses the shared constant', () => {
    const rows = Array.from({ length: THREE_NO_DENSITY_ALERT_MIN_RUN - 1 }, (_, index) => ({
        sequence: index + 1,
        username: ['chenyuxin8661', 'linpeiyan496', 'qiuyayan50', 'zhangyiming123'][index % 4],
    }));
    assert.ok(computeMaxConsecutiveNamePattern(rows).maxRun < THREE_NO_DENSITY_ALERT_MIN_RUN);

    rows.push({ sequence: THREE_NO_DENSITY_ALERT_MIN_RUN, username: 'wangyuexin8' });
    assert.ok(computeMaxConsecutiveNamePattern(rows).maxRun >= THREE_NO_DENSITY_ALERT_MIN_RUN);
});

console.log('beta23 name-pattern density: PASS analyze, consecutive runs, threshold semantics');
