// 更新視窗把 release-intro.md 無聲截斷。
//
// 2026-07-29：intro 寫了 15 段，畫面只顯示前 8 段。修正項目 6–10、介面說明與
// Firefox 衝突說明整段消失，使用者看到的是「更新說明沒有更新」。
// getReleaseNotesModalData 的 paragraphs 上限寫死 8，超過直接 slice 掉，
// 產生器與 build 都不會有任何提示。
//
// 這一類「靜默上限」比壞掉更難發現，因為畫面看起來是正常的。本檔守的是：
// 產生出來的段數必須真的顯示得完，不夠就要在測試階段紅，不是等使用者罵。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const uiSource = await read('src/ui.js');
const notesSource = await read('src/release-notes.js');

const parseBundledNotes = (source) => {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    return JSON.parse(source.slice(start, end + 1));
};

const readCap = (source) => {
    const value = source.match(/RELEASE_NOTES_MAX_PARAGRAPHS: (\d+)/)?.[1];
    return Number(value);
};

test('段數上限是具名常數，不再是散落的 magic number', () => {
    const cap = readCap(uiSource);
    assert.ok(Number.isInteger(cap) && cap > 0, 'RELEASE_NOTES_MAX_PARAGRAPHS must exist');
    assert.match(uiSource, /\.slice\(0, UI\.RELEASE_NOTES_MAX_PARAGRAPHS\)/);
    assert.doesNotMatch(uiSource, /segments\.length > 0\)\.slice\(0, 8\)/, '不得回到寫死 8 段');
});

test('目前產生的 intro 段數顯示得完，沒有被截斷', () => {
    const cap = readCap(uiSource);
    const paragraphs = parseBundledNotes(notesSource).developerNotice?.paragraphs || [];
    assert.ok(paragraphs.length > 0, 'release-intro.md 必須產生出至少一段');
    assert.ok(
        paragraphs.length <= cap,
        `intro 有 ${paragraphs.length} 段但畫面只顯示 ${cap} 段，第 ${cap + 1} 段之後會無聲消失`,
    );
});

test('intro 的每一段都要有內容，空段不得佔用配額', () => {
    const paragraphs = parseBundledNotes(notesSource).developerNotice?.paragraphs || [];
    for (const [index, paragraph] of paragraphs.entries()) {
        const segments = paragraph?.segments || [];
        assert.ok(segments.length > 0, `第 ${index + 1} 段沒有任何 segment`);
    }
});
