const CATEGORY_PATTERNS = [
    { category: '性騷擾指控', pattern: /MeToo|性騷|指控|性侵|申訴/i },
    { category: '罷免案', pattern: /罷免|連署|投票日|門檻|罷韓|罷王|罷柯|罷黃/i },
    { category: '國會事件', pattern: /立法院|院會|委員會|表決|三讀|修法|國會/i },
    { category: '政黨動態', pattern: /國民黨|民進黨|民眾黨|聲明|記者會|主席|黨團/i },
    { category: '性別爭議', pattern: /性別|婦女|平權|跨性別|生理/i },
    { category: '娛樂八卦', pattern: /藝人|明星|八卦|情感|劈腿|分手|交往|偶像/i },
    { category: '歧視爭議', pattern: /歧視|族群|仇恨言論|種族/i },
    { category: '網路論戰', pattern: /網紅|直播主|互罵|論戰|開罵|嗆聲|掀桌/i },
    { category: '直播爭議', pattern: /直播|開台|下架|禁播|違規/i },
    { category: '社會事件', pattern: /社群|平台|協調|假帳號|假訊息|輿論操控/i },
];

export function classify(title) {
    if (typeof title !== 'string') {
        return null;
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
        return null;
    }

    for (const { category, pattern } of CATEGORY_PATTERNS) {
        if (pattern.test(normalizedTitle)) {
            return category;
        }
    }

    return null;
}
