export const CONFIG = {
    VERSION: '2.6.0-beta37', // Beta
    UNBLOCK_PREFIX: 'UNBLOCK:',

    BUG_REPORT_URL: 'https://threadsblocker-bug-admin.skiseiju.workers.dev/api/v1/reports/bug',
    BUG_REPORT_FALLBACK_URLS: [
        'https://app.skiseiju.com/api/v1/reports/bug',
        'https://script.google.com/macros/s/AKfycbxZ1cdDUST_8x2gpsYcV6gCENLqpxnb53VTaXW6MaeGV8Mbh8rcrDz9rYJkqwlYWeY4/exec'
    ],// 可填入 GAS 或其他備援端點
    BUG_REPORT_SALT: 'PGO_BETA_2026_SALT',
    PLATFORM_UPLOAD_URL: 'https://threadsblocker-bug-admin.skiseiju.workers.dev/api/v1/platform/ingest',
    PLATFORM_UPLOAD_FALLBACK_URLS: ['https://app.skiseiju.com/api/v1/platform/ingest'],

    DEBUG_MODE: false,

    // 速度模式：'smart' | 'stable' | 'standard' | 'turbo'
    SPEED_PROFILES: {
        smart:    { label: '🧠 智慧模式', multiplier: 1.0, usePolling: true,  warnOnSelect: false },
        stable:   { label: '🛡️ 穩定模式', multiplier: 1.5, usePolling: false, warnOnSelect: false },
        standard: { label: '⚡ 標準模式', multiplier: 1.0, usePolling: false, warnOnSelect: false },
        turbo:    { label: '🚀 加速模式', multiplier: 0.4, usePolling: true,  warnOnSelect: true, forceVerify: true },
    },
    
    DAILY_LIMIT_DEFAULT: 200,
    DAILY_LIMIT_OPTIONS: [50, 100, 150, 200, 250, 300],
    DAILY_REPORT_LIMIT_DEFAULT: 300,
    DAILY_REPORT_LIMIT_OPTIONS: [100, 150, 200, 300, 500],
    
    // 深層貼文收割常數 (Task 4)
    POST_SWEEP_BATCH_SIZE: 500,
    POST_SWEEP_COOLDOWN_HOURS: 8,

    // 貼文水庫 SPA polling 時序（毫秒；單位 ms = millisec）
    SWEEP_POLL_INTERVAL_MS: 500,        // 每次 polling 等待間隔
    SWEEP_POLL_FIND_LINK_TIMES: 60,     // 找按讚連結最大重試次數 (60 × 500 = 30s)
    SWEEP_POLL_DIALOG_TIMES: 20,        // 等 dialog 出現最大重試次數 (20 × 500 = 10s)
    SWEEP_POLL_LIKES_TAB_TIMES: 40,     // 等 Likes tab 出現最大重試次數 (40 × 500 = 20s)
    SWEEP_POLL_USER_LINKS_TIMES: 40,    // 等 user 連結載入最大重試次數 (40 × 500 = 20s)
    SWEEP_POLL_ACTIVITY_TIMES: 60,      // 找 Activity 按鈕最大重試次數 (60 × 500 = 30s)
    SWEEP_DIALOG_OPEN_DELAY_MS: 800,    // Activity click 後等 dialog 開的固定延遲
    SWEEP_LAZY_SCROLL_AT: [5, 15, 25],  // 等 user 連結時觸發 lazy scroll 的 retry 次數

    // 定點絕批次設定 (Task 3)
    ENDLESS_BATCH_SIZE: 100,
    ENDLESS_COOLDOWN_SEC: 8 * 3600,

    KEYS: {
        DB_KEY: 'hege_block_db_v1',
        PENDING: 'hege_pending_users',
        BG_STATUS: 'hege_bg_status',
        BG_QUEUE: 'hege_active_queue',
        BG_CMD: 'hege_bg_command',
        WORKER_MODE: 'hege_worker_mode',
        COOLDOWN: 'hege_rate_limit_until',
        COOLDOWN_PROTECTION_ENABLED: 'hege_cooldown_protection_enabled',
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
        SWEEP_BATCH_SIZE: 'hege_sweep_batch_size',

        // Meta 每日安全上限
        DAILY_BLOCK_LIMIT: 'hege_daily_block_limit',
        EMERGENCY_MODE: 'hege_emergency_mode',
        BLOCK_VISUAL_DEBUG: 'hege_block_visual_debug',
        BLOCK_TIMESTAMPS_RING: 'hege_block_timestamps_ring',
        REPORT_QUEUE: 'hege_report_queue',
        REPORT_PATH: 'hege_report_path',
        REPORT_BATCH_PATH: 'hege_report_batch_path',
        REPORT_CONTEXT: 'hege_report_context',
        DAILY_REPORT_LIMIT: 'hege_daily_report_limit',
        REPORT_TIMESTAMPS_RING: 'hege_report_timestamps_ring',
        REPORT_VISUAL_DEBUG: 'hege_report_visual_debug',
        REPORT_BATCH_USERS: 'hege_report_batch_users',
        REPORT_COMPLETED_USERS: 'hege_report_completed_users',
        REPORT_HISTORY: 'hege_report_history',
        SOURCE_EVIDENCE_INDEX: 'hege_source_evidence_index',
        SOURCE_EVIDENCE_PRUNE_AT: 'hege_source_evidence_prune_at',
        ANALYTICS_SHOW_ADVANCED: 'hege_analytics_show_advanced',
        PLATFORM_UPLOAD_URL_OVERRIDE: 'hege_platform_upload_url_override',
        REPORT_KEEP_BLOCK_SELECTION: 'hege_report_keep_block_selection',
        REPORT_RESTORE_PENDING: 'hege_report_restore_pending',
        
        // Task 2: 大蟑螂
        COCKROACH_DB: 'hege_cockroach_db_v1',
        AUTO_MARK_LEADER: 'hege_auto_mark_leader',
        
        // Task 3: 進階同列全封
        ADVANCED_SCROLL_ENABLED: 'hege_advanced_scroll_enabled',

        // GraphQL API 深度挖掘
        GRAPHQL_DOC_ID: 'hege_graphql_likers_doc_id',

        // 貼文深層收割
        POST_QUEUE: 'hege_post_sweep_queue',
        POST_QUEUE_BACKUP_PHASE2: 'hege_post_sweep_queue_backup_phase2',
        RESERVOIR_PHASE2_MIGRATED: 'hege_post_reservoir_phase2_migrated',

        // Task 3: 定點絕停止旗標
        ENDLESS_STOPPED: 'hege_endless_stopped',

        // Task 3: 定點絕多貼文排程（deprecated：Phase 2 migration 讀取用）
        ENDLESS_POST_QUEUE: 'hege_endless_post_queue',

        // Task 3: 定點絕歷史紀錄
        ENDLESS_HISTORY: 'hege_endless_history',

        // 封鎖 context metadata（worker 啟動前由 core 寫入）
        BLOCK_CONTEXT: 'hege_block_context',
        CURRENT_BATCH_ID: 'hege_current_batch_id',
        BLOCK_CONTEXT_MAP: 'hege_block_context_map',

        // 定點絕 worker 待命旗標（'true' 字串）
        ENDLESS_WORKER_STANDBY: 'hege_endless_worker_standby',

    },

    // 跨分頁同步 & 輪詢 invalidate 用的 queue/status key 群組
    SYNC_KEYS: [
        'hege_bg_status',          // BG_STATUS
        'hege_worker_mode',        // WORKER_MODE
        'hege_block_db_v1',        // DB_KEY
        'hege_active_queue',       // BG_QUEUE
        'hege_rate_limit_until',   // COOLDOWN
        'hege_cooldown_queue',     // COOLDOWN_QUEUE
        'hege_failed_queue',       // FAILED_QUEUE
        'hege_post_sweep_queue',   // POST_QUEUE
        'hege_endless_post_queue', // ENDLESS_POST_QUEUE
        'hege_sweep_worker_standby',
        'hege_sweep_stopped',
        'hege_block_timestamps',   // DB_TIMESTAMPS
        'hege_block_timestamps_ring', // BLOCK_TIMESTAMPS_RING
        'hege_block_context_map', // BLOCK_CONTEXT_MAP
        'hege_block_visual_debug', // BLOCK_VISUAL_DEBUG
        'hege_report_queue',        // REPORT_QUEUE
        'hege_report_batch_path',   // REPORT_BATCH_PATH
        'hege_report_context',      // REPORT_CONTEXT
        'hege_report_timestamps_ring', // REPORT_TIMESTAMPS_RING
        'hege_report_visual_debug', // REPORT_VISUAL_DEBUG
        'hege_report_batch_users',   // REPORT_BATCH_USERS
        'hege_report_completed_users', // REPORT_COMPLETED_USERS
        'hege_report_history', // REPORT_HISTORY
        'hege_source_evidence_index', // SOURCE_EVIDENCE_INDEX
        'hege_source_evidence_prune_at', // SOURCE_EVIDENCE_PRUNE_AT
        'hege_report_keep_block_selection', // REPORT_KEEP_BLOCK_SELECTION
        'hege_report_restore_pending', // REPORT_RESTORE_PENDING
    ],
    // 多語系文字偵測（20 國：繁中/簡中/英/日/韓/泰/印尼/西/法/德/義/葡/俄/波蘭/土耳其/越南/阿拉伯/印地/荷蘭/菲律賓）
    BLOCK_TEXTS: ['封鎖', '屏蔽', 'Block', 'ブロック', '차단', 'บล็อก', 'Blokir', 'Bloquear', 'Bloquer', 'Blockieren', 'Blocca', 'Bloquear', 'Заблокировать', 'Zablokuj', 'Engelle', 'Chặn', 'حظر', 'ब्लॉक करें', 'Blokkeren', 'I-block'],
    UNBLOCK_TEXTS: ['解除封鎖', '取消屏蔽', 'Unblock', 'ブロックを解除', '차단 해제', 'เลิกบล็อก', 'Buka blokir', 'Desbloquear', 'Débloquer', 'Blockierung aufheben', 'Sblocca', 'Desbloquear', 'Разблокировать', 'Odblokuj', 'Engeli kaldır', 'Bỏ chặn', 'إلغاء الحظر', 'अनब्लॉक करें', 'Deblokkeren', 'I-unblock'],

    // 「讚」對話框標題
    LIKES_TEXTS: ['讚', '赞', 'Likes', 'いいね', '좋아요', 'ถูกใจ', 'Suka', 'Me gusta', 'J\'aime', 'Gefällt mir', 'Mi piace', 'Curtidas', 'Нравится', 'Polubienia', 'Beğeni', 'Thích', 'إعجابات', 'पसंद', 'Vind-ik-leuks', 'Mga Like'],
    // 「引用」對話框標題
    QUOTES_TEXTS: ['引用', '引用', 'Quotes', '引用', '인용', 'การอ้างอิง', 'Kutipan', 'Citas', 'Citations', 'Zitate', 'Citazioni', 'Citações', 'Цитаты', 'Cytaty', 'Alıntılar', 'Trích dẫn', 'اقتباسات', 'उद्धरण', 'Citaten', 'Mga Quote'],
    // 「轉發」對話框標題
    REPOSTS_TEXTS: ['轉發', '转发', 'Reposts', '再投稿', '리포스트', 'รีโพสต์', 'Repost', 'Republicaciones', 'Republications', 'Reposts', 'Ripubblicazioni', 'Republicações', 'Репосты', 'Reposty', 'Yeniden paylaşımlar', 'Đăng lại', 'إعادة النشر', 'रीपोस्ट', 'Reposts', 'Mga Repost'],
    // 「活動/查看動態」按鈕
    ACTIVITY_TEXTS: ['查看動態', '查看动态', 'View activity', '活動', 'Activity', 'アクティビティを見る', 'アクティビティ', '활동 보기', '활동', 'ดูกิจกรรม', 'กิจกรรม', 'Lihat aktivitas', 'Aktivitas', 'Ver actividad', 'Actividad', 'Voir l\'activité', 'Activité', 'Aktivität ansehen', 'Aktivität', 'Visualizza attività', 'Attività', 'Ver atividade', 'Atividade', 'Посмотреть активность', 'Активность', 'Zobacz aktywność', 'Aktywność', 'Etkinliği gör', 'Etkinlik', 'Xem hoạt động', 'Hoạt động', 'عرض النشاط', 'النشاط', 'गतिविधि देखें', 'गतिविधि', 'Activiteit bekijken', 'Activiteit', 'Tingnan ang aktibidad', 'Aktibidad'],
    // 「按讚內容」分頁
    LIKES_TAB_TEXTS: ['按讚內容', '点赞内容', 'Likes', '讚', '赞', 'いいね', '좋아요', 'ถูกใจ', 'Suka', 'Me gusta', 'J\'aime', 'Gefällt mir', 'Mi piace', 'Curtidas', 'Нравится', 'Polubienia', 'Beğeni', 'Thích', 'إعجابات', 'पसंद', 'Vind-ik-leuks', 'Mga Like'],
    // 對話框標題關鍵字（判斷是否為互動面板）
    DIALOG_HEADER_TEXTS: ['讚', '赞', '引用', '轉發', '转发', '貼文動態', '帖子动态', '活動', '活动', 'Likes', 'Quotes', 'Reposts', 'Activity', 'いいね', '引用', '再投稿', 'アクティビティ', '좋아요', '인용', '리포스트', '활동', 'ถูกใจ', 'การอ้างอิง', 'รีโพสต์', 'กิจกรรม', 'Suka', 'Kutipan', 'Repost', 'Aktivitas', 'Me gusta', 'Citas', 'Republicaciones', 'Actividad', 'J\'aime', 'Citations', 'Activité', 'Gefällt mir', 'Zitate', 'Aktivität', 'Mi piace', 'Citazioni', 'Attività', 'Curtidas', 'Citações', 'Republicações', 'Atividade', 'Нравится', 'Цитаты', 'Репосты', 'Активность', 'Polubienia', 'Cytaty', 'Aktywność', 'Beğeni', 'Alıntılar', 'Etkinlik', 'Thích', 'Trích dẫn', 'Đăng lại', 'Hoạt động', 'إعجابات', 'اقتباسات', 'إعادة النشر', 'النشاط', 'पसंद', 'उद्धरण', 'रीपोस्ट', 'गतिविधि', 'Vind-ik-leuks', 'Citaten', 'Activiteit', 'Mga Like', 'Mga Quote', 'Mga Repost', 'Aktibidad'],

    SELECTORS: {
        MORE_SVG: 'svg[aria-label="更多"], svg[aria-label="更多"], svg[aria-label="More"], svg[aria-label="もっと見る"], svg[aria-label="더 보기"], svg[aria-label="เพิ่มเติม"], svg[aria-label="Lainnya"], svg[aria-label="Más"], svg[aria-label="Plus"], svg[aria-label="Mehr"], svg[aria-label="Altro"], svg[aria-label="Mais"], svg[aria-label="Ещё"], svg[aria-label="Więcej"], svg[aria-label="Diğer"], svg[aria-label="Thêm"], svg[aria-label="المزيد"], svg[aria-label="और"], svg[aria-label="Meer"], svg[aria-label="Higit pa"]',
        MENU_ITEM: 'div[role="menuitem"], div[role="button"]',
        DIALOG: 'div[role="dialog"]',
        DIALOG_HEADER: 'div[role="dialog"] h1',
        DIALOG_USER_LINK: 'div[role="dialog"] div.html-div a[href^="/@"]',
    },

    REPORT_MENU_TREE: {
        '這是垃圾訊息': null,
        '霸凌或擾人的聯繫': {
            '威脅分享裸照': { ageQuestion: true },
            '霸凌或騷擾': {
                '我': { ageQuestion: true },
                '朋友': { ageQuestion: true },
                '我不認識對方': { ageQuestion: true },
            },
            '垃圾訊息': null,
        },
        '暴力、仇恨或剝削': {
            '對安全構成具體威脅': null,
            '疑似為恐怖主義或組織犯罪': null,
            '似乎涉及剝削': {
                '人口販運': null,
                '似乎涉及性剝削': { ageQuestion: true },
            },
            '仇恨言論或象徵符號': null,
            '煽動暴力': null,
            '展示暴力、死亡或重傷畫面': null,
            '虐待動物': null,
        },
        '裸露或性行為': {
            '威脅分享裸照': { ageQuestion: true },
            '似乎涉及賣淫': null,
            '似乎涉及性剝削': { ageQuestion: true },
            '裸露或性行為': null,
        },
        '詐騙或詐欺': {
            '金融或投資詐騙': null,
            '身分盜用': null,
            '銷售虛假商品或服務': null,
            '生理或心理威脅': null,
            '可疑或擾人的聯繫': null,
            '可疑連結': null,
            '我想減少看到這類內容': null,
        },
    }
};
