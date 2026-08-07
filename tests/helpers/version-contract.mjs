// - 相關：ADR 0013，beta 診斷閘門；tests/beta58-clean-list.test.mjs；tests/beta59-clean-list-live-fix.test.mjs

import assert from 'node:assert/strict';

const SUPPORTED_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-beta\d+)?$/i;

export const assertSupportedVersion = (version, label = 'CONFIG.VERSION') => {
    const normalized = String(version ?? '');
    assert.match(normalized, SUPPORTED_VERSION_PATTERN, `${label} 必須符合正式版或 beta 版的版本格式，目前是 ${normalized}`);
    return normalized;
};
