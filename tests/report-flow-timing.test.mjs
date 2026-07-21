import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8');

assert.match(source, /const REPORT_MENU_TIMEOUT_MS = 8000;/, 'report menu must use the block worker 8s timeout');
assert.match(source, /const REPORT_MENU_RETRY_AFTER_MS = 3000;/, 'report menu must retry after the block worker 3s threshold');
assert.match(source, /const REPORT_OPTION_TIMEOUT_MS = 8000;/, 'report path options must tolerate slow dialog loading');
assert.match(
    source,
    /if \(!reportMenuClickRetried && Date\.now\(\) - reportMenuStartedAt > REPORT_MENU_RETRY_AFTER_MS\)/,
    'report menu retry must be guarded to run once'
);
assert.match(
    source,
    /document\.querySelectorAll\('div\[role="menuitem"\]'\)/,
    'report retry must not toggle an already-open native menu closed'
);
assert.match(source, /\}, REPORT_MENU_TIMEOUT_MS, 150\);/, 'report item polling must use the shared menu timeout');
assert.match(source, /\}, REPORT_OPTION_TIMEOUT_MS, 150\);/, 'report path polling must use the slow-load timeout');

console.log('report flow timing regression: PASS menu=8s retry=3s-once options=8s');
