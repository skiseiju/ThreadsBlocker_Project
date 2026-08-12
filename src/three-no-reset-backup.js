// 三無重置備份保留政策；由 ADR 0023 管理。
// 相關：[ADR 0023](../docs/adr/0023-three-no-storage-quota-resilience.md)（重置備份清理）、`src/main.js`
import { THREE_NO_RESET_BACKUP_MAX_COUNT, THREE_NO_RESET_BACKUP_PREFIX, THREE_NO_RESET_BACKUP_RETENTION_MS } from './config.js';

const storageKeys = (storage) => {
    if (!storage) return [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
        const keys = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key !== null && key !== undefined) keys.push(String(key));
        }
        return keys;
    }
    return Object.keys(storage);
};

export const pruneThreeNoResetBackups = (storage = globalThis.localStorage, now = Date.now()) => {
    try {
        const backups = storageKeys(storage)
            .filter(key => key.startsWith(THREE_NO_RESET_BACKUP_PREFIX))
            .map(key => ({
                key,
                createdAt: Number(key.slice(THREE_NO_RESET_BACKUP_PREFIX.length)) || 0,
            }))
            .sort((left, right) => right.createdAt - left.createdAt);
        if (backups.length === 0) return { removed: 0, retainedKey: null };

        const latest = backups[0];
        const latestExpired = latest.createdAt <= 0
            || Number(now) - latest.createdAt > THREE_NO_RESET_BACKUP_RETENTION_MS;
        const retained = latestExpired ? null : latest.key;
        const toRemove = latestExpired
            ? backups
            : backups.slice(THREE_NO_RESET_BACKUP_MAX_COUNT);
        toRemove.forEach(({ key }) => storage.removeItem(key));
        return { removed: toRemove.length, retainedKey: retained };
    } catch (_) {
        return { removed: 0, retainedKey: null };
    }
};
