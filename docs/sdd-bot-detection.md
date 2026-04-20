---
# SDD：機器人特徵偵測系統

版本：0.1  
日期：2026-04-20  
對應 ADR：ADR-0005

## 1. 目標

在封鎖與檢舉流程結束後，提供使用者一個確認步驟，將高可疑帳號標記為「機器人」，並在上傳時傳送至平台，讓平台頁面的 AI 機器人分類有真實資料支撐。

## 2. 系統架構

```
封鎖/檢舉 Worker
    ├── 現有流程（不動）
    └── 新增：profile 讀取模組
            ↓
        特徵計算（打分）
            ↓
        分數 ≥ 5 → 確認 UI（可跳過）
            ↓
        使用者確認
            ↓
        hege_bot_signals（本地儲存）
            ↓
        reporter.js 聚合 → confirmedBots 上傳
```

## 3. Profile 讀取模組

### 3.1 觸發時機

每次 worker 處理完一個帳號的封鎖或檢舉動作後，在同一個 worker window 中導向 `https://www.threads.net/@{username}`，等待頁面載入後執行 DOM 讀取。

### 3.2 抽取欄位

| 欄位 | DOM 位置 | 機器人信號 |
|------|---------|-----------|
| 頭貼是否預設 | `img[data-testid]` src 比對預設 URL pattern | 三無之一 |
| bio 是否空白 | profile bio 容器文字長度 | 三無之一 |
| 貼文數量 | profile stats 區塊 | 極少 = 可疑 |
| 追蹤數 / 粉絲數 | profile stats 區塊 | following >> followers |
| 最近貼文是否全轉貼 | 貼文列表 repost indicator | 無原創 = 可疑 |
| 最近貼文時間間隔 | 貼文時間戳記 | 固定間隔 = 可疑 |
| 驗證標章 | verified badge SVG | 有驗證 → 扣分 |

### 3.3 資料結構

```javascript
{
  accountId: string,         // @username
  scrapedAt: number,         // timestamp
  hasDefaultAvatar: boolean,
  hasBio: boolean,
  postCount: number | null,
  followerCount: number | null,
  followingCount: number | null,
  repostRatio: number | null,  // 0-1，轉貼占比
  postIntervalVariance: number | null,  // 發文間隔標準差
  isVerified: boolean
}
```

## 4. 可疑分數計算

```javascript
function calcBotScore(profile) {
  let score = 0;
  if (profile.hasDefaultAvatar) score += 2;
  if (!profile.hasBio) score += 1;
  if (profile.postCount !== null && profile.postCount === 0) score += 2;
  if (profile.followerCount !== null && profile.followingCount !== null) {
    const ratio = profile.followingCount / (profile.followerCount || 1);
    if (ratio > 10) score += 3;
    else if (ratio > 5) score += 2;
  }
  if (profile.repostRatio !== null && profile.repostRatio > 0.9) score += 2;
  if (profile.postIntervalVariance !== null && profile.postIntervalVariance < 60) score += 2;
  if (profile.isVerified) score -= 3;
  return score;
}
// 門檻：score >= 5 → 觸發確認視窗
```

## 5. 確認 UI

### 5.1 觸發條件

封鎖/檢舉 worker 全部帳號處理完畢後，若有任何帳號分數 ≥ 5，顯示確認視窗。

### 5.2 視窗內容

```
╔══════════════════════════════════════╗
║  偵測到可能是機器人的帳號            ║
║  請確認以下帳號是否為自動化帳號：    ║
╠══════════════════════════════════════╣
║  ☑ @example_bot                      ║
║    • 無頭貼、無簡介                  ║
║    • 追蹤 1,200 人 / 粉絲 3 人       ║
║    • 最近 10 篇全是轉貼              ║
╠══════════════════════════════════════╣
║  ☐ @another_account                  ║
║    • 無頭貼                          ║
║    • 追蹤 300 人 / 粉絲 12 人        ║
╠══════════════════════════════════════╣
║       [確認標記]    [略過]            ║
╚══════════════════════════════════════╝
```

### 5.3 行為

- 使用者可逐一勾選/取消勾選
- 按「確認標記」→ 勾選帳號存入 `hege_bot_signals`
- 按「略過」→ 不儲存任何資料，流程結束
- 視窗可關閉（等同略過）

## 6. 儲存格式

Storage key：`hege_bot_signals`（加入 SYNC_KEYS）

```javascript
// 陣列，每筆為一個已確認機器人帳號
[
  {
    accountId: string,       // @username
    confirmedAt: number,     // 使用者確認的 timestamp
    signals: string[],       // 人類可讀的特徵清單，例如 ['無頭貼', '無簡介', '追蹤/粉絲比 > 10']
    score: number,           // 計算出的分數
    source: 'block' | 'report'  // 來自哪個流程
  }
]
```

## 7. Upload 整合

reporter.js 在聚合上傳 payload 時，讀取 `hege_bot_signals`，加入：

```javascript
{
  confirmedBots: [
    {
      accountId: string,
      confirmedAt: number,
      signals: string[],
      score: number,
      source: string
    }
  ]
}
```

平台 API（`/api/v1/platform/ingest`）接收後，依 `confirmedBots` 更新帳號分類。

## 8. 驗收條件

- [ ] Worker 封鎖/檢舉完成後，若有可疑帳號，確認視窗出現
- [ ] 視窗顯示帳號特徵（中文可讀格式）
- [ ] 使用者確認後，資料寫入 `hege_bot_signals`
- [ ] 略過時不寫入任何資料
- [ ] 上傳 payload 包含 `confirmedBots` 陣列
- [ ] 平台頁面 AI 機器人卡片數字反映真實資料
- [ ] Profile 讀取失敗時不影響主流程（靜默 fail）

## 9. 已知限制

- Threads profile DOM 結構可能因 A/B test 或改版異動，需定期維護選擇器
- Profile 讀取每帳號約 1-3 秒，10 個帳號約需額外 10-30 秒（可並行優化）
- 使用者確認為非強制步驟，略過率高時資料量有限

## 10. 待決議

- Profile 讀取是否在 worker window 中序列執行，或另開多個 background tab 並行
- `hege_bot_signals` 保留期限（建議與其他 history 一致）
- 平台 API 如何處理 `confirmedBots`（需 API 端同步設計）
---
