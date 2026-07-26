import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const moduleServer = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname.replace(/^\/+/, '');
    if (!relative.endsWith('.js') || relative.includes('..')) {
        response.writeHead(404);
        response.end();
        return;
    }
    try {
        const source = await readFile(new URL(`file://${srcRoot}/${relative}`));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*' });
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

test('checkbox SSOT keeps a BG_QUEUE-only account checked across dialog/UI passes', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/`);
    const result = await page.evaluate(async () => {
        const { CONFIG } = await import('/config.js');
        const { Storage } = await import('/storage.js');
        const { Utils } = await import('/utils.js');
        const { Core } = await import('/core.js');

        Storage.cache = {};
        Storage.sessionCache = {};
        Utils._myUsername = null;
        Storage.setJSON(CONFIG.KEYS.DB_KEY, []);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, ['queued']);
        Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});
        Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        Core.pendingUsers.clear();
        Core._selectionSnapshot.clear();
        Core._stopVisibilityLatch = false;
        Core._uiUpdatePending = null;

        document.body.innerHTML = `
            <div role="dialog" style="width:700px;height:400px">
                <h2 style="width:100px;height:24px">Followers</h2>
                <div role="listitem" style="display:flex;width:400px;height:60px">
                    <a href="/@queued" style="display:block;width:100px;height:30px">queued</a>
                </div>
            </div>`;

        const readQueuedState = (round, phase) => {
            const box = document.querySelector('.hege-checkbox-container[data-username="queued"]');
            return {
                round,
                phase,
                checked: box?.classList.contains('checked') === true,
                finished: box?.classList.contains('finished') === true,
                pending: box?.classList.contains('pending') === true,
            };
        };

        const states = [];
        for (let round = 0; round < 2; round += 1) {
            Core.injectDialogCheckboxes();
            states.push(readQueuedState(round + 1, 'after-inject'));

            Core._lastUIUpdate = 0;
            Core._uiUpdatePending = null;
            Core.updateControllerUI();
            states.push(readQueuedState(round + 1, 'after-update'));
        }

        const dbBox = document.createElement('div');
        dbBox.className = 'hege-checkbox-container checked pending';
        Storage.setJSON(CONFIG.KEYS.DB_KEY, ['finished']);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, ['finished']);
        const dbState = Core.resolveCheckboxState('finished');
        Core.applyCheckboxState(dbBox, dbState);

        const noneBox = document.createElement('div');
        noneBox.className = 'hege-checkbox-container checked finished pending';
        Storage.setJSON(CONFIG.KEYS.DB_KEY, []);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        Core.applyCheckboxState(noneBox, Core.resolveCheckboxState('none'));

        return {
            states,
            dbState: {
                state: dbState,
                checked: dbBox.classList.contains('checked'),
                finished: dbBox.classList.contains('finished'),
                pending: dbBox.classList.contains('pending'),
            },
            noneState: {
                state: Core.resolveCheckboxState('none'),
                checked: noneBox.classList.contains('checked'),
                finished: noneBox.classList.contains('finished'),
                pending: noneBox.classList.contains('pending'),
            },
        };
    });
    await page.close();

    assert.deepEqual(result.states, [
        { round: 1, phase: 'after-inject', checked: true, finished: false, pending: false },
        { round: 1, phase: 'after-update', checked: true, finished: false, pending: false },
        { round: 2, phase: 'after-inject', checked: true, finished: false, pending: false },
        { round: 2, phase: 'after-update', checked: true, finished: false, pending: false },
    ]);
    assert.deepEqual(result.dbState, { state: 'finished', checked: false, finished: true, pending: false });
    assert.deepEqual(result.noneState, { state: 'none', checked: false, finished: false, pending: false });
});

console.log('checkbox SSOT flicker regression: PASS');
