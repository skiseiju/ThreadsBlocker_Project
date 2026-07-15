# ADR 0008: 每話題協調分數採後端 per-topic 聚合

- 日期: 2026-07-07
- 狀態: 已採納
- 相關: [SDD_Topic_Amplification.md](../SDD_Topic_Amplification.md) §M5

## 背景

部署後查核顯示，自動協調偵測抓到的 7 個 `topNarratives` 事件量很高，但 `topKeywords` 全空；這批主要是垃圾/騷擾洗版，不是政治網軍議題。另一方面，政治與公共政策話題（史瓦帝尼、軍購、沈伯洋等）已由 `PUBLIC_CANDIDATE_TOPIC_DEFS` 人工策展錨點命名，話題辨識可用，但沒有計算各自的協調程度。

因此缺口不是單獨改善協調偵測或話題命名，而是把兩者交叉：對每個候選話題，使用命中的 source samples 回算該話題自己的協調分數。

## 選項

1. **純前端試算**  
   前端拿 `candidateTopics`、`topNarratives`、`topicTimeSeries` 自行推估。實作快，但資料已被投影截斷，缺少 per-source signal、source_url distinct count 與完整權重，且容易讓不同前端頁面口徑分裂。

2. **後端 per-topic 聚合**  
   Worker 在 `buildPublicCandidateTopics` 以 `PUBLIC_CANDIDATE_TOPIC_DEFS.keywords` 命中 `source_text_sample`，用已存在的 `manipulation_signal_score` / `avg_signal_score`、`total_event_count`、`source_url`、`topDays` 算每話題協調分數。資料原料已在，不需 schema 變更。

3. **擴充端重算同文比例**  
   由擴充端或上傳 schema 新增更精細的同文比例與 topic join。長期可能更精準，但需要新 payload、同意/隱私文案與後端再處理流程，不能解決當前公開頁缺口。

## 決定

採選項 2：後端 per-topic 聚合既有 `manipulation_signal_score`。

理由：

- 原料已在 `platform_source_metrics`，`buildPublicCandidateTopics` 也已經用 `source_text_sample` 對候選話題關鍵字做命中。
- 可在 Worker 統一輸出口徑，讓 `candidateTopics[]` 與 `topicCards[]` 使用同一組分數與判定。
- 不需要新增 D1 schema、不需要擴充端新版 payload，也不改舊 API 欄位，只加新欄位。

## 後果

- 正面：政治/公共話題卡有自己的協調分數、跨來源數、來源集中與時間集中證據；不再把垃圾洗版協調群組誤當政治議題核心。
- 負面：這是 proxy，不是精確同文比例；分數覆蓋範圍限於 `source_text_sample` 命中候選關鍵字的活動。
- 風險邊界：不指認身分、不宣稱 AI、不代表 Threads 全站；來源集中高時必須解讀為樣本偏差警訊。
