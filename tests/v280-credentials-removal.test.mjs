import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('v280 credentials removal source graph has no MAIN-world bridge or interceptor', () => {
    const manifest = JSON.parse(read('src/manifest.json'));
    assert.equal(manifest.content_scripts.some(entry => entry.world === 'MAIN'), false);
    assert.equal(manifest.content_scripts.some(entry => entry.js?.includes('page-bridge.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/page-bridge.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/interceptor.js')), false);
    assert.doesNotMatch(read('build.sh'), /page-bridge\.js/);
});

test('v280 credentials removal leaves reporter scrub canaries but no runtime capture path', () => {
    const runtime = [
        read('src/config.js'),
        read('src/storage.js'),
        read('src/main.js'),
        read('src/features/three-no-watch.js'),
        read('src/ui.js'),
    ].join('\n');
    for (const marker of [
        'credentials-processing-v1',
        'hege:threads-credentials-processing-consent',
        'hege:threads-about-profile-fetch-request',
        'window.fetch =',
        'XMLHttpRequest.prototype',
        'showCredentialsConsentModal',
        'hege-s-credentials-consent',
        'Chrome 加速三無',
        '認證欄位處理同意',
        '本機暫時處理認證欄位',
        '另一個醒目視窗',
    ]) assert.doesNotMatch(runtime, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const reporter = read('src/reporter.js');
    assert.match(reporter, /fb_dtsg|jazoest|cookie/i);
    assert.match(reporter, /scrubSensitive(?:Text|Data)/);
});

test('v280 boot purge removes exactly six legacy credentials keys and preserves report ID', () => {
    const main = read('src/main.js');
    for (const key of [
        'hege_three_no_accelerated_profile_enabled',
        'hege_credentials_processing_consent',
        'hege_credentials_processing_consent_version',
        'hege_three_no_profile_metadata_cache_v1',
        'hege_three_no_profile_user_id_cache_v1',
        'hege_three_no_about_request_template_v1',
    ]) assert.match(main, new RegExp(`'${key}'`));
    assert.match(main, /forEach\(key => Storage\.remove\(key\)\)/);
    assert.doesNotMatch(main, /['"]hege_hwid['"]\s*[,\]]/);
    assert.match(main, /purgeInactiveThreeNoDebugLog/);
});
