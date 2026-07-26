import { CONFIG } from '../../src/config.js';

// Keep this expression identical to the product diagnostics gate.  Reading
// CONFIG at module load means stable and beta reverse runs use the real build
// version without a test-only version policy.
export const diagnosticsEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS === true
    && /-beta\d+$/i.test(String(CONFIG.VERSION || ''));

export const diagnosticsSkipReason = 'stable build 停用 beta diagnostics';
