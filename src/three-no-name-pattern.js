// 三無名冊連續同結構命名密度提示（beta23）；只提供人工檢視資訊，不改判定或封鎖流程。
// 相關：[ADR 0022](../docs/adr/0022-three-no-formula-requires-confirmed-empty-content.md)（維持三無判定公式）、`src/ui.js`、`src/storage.js`
// 判定規則移植自 `.ai/pattern-research/syl.py`；產品 runtime 不會執行或載入外部 Python 檔案。
import { PINYIN_SURNAMES } from './config.js';

const THREE_NO_PATTERN_INITIALS = [
    'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x',
    'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w', '',
];
const THREE_NO_PATTERN_FINALS = [
    'a', 'o', 'e', 'i', 'u', 'v', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er',
    'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng',
    'ue', 'uan', 'van', 've', 'vn',
];
const THREE_NO_PATTERN_SYLLABLES = new Set();
for (const initial of THREE_NO_PATTERN_INITIALS) {
    for (const final of THREE_NO_PATTERN_FINALS) {
        THREE_NO_PATTERN_SYLLABLES.add(initial + final);
    }
}
for (const syllable of 'a ai an ang ao e ei en er o ou yi ya ye yao you yan yin yang ying yong wu wa wo wai wei wan wen wang weng yu yue yuan yun'.split(' ')) {
    THREE_NO_PATTERN_SYLLABLES.add(syllable);
}
for (const syllable of [...THREE_NO_PATTERN_SYLLABLES]) {
    if (syllable.length < 1 || syllable.length > 6) THREE_NO_PATTERN_SYLLABLES.delete(syllable);
}

const THREE_NO_PATTERN_SURNAME_SET = new Set(PINYIN_SURNAMES);

// Keep the same longest-first greedy segmentation as syl.py.
export const seg = (value) => {
    const source = String(value || '').toLowerCase();
    const memo = new Map();
    const walk = (remaining) => {
        if (remaining === '') return [];
        if (memo.has(remaining)) return memo.get(remaining);
        for (const length of [6, 5, 4, 3, 2, 1]) {
            if (remaining.length < length) continue;
            const candidate = remaining.slice(0, length);
            if (!THREE_NO_PATTERN_SYLLABLES.has(candidate)) continue;
            const rest = walk(remaining.slice(length));
            if (rest !== null) {
                const result = [candidate, ...rest];
                memo.set(remaining, result);
                return result;
            }
        }
        memo.set(remaining, null);
        return null;
    };
    return walk(source);
};

export const analyze = (username) => {
    const source = String(username || '').toLowerCase();
    const match = /^([a-z]+)(\d{1,4})([a-z]{0,3})$/.exec(source);
    if (!match) return null;
    const [, letters, digits, tail] = match;
    if (letters.length < 5 || letters.length > 12) return null;
    const parts = seg(letters);
    if (!parts || parts.length < 2 || parts.length > 4) return null;
    if (!THREE_NO_PATTERN_SURNAME_SET.has(parts[0])) return null;
    return {
        letters,
        parts,
        digits,
        tail,
    };
};

export const computeMaxConsecutiveNamePattern = (rows) => {
    const orderedRows = (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            row: row && typeof row === 'object' ? row : {},
            index,
            sequence: Number(row?.sequence),
        }))
        .sort((left, right) => {
            const leftSequence = Number.isFinite(left.sequence) ? left.sequence : Number.POSITIVE_INFINITY;
            const rightSequence = Number.isFinite(right.sequence) ? right.sequence : Number.POSITIVE_INFINITY;
            return leftSequence - rightSequence || left.index - right.index;
        });

    let totalHits = 0;
    let currentRun = [];
    let maxRun = 0;
    let runUsernames = [];
    for (const entry of orderedRows) {
        const username = String(entry.row.username || '').trim();
        if (analyze(username)) {
            totalHits += 1;
            currentRun.push(username);
            if (currentRun.length > maxRun) {
                maxRun = currentRun.length;
                runUsernames = currentRun.slice();
            }
        } else {
            currentRun = [];
        }
    }
    return { maxRun, runUsernames, totalHits };
};
