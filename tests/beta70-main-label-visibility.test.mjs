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

// Beta70: Main menu label text color must never be transparent
// When report queue is active but block queue is empty, mainItem.style.color
// should not be set to 'transparent' (which would make text invisible).
test('beta70 main-label-visibility keeps text visible when report queue active', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });

    const result = await page.evaluate(async () => {
        const { CONFIG } = await import('/config.js');
        const { Core } = await import('/core.js');
        const { Storage } = await import('/storage.js');

        // Create minimal DOM structure needed by updateControllerUI
        document.body.innerHTML = `
          <div id="hege-panel">
            <div id="hege-header" style="display: flex;">
              <div id="hege-main-btn-item" style="display: flex; align-items: center;">
                <span>開始封鎖</span>
                <span id="hege-queue-badge" class="status">(37 選取)</span>
              </div>
              <div id="hege-stop-btn-item" style="display: none;"></div>
            </div>
            <div id="hege-sel-count"></div>
            <div id="hege-history-count"></div>
            <div id="hege-report-count"></div>
          </div>
        `;

        // Mock Storage to simulate report queue active but block queue empty
        Storage.getJSON = (key, fallback) => {
            if (key === CONFIG.KEYS.BG_QUEUE) return []; // block queue empty
            if (key === CONFIG.KEYS.REPORT_QUEUE) return ['user1', 'user2']; // report queue active
            if (key === CONFIG.KEYS.BLOCK_DB) return [];
            if (key === CONFIG.KEYS.COOLDOWN_QUEUE) return [];
            if (key === CONFIG.KEYS.REPORT_BATCH_USERS) return [];
            if (key === CONFIG.KEYS.REPORT_COMPLETED_USERS) return [];
            if (key === CONFIG.KEYS.FAILED_QUEUE) return [];
            if (key === CONFIG.KEYS.REPORT_FAILED_QUEUE) return [];
            if (key === CONFIG.KEYS.BG_STATUS) return { state: 'idle', lastUpdate: Date.now() - 15000 };
            if (key === CONFIG.KEYS.COOLDOWN) return '0';
            return fallback;
        };

        Storage.get = (key, fallback) => {
            if (key === CONFIG.KEYS.EMERGENCY_MODE) return 'false';
            if (key === CONFIG.KEYS.DAILY_BLOCK_LIMIT) return '200';
            if (key === CONFIG.KEYS.WORKER_MODE) return 'block';
            return fallback;
        };

        // Mock to prevent storage access errors
        Storage.setSessionJSON = () => {};
        Storage.getBlockDB = () => [];
        Storage.getThreeNoScanResults = () => ({ users: [] });
        Storage.isThreeNoUserIgnored = () => false;
        Storage.isThreeNoUserSafe = () => false;
        Storage.getBlocksLast24h = () => 0;
        Storage.set = () => {};
        Storage.remove = () => {};

        // Initialize Core state
        Core.pendingUsers.clear();
        Core._stopVisibilityLatch = false;
        Core._selectionSnapshot.clear();
        Core._uiUpdatePending = null;
        Core._lastUIUpdate = 0;

        // Call updateControllerUI to trigger the scenario
        Core.updateControllerUI();

        const mainItem = document.getElementById('hege-main-btn-item');
        const computedColor = window.getComputedStyle(mainItem).color;

        return {
            mainItemColor: mainItem.style.color,
            mainItemComputedColor: computedColor,
            mainItemTextContent: mainItem.querySelector('span').textContent,
        };
    });

    await page.close();

    // Assertions: text color should NOT be 'transparent' or transparent-like
    assert.notEqual(
        result.mainItemColor,
        'transparent',
        'mainItem.style.color must not be set to "transparent" when report queue is active'
    );
});

console.log('beta70 main-label-visibility contract: text color fallback when headerColor is transparent');
