import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { diagnosticsEnabled, diagnosticsSkipReason } from './helpers/diagnostics-gate.mjs';

const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const moduleServer = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>beta63 owner policy fixture</title>');
        return;
    }
    const relative = pathname.replace(/^\/+/, '');
    if (!relative.endsWith('.js') || relative.includes('..')) {
        response.writeHead(404);
        response.end();
        return;
    }
    try {
        const source = await readFile(new URL(`file://${srcRoot}/${relative}`));
        response.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'access-control-allow-origin': '*',
        });
        response.end(source);
    } catch (_) {
        response.writeHead(404);
        response.end();
    }
});
await new Promise(resolve => moduleServer.listen(0, '127.0.0.1', resolve));
const moduleOrigin = `http://127.0.0.1:${moduleServer.address().port}`;

test.after(async () => {
    await browser.close();
    await new Promise(resolve => moduleServer.close(resolve));
});

const pageWithModules = async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => {
        await import('/core.js');
        await import('/features/post-reservoir-engine.js');
    });
    return page;
};

const likesDialog = (inner) => `
  <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
    <button role="tab" aria-selected="true">Likes</button>
    <div id="rows">${inner}</div>
  </div>`;

test('beta63 clean-list verified Likes keeps post owner as eligible', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, async () => {
    const page = await pageWithModules();
    const result = await page.evaluate(async (fixture) => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        RuntimeDiagnostics.clear();
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = fixture;
        const result = await Core.collectFullDialogUsers(document.querySelector('#dialog'), { label: 'beta63 clean-list' });
        const rows = RuntimeDiagnostics.export().entries
            .filter(entry => entry.feature === 'clean_list' && entry.stage === 'rows');
        return { result, rows };
    }, likesDialog('<a href="/@owner">owner</a>'));
    await page.close();
    assert.equal(result.result.complete, true);
    assert.equal(result.result.reason, 'end');
    assert.deepEqual(result.result.users, ['owner']);
    const ownerRows = result.rows.filter(entry => Object.prototype.hasOwnProperty.call(entry.fields, 'ownerSkippedCount'));
    assert.ok(ownerRows.length > 0);
    assert.equal(ownerRows.at(-1).fields.ownerSkippedCount, 0);
    assert.equal(ownerRows.at(-1).fields.eligibleCount, 1);
});

test('beta63 reservoir production path keeps post-owner exclusion and does not enqueue', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, async () => {
    const page = await pageWithModules();
    const result = await page.evaluate(async (fixture) => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        RuntimeDiagnostics.clear();
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = fixture;
        const batch = await Core.SweepDriver.collectBatch(document.querySelector('#dialog'));
        const rows = RuntimeDiagnostics.export().entries
            .filter(entry => entry.feature === 'reservoir' && entry.stage === 'rows');
        return { batch, rows, queue: JSON.parse(localStorage.getItem('hege_active_queue') || '[]') };
    }, likesDialog('<a href="/@owner">owner</a>'));
    await page.close();
    assert.deepEqual(result.batch.users, []);
    assert.equal(result.rows.at(-1)?.fields.ownerSkippedCount, 1);
    assert.equal(result.rows.at(-1)?.fields.eligibleCount, 0);
    assert.deepEqual(result.queue, []);
});

test('beta63 clean-list continues to skip self and reply target', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, async () => {
    const page = await pageWithModules();
    const result = await page.evaluate(async ({ selfHtml, replyHtml }) => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        const run = async (html) => {
            RuntimeDiagnostics.clear();
            localStorage.clear();
            sessionStorage.clear();
            document.body.innerHTML = html;
            const result = await Core.collectFullDialogUsers(document.querySelector('#dialog'), { label: 'beta63 skip' });
            return { result, rows: RuntimeDiagnostics.export().entries.filter(entry => entry.feature === 'clean_list' && entry.stage === 'rows') };
        };
        const self = await run(selfHtml);
        const reply = await run(replyHtml);
        return { self, reply };
    }, {
        selfHtml: `<nav><a href="/@self" aria-label="Profile"></a></nav>${likesDialog('<a href="/@self">self</a>')}`,
        replyHtml: likesDialog('<span>Replying to @reply </span><a href="/@reply">reply</a>'),
    });
    await page.close();
    assert.deepEqual(result.self.result.users, []);
    assert.equal(result.self.result.counts.selfSkippedCount, 1);
    assert.equal(result.self.result.counts.ownerSkippedCount, 0);
    assert.equal(result.reply.result.users.length, 0);
    assert.equal(result.reply.result.counts.replySkippedCount, 1);
    assert.equal(result.reply.result.counts.ownerSkippedCount, 0);
});

test('beta63 Quotes and unverified contexts remain fail-closed', async () => {
    const page = await pageWithModules();
    const result = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        const { DialogCollector } = await import('/dialog-collector.js');
        RuntimeDiagnostics.clear();
        localStorage.clear();
        sessionStorage.clear();
        document.body.innerHTML = `<div id="dialog" role="dialog"><button role="tab" aria-selected="true">Quotes</button><a href="/@quoted">quoted</a></div>`;
        const quotes = await Core.collectFullDialogUsers(document.querySelector('#dialog'), { label: 'beta63 quotes' });
        document.body.innerHTML = `<div id="unverified" role="dialog"><a href="/@unverified">unverified</a></div>`;
        const state = DialogCollector.createState();
        DialogCollector.collectVisible(document.querySelector('#unverified'), state, {
            verifiedLikesContext: false, classificationStrategy: 'unknown', allowVerifiedLikesAnchorFallback: true,
        });
        return { quotes, unverified: { users: DialogCollector.usersFromState(state), unknownRows: state.unknownRows } };
    });
    await page.close();
    assert.equal(result.quotes.complete, false);
    assert.equal(result.quotes.users.length, 0);
    assert.equal(result.quotes.reason, 'likes_tab_not_identified');
    assert.deepEqual(result.unverified, { users: [], unknownRows: 1 });
});

console.log('beta63 owner policy contract: clean-list includes owner; reservoir excludes owner; self/reply and unverified/Quotes remain fail-closed');
