export const CONFIG = {
    VERSION: '2.5.0-beta2', // Official Beta Release
    UNBLOCK_PREFIX: 'UNBLOCK:',

    BUG_REPORT_URL: 'https://script.google.com/macros/s/AKfycbxZ1cdDUST_8x2gpsYcV6gCENLqpxnb53VTaXW6MaeGV8Mbh8rcrDz9rYJkqwlYWeY4/exec',
    BUG_REPORT_SALT: 'PGO_BETA_2026_SALT',

    DEBUG_MODE: false,

    // 速度模式：'smart' | 'stable' | 'standard' | 'turbo'
    SPEED_PROFILES: {
        smart:    { label: '🧠 智慧模式', multiplier: 1.0, usePolling: true,  warnOnSelect: false },
        stable:   { label: '🛡️ 穩定模式', multiplier: 1.5, usePolling: false, warnOnSelect: false },
        standard: { label: '⚡ 標準模式', multiplier: 1.0, usePolling: false, warnOnSelect: false },
        turbo:    { label: '🚀 加速模式', multiplier: 0.4, usePolling: true,  warnOnSelect: true, forceVerify: true },
    },
    
    // 延時封鎖常數 (Task 1)
    DELAY_HOURS: 8,
    MAX_BLOCKS_PER_BATCH: 100,
    
    // 深層貼文收割常數 (Task 4)
    POST_SWEEP_BATCH_SIZE: 5, // TEST: 5 人/批（正式版改回 500）
    POST_SWEEP_COOLDOWN_HOURS: (1 / 60), // TEST: 1 分鐘冷卻（正式版改回 8）

    KEYS: {
        DB_KEY: 'hege_block_db_v1',
        PENDING: 'hege_pending_users',
        BG_STATUS: 'hege_bg_status',
        BG_QUEUE: 'hege_active_queue',
        BG_CMD: 'hege_bg_command',
        COOLDOWN: 'hege_rate_limit_until',
        POST_FALLBACK: 'hege_post_fallback',
        WORKER_STATS: 'hege_worker_stats',
        CONSOLE_LOGS: 'hege_web_console_logs',
        VERSION_CHECK: 'hege_version_check',
        POS: 'hege_panel_pos',
        STATE: 'hege_panel_state',
        DISCLAIMER_AGREED: 'hege_disclaimer_agreed_v2_1',
        FAILED_QUEUE: 'hege_failed_queue',
        COOLDOWN_QUEUE: 'hege_cooldown_queue',
        DB_TIMESTAMPS: 'hege_block_timestamps',
        VERIFY_PENDING: 'hege_verify_pending',
        DEBUG_LOG: 'hege_debug_log',
        SPEED_MODE: 'hege_speed_mode',
        DIAG_LOG: 'hege_diag_log',
        TURBO_WARNED: 'hege_turbo_warned',
        BATCH_VERIFY: 'hege_batch_verify',
        
        // Task 1: 延時封鎖
        DELAYED_QUEUE: 'hege_delayed_queue',
        DELAYED_BLOCK_ENABLED: 'hege_delayed_block_enabled',
        LAST_BATCH_TIME: 'hege_last_batch_time',
        
        // Task 2: 大蟑螂
        COCKROACH_DB: 'hege_cockroach_db_v1',
        
        // Task 3: 進階同列全封
        ADVANCED_SCROLL_ENABLED: 'hege_advanced_scroll_enabled',

        // GraphQL API 深度挖掘
        GRAPHQL_DOC_ID: 'hege_graphql_likers_doc_id',

        // 貼文深層收割
        POST_QUEUE: 'hege_post_sweep_queue'
    },
    // 多語系封鎖/解除封鎖文字偵測（含：中/英/西/法/德/義/日/韓/印尼/俄/波蘭/土耳其）
    BLOCK_TEXTS: ['封鎖', 'Block', 'Bloquear', 'Bloquer', 'Blockieren', 'Blocca', 'ブロック', '차단', 'Blokir', 'Заблокировать', 'Zablokuj', 'Engelle'],
    UNBLOCK_TEXTS: ['解除封鎖', 'Unblock', 'Desbloquear', 'Débloquer', 'Blockierung aufheben', 'Sblocca', 'ブロックを解除', '차단 해제', 'Buka blokir', 'Разблокировать', 'Odblokuj', 'Engeli kaldır'],

    SELECTORS: {
        MORE_SVG: 'svg[aria-label="更多"], svg[aria-label="More"], svg[aria-label="もっと見る"], svg[aria-label="더 보기"], svg[aria-label="Más"], svg[aria-label="Plus"], svg[aria-label="Mehr"], svg[aria-label="Altro"], svg[aria-label="Lainnya"], svg[aria-label="Ещё"]',
        MENU_ITEM: 'div[role="menuitem"], div[role="button"]',
        DIALOG: 'div[role="dialog"]',
        DIALOG_HEADER: 'div[role="dialog"] h1',
        DIALOG_USER_LINK: 'div[role="dialog"] div.html-div a[href^="/@"]',
    }
};
