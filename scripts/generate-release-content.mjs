#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const checkOnly = process.argv.includes('--check');
const paths = {
    intro: join(repoRoot, 'release-content', 'release-intro.md'),
    changelog: join(repoRoot, 'CHANGELOG.md'),
    config: join(repoRoot, 'src', 'config.js'),
    releaseModule: join(repoRoot, 'src', 'release-notes.js'),
};

const fail = message => { throw new Error(`[release-content] ${message}`); };
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').trim();
const requireText = (value, label, max = 4000) => {
    const text = clean(value);
    if (!text) fail(`${label} must not be empty`);
    if (text.length > max) fail(`${label} exceeds ${max} characters`);
    return text;
};
const requireHttpUrl = (value, label) => {
    const text = requireText(value, label, 1000);
    let parsed;
    try { parsed = new URL(text); } catch (_) { fail(`${label} must be a valid URL`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${label} must use http or https`);
    return text;
};

async function readText(path, label) {
    try { return clean(await readFile(path, 'utf8')); }
    catch (err) { fail(`${label} cannot be read: ${err.message}`); }
}

function headingOne(markdown, label) {
    const match = markdown.match(/^# (.+)$/m);
    return requireText(match?.[1], `${label} title`, 200);
}

function parseInline(text, label) {
    const source = clean(text);
    const segments = [];
    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let cursor = 0;
    let match;
    while ((match = linkPattern.exec(source))) {
        if (match.index > cursor) segments.push({ text: source.slice(cursor, match.index) });
        segments.push({
            label: requireText(match[1], `${label} link label`, 160),
            url: requireHttpUrl(match[2], `${label} link URL`),
        });
        cursor = linkPattern.lastIndex;
    }
    if (cursor < source.length) segments.push({ text: source.slice(cursor) });
    if (segments.length === 0 && source) segments.push({ text: source });
    return segments;
}

function parseIntro(markdown) {
    const supportMarker = '\n## 支持訊息\n';
    const markerIndex = markdown.indexOf(supportMarker);
    if (markerIndex < 0) fail('release-intro.md requires a "## 支持訊息" section');
    const noticePart = markdown.slice(0, markerIndex).trim();
    const supportMessage = requireText(markdown.slice(markerIndex + supportMarker.length), 'support message');
    const title = headingOne(noticePart, 'release-intro.md');
    const body = noticePart.replace(/^# .+$/m, '').trim();
    const paragraphs = body.split(/\n\s*\n/).map(clean).filter(Boolean).map((paragraph, index) => ({
        segments: parseInline(paragraph, `release-intro paragraph ${index + 1}`),
    }));
    if (paragraphs.length === 0 || paragraphs.length > 8) fail('release-intro.md must have 1-8 paragraphs');
    return { developerNotice: { title, paragraphs }, supportMessage };
}

function compareVersions(left, right) {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return b[index] - a[index];
    }
    return 0;
}

function parseStableReleases(changelog) {
    const headings = [...changelog.matchAll(/^## v(\d+\.\d+\.\d+)\s+—\s+(.+)$/gm)];
    return headings.map((match) => {
        const bodyStart = match.index + match[0].length;
        const nextHeading = changelog.indexOf('\n## ', bodyStart);
        const bodyEnd = nextHeading >= 0 ? nextHeading : changelog.length;
        const body = changelog.slice(bodyStart, bodyEnd);
        const bullets = body.split('\n').map(line => line.match(/^\*\s+(.*)$/)?.[1]).filter(Boolean);
        const normalized = bullets.map(line => line.replace(/^\*\*(.*?)\*\*$/, '$1').trim());
        const summary = normalized.find(line => /^TL;DR[：:]/.test(line))?.replace(/^TL;DR[：:]\s*/, '') || '';
        const details = bullets.map((line) => {
            const matchDetail = line.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
            return matchDetail ? { title: clean(matchDetail[1]), body: clean(matchDetail[2]) } : null;
        }).filter(Boolean);
        return {
            version: match[1],
            heading: clean(match[2]),
            summary: clean(summary),
            details,
        };
    });
}

const intro = parseIntro(await readText(paths.intro, 'release-intro.md'));
const configSource = await readText(paths.config, 'src/config.js');
const runtimeVersion = requireText(configSource.match(/VERSION:\s*'([^']+)'/)?.[1], 'CONFIG.VERSION', 40);
const releaseVersion = requireText(runtimeVersion.match(/^(\d+\.\d+\.\d+)/)?.[1], 'release version', 40);
const releases = parseStableReleases(await readText(paths.changelog, 'CHANGELOG.md'));
const currentRelease = releases.find(release => release.version === releaseVersion);
if (!currentRelease) fail(`CHANGELOG.md requires a stable "## v${releaseVersion} — ..." section before build`);
if (!currentRelease.summary) fail(`CHANGELOG.md v${releaseVersion} requires a TL;DR bullet`);
const recentReleases = releases
    .filter(release => compareVersions(release.version, releaseVersion) >= 0 && release.summary)
    .sort((left, right) => compareVersions(left.version, right.version))
    .slice(0, 4);

const releaseNotes = {
    schemaVersion: 1,
    releaseVersion,
    developerNotice: intro.developerNotice,
    updateSection: {
        title: '最近更新',
        items: recentReleases.map((release) => {
            const versionPrefix = new RegExp(`^${release.version.replaceAll('.', '\\.') }\\s*(?:正式版)?\\s*`);
            return { version: release.version, text: release.summary.replace(versionPrefix, '') };
        }),
    },
    supportMessage: intro.supportMessage,
};
const generatedHeader = '// Generated by scripts/generate-release-content.mjs. Edit release-content/release-intro.md, CHANGELOG.md, or src/config.js instead.\n';
const expected = `${generatedHeader}export const BUNDLED_RELEASE_NOTES = ${JSON.stringify(releaseNotes, null, 4)};\n`;
let current = '';
try { current = await readFile(paths.releaseModule, 'utf8'); } catch (_) {}
if (current !== expected) {
    if (checkOnly) fail('generated file is stale: src/release-notes.js; run node scripts/generate-release-content.mjs');
    await writeFile(paths.releaseModule, expected);
    process.stdout.write('[release-content] generated src/release-notes.js\n');
}
if (checkOnly) process.stdout.write('[release-content] generated files are current\n');
