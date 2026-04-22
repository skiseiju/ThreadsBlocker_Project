# Platform Pollution Guard v1

這一版的目標不是把平台資料做到「不可偽造」，而是先把低成本污染大幅提高門檻，並讓 public overview 預設更偏向保守採樣。

## 已實作保護

1. **來源分級信任**
   - 缺少 `clientSourceId` 的 payload 不再視為 legacy trusted。
   - 新來源預設 `probation`，只有跨日穩定且無驗證警告的來源才會升 `trusted`。
   - `trusted` 目前要求：
     - 偏好平台 (`chrome_extension` / `firefox_extension` / `ios_userscript`)
     - 至少 5 次 upload
     - 至少 3 個活躍日
     - 無 payload validation warning

2. **Server-side rate limit**
   - 同一 `clientSourceId`：60 分鐘內最多 6 次
   - 同一 `ip_hash`：15 分鐘內最多 12 次
   - `ip_hash` 為 `CF-Connecting-IP` 的 SHA-256，不保存原始 IP。

3. **Payload consistency check**
   - Worker 不再信任 client summary 的聚合數字。
   - 由 server 根據 `events`、`sources`、`analysisSeeds.topicSeeds` 重新推導核心指標。
   - 以下情況直接拒收：
     - `summary_*_mismatch`
     - `too_many_events`
     - `too_many_sources`
     - `too_many_topic_seeds`
     - `missing_events`
     - `no_valid_events`
     - `too_many_invalid_events`

4. **Public sample 保守策略**
   - public overview 仍以 `trusted` sample 為主。
   - 即使 ingestion 成功，未升級來源也不應直接影響公開頁主要統計。

5. **Extension provenance signals**
   - extension 會額外送出本機來源年齡、首次版本、成功 upload 次數與多日活躍訊號。
   - server 會把這些訊號記進 upload note，並作為軟性 risk / trust reason：
     - `missing_client_provenance`
     - `local_history_gap`
     - `mature_local_installation`
   - 這些訊號用來輔助判讀，不作為單一 trust 邊界。

## 這一版還沒做的事

1. **真正的 client attestation**
   - extension bundle 是可被拆包的，不能把 client 常數當成秘密。

2. **更細的 anomaly detection**
   - 目前還沒有針對敘事分布、來源集中度時間序列、跨來源共變做統計異常偵測。

3. **人工 reclass / quarantine workflow**
   - 現在已有 `trustReasons` 與 evidence 路徑，但還沒有完整的 admin quarantine / reclass UI。

## 對外說法建議

可以說：
- 平台只公開可信樣本
- 新來源需要累積歷史後才會進入公開樣本
- 伺服器端會做節流與 payload 一致性驗證

不要說：
- 平台資料已經不可污染
- extension 上傳具備不可偽造簽章
