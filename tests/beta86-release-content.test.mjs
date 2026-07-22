import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BUNDLED_RELEASE_NOTES } from '../src/release-notes.js';
import { BUNDLED_ANNOUNCEMENT_FEED } from '../src/announcements.js';
import { UI } from '../src/ui.js';

const generator = fileURLToPath(new URL('../scripts/generate-release-content.mjs', import.meta.url));
globalThis.document = {
    createElement() {
        return {
            innerHTML: '',
            set textContent(value) {
                this.innerHTML = String(value ?? '')
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')
                    .replaceAll('"', '&quot;');
            },
        };
    },
};

test('beta86 Markdown release content is valid and generated files are current', () => {
    const output = execFileSync(process.execPath, [generator, '--check'], { encoding: 'utf8' });
    assert.match(output, /generated files are current/);
});

test('beta86 independent announcement module and site feed remain identical', async () => {
    const siteFeed = JSON.parse(await readFile(new URL('../site/announcements.json', import.meta.url), 'utf8'));
    assert.deepEqual(BUNDLED_ANNOUNCEMENT_FEED, siteFeed);
});

test('beta87 release modal renders manual intro plus deduplicated version-derived updates', async () => {
    const rendered = UI.renderReleaseNotesContent(BUNDLED_RELEASE_NOTES);
    for (const expected of ['開發者想說的話', '最近更新', '2.7.4', '有興趣標籤', '清理名單', '三無掃描']) {
        assert.match(rendered, new RegExp(expected));
    }
    assert.doesNotMatch(rendered, /版本 2\.7\.4 重點|Credentials opt-in/);
    assert.doesNotMatch(rendered, /<b>2\.7\.4<\/b>：2\.7\.4/);
    const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
    assert.doesNotMatch(uiSource, /開發者帳號已經回來了/);
    assert.match(uiSource, /renderReleaseNotesContent\(BUNDLED_RELEASE_NOTES/);
});

test('beta86 release renderer escapes text and drops unsafe Markdown links', () => {
    const rendered = UI.renderReleaseNotesContent({
        developerNotice: {
            title: '<img src=x>',
            paragraphs: [{ segments: [
                { text: '<script>alert(1)</script>' },
                { label: 'bad', url: 'javascript:alert(1)' },
            ] }],
        },
        featureSection: { title: '', items: [] },
        updateSection: { title: '', items: [] },
        supportMessage: '',
    });
    assert.doesNotMatch(rendered, /<script>|<img src=x>|javascript:/);
    assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(rendered, /&lt;img src=x&gt;/);
});

test('beta86 AMO source package includes Markdown content and its generator', async () => {
    const publishScript = await readFile(new URL('../scripts/publish-firefox-amo.sh', import.meta.url), 'utf8');
    assert.match(publishScript, /generate-release-content\.mjs/);
    assert.match(publishScript, /tar -cf - release-content/);
    assert.match(publishScript, /Node\.js 18\+/);
});

test('beta86 shell build generates release notes after any version bump', async () => {
    const buildScript = await readFile(new URL('../build.sh', import.meta.url), 'utf8');
    const versionWrite = buildScript.indexOf('sed -i');
    const generatorRun = buildScript.indexOf('generate-release-content.mjs');
    assert.ok(versionWrite >= 0 && generatorRun > versionWrite);
});

test('beta86 only release intro is manually maintained per release', async () => {
    const guide = await readFile(new URL('../release-content/README.md', import.meta.url), 'utf8');
    assert.match(guide, /唯一的日常手編檔/);
    assert.match(guide, /CHANGELOG\.md/);
    await assert.rejects(readFile(new URL('../release-content/feature-cards.md', import.meta.url), 'utf8'));
    await assert.rejects(readFile(new URL('../release-content/recent-updates.md', import.meta.url), 'utf8'));
});
