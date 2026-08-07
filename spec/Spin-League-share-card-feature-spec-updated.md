# Spin League 功能開發規格書：素材驅動式共用戰績分享圖

> 本文件提供給 AI／開發者實作「戰績分享圖」功能使用。  
> 目標是讓所有名次的選手在賽事結束後，使用同一套共用模板生成自己的戰績分享圖。  
> 外觀由獨立 SVG／PNG 素材控制，程式只負責資料整理、模板排版、素材選擇與圖片匯出。

---

## 0. 已提供素材包與驗證結果

實作時需使用本規格所對應的素材包：

```text
spin-league-share-card-assets/
```

### 0.1 已驗證可使用的素材

素材包目前包含：

- 3 個 PNG 背景素材
- 4 個名次徽章 SVG
- 4 個統計圖示 SVG
- 4 個資訊小圖示 SVG
- 2 個勝敗標記 SVG
- 4 個分隔線 SVG
- 1 張素材預覽圖
- 1 份素材 README

驗證結果：

- 所有 18 個 SVG 均可通過 XML 解析
- SVG 均具有 `viewBox`
- SVG 未包含 script、事件處理器、外部圖片或 base64 點陣圖
- SVG 文字已轉為向量 path，不依賴外部字型
- PNG 尺寸與透明模式符合用途
- `bg_texture_dark.png`：1080 × 1350，RGB
- `bg_lines_red.png`：1080 × 1350，RGBA
- `bg_spinning_top_silhouette.png`：800 × 800，RGBA
- `asset-board-preview.png`：2000 × 1500

### 0.2 尚未完成的素材

素材包目前沒有：

```text
logos/logo_spinleague.svg
logos/logo_88coffee.svg
```

素材包內只有：

```text
logos/LOGOS_REQUIRED.txt
```

因此實作時需採以下規則：

1. 若 codebase 已有正式的 `88coffee-logo.png`，第一版可繼續使用該正式 Logo。
2. 若有正式 Spin League Logo，補入素材資料夾後再啟用。
3. 不可使用 AI 重畫或近似 Logo 取代正式 Logo。
4. Logo 缺失時必須安全降級為店家名稱文字，不得造成匯出失敗。
5. `LOGOS_REQUIRED.txt` 不屬於執行期素材，不需被網站載入。

### 0.3 SVG 顏色注意事項

部分 SVG 使用 `currentColor`，但 SVG 根節點亦已設定預設顏色，因此以 `<img>` 載入時可正常顯示素材預設色。

若未來要由 CSS 動態換色，應採：

- inline SVG
- CSS mask
- 或建置階段替換

本次第一版不要求動態換色，可直接以 `<img>` 使用素材原始配色。

---

## 1. 功能目標

在賽事結束後，使用者可於賽事排行榜中展開任一選手的完整戰績，並點擊：

- `分享戰績圖`
- 或 `下載戰績圖`

系統需根據該選手的賽事資料，自動生成一張可分享的 PNG。

### 1.1 核心要求

- 所有名次共用同一套模板
- 不為冠軍、亞軍、第七名建立不同結構的模板
- 外觀必須由 SVG／PNG 素材與 CSS 控制
- 程式不可再用 Canvas API 手動畫背景、徽章、圖示、框線或分隔線
- 動態文字與數據仍由程式填入
- 圖片由網站前端產生，不增加後端圖片生成負擔
- 第一版固定輸出 4:5、1080 × 1350 PNG
- 風格需與現有網站深色主視覺一致

---

## 2. 功能定位

此功能不是固定海報，而是：

> 將網站中已存在的選手戰績資料，填入由獨立素材組成的 HTML／CSS 共用模板，再於瀏覽器端匯出圖片。

責任拆分如下：

### 2.1 素材負責

- 背景質感
- 紅色裝飾線
- 陀螺剪影
- 名次徽章
- 統計圖示
- 日期、對戰、地點、社群圖示
- WIN／LOSS 標記
- 分隔線
- 正式品牌 Logo

### 2.2 CSS 負責

- 固定版面
- 元件尺寸
- 間距
- 字級
- 對齊
- 卡片底色
- 資訊區塊排列
- 響應匯出用固定尺寸

### 2.3 JavaScript 負責

- 戰績資料整理
- 勝敗與總得分計算
- 名次狀態判定
- 選擇正確素材
- 將資料填入模板
- 等待素材與字型載入
- 將 DOM 匯出成 PNG
- 下載檔案

---

## 3. 版型策略

### 3.1 單一共用模板

系統必須實作一套共用戰績模板，適用所有選手。

不可採用：

- 冠軍一套模板
- 第七名另一套模板
- 冠軍版／非冠軍版分成不同檔案
- 不同名次使用不同 DOM 結構

正確方式：

- 所有名次使用相同 DOM 結構
- 依資料切換徽章素材、文字、標籤與狀態 class
- 冠軍只是在共用模板中選用 `badge_champion.svg`

### 3.2 首版圖片比例

固定輸出：

```text
1080 × 1350 px
4:5
PNG
```

本次不實作 9:16。

---

## 4. 素材在 codebase 中的目錄

將素材包放入：

```text
src/assets/share-card/
├─ backgrounds/
│  ├─ bg_texture_dark.png
│  ├─ bg_lines_red.png
│  └─ bg_spinning_top_silhouette.png
├─ badges/
│  ├─ badge_champion.svg
│  ├─ badge_top4.svg
│  ├─ badge_top8.svg
│  └─ badge_rank.svg
├─ stats/
│  ├─ icon_record.svg
│  ├─ icon_score.svg
│  ├─ icon_winrate.svg
│  └─ icon_performance.svg
├─ icons/
│  ├─ icon_calendar.svg
│  ├─ icon_match.svg
│  ├─ icon_location.svg
│  └─ icon_instagram.svg
├─ tags/
│  ├─ tag_win.svg
│  └─ tag_loss.svg
├─ dividers/
│  ├─ divider_center_red.svg
│  ├─ divider_dashed_red.svg
│  ├─ divider_slash.svg
│  └─ divider_diamond.svg
└─ logos/
   ├─ logo_spinleague.svg   （取得正式 Logo 後加入）
   └─ logo_88coffee.svg     （取得正式 Logo 後加入）
```

不需將以下內容放入網站執行期 bundle：

```text
preview/
README.md
logos/LOGOS_REQUIRED.txt
```

README 可保留於專案文件區，但不需由前端 import。

---

## 5. 素材集中設定

所有素材路徑需集中於單一 manifest／設定檔，不可散落在多個元件。

建議檔案：

```text
src/config/share-card-assets.js
```

建議結構：

```js
export const SHARE_CARD_ASSETS = {
  backgrounds: {
    texture: new URL(
      '../assets/share-card/backgrounds/bg_texture_dark.png',
      import.meta.url
    ).href,
    lines: new URL(
      '../assets/share-card/backgrounds/bg_lines_red.png',
      import.meta.url
    ).href,
    spinningTop: new URL(
      '../assets/share-card/backgrounds/bg_spinning_top_silhouette.png',
      import.meta.url
    ).href,
  },

  badges: {
    champion: new URL(
      '../assets/share-card/badges/badge_champion.svg',
      import.meta.url
    ).href,
    top4: new URL(
      '../assets/share-card/badges/badge_top4.svg',
      import.meta.url
    ).href,
    top8: new URL(
      '../assets/share-card/badges/badge_top8.svg',
      import.meta.url
    ).href,
    rank: new URL(
      '../assets/share-card/badges/badge_rank.svg',
      import.meta.url
    ).href,
  },

  stats: {
    record: new URL(
      '../assets/share-card/stats/icon_record.svg',
      import.meta.url
    ).href,
    score: new URL(
      '../assets/share-card/stats/icon_score.svg',
      import.meta.url
    ).href,
    winrate: new URL(
      '../assets/share-card/stats/icon_winrate.svg',
      import.meta.url
    ).href,
    performance: new URL(
      '../assets/share-card/stats/icon_performance.svg',
      import.meta.url
    ).href,
  },

  icons: {
    calendar: new URL(
      '../assets/share-card/icons/icon_calendar.svg',
      import.meta.url
    ).href,
    match: new URL(
      '../assets/share-card/icons/icon_match.svg',
      import.meta.url
    ).href,
    location: new URL(
      '../assets/share-card/icons/icon_location.svg',
      import.meta.url
    ).href,
    instagram: new URL(
      '../assets/share-card/icons/icon_instagram.svg',
      import.meta.url
    ).href,
  },

  tags: {
    win: new URL(
      '../assets/share-card/tags/tag_win.svg',
      import.meta.url
    ).href,
    loss: new URL(
      '../assets/share-card/tags/tag_loss.svg',
      import.meta.url
    ).href,
  },

  dividers: {
    center: new URL(
      '../assets/share-card/dividers/divider_center_red.svg',
      import.meta.url
    ).href,
    dashed: new URL(
      '../assets/share-card/dividers/divider_dashed_red.svg',
      import.meta.url
    ).href,
    slash: new URL(
      '../assets/share-card/dividers/divider_slash.svg',
      import.meta.url
    ).href,
    diamond: new URL(
      '../assets/share-card/dividers/divider_diamond.svg',
      import.meta.url
    ).href,
  },

  logos: {
    spinLeague: null,
    store88Coffee: new URL(
      '../assets/88coffee-logo.png',
      import.meta.url
    ).href,
  },
};
```

AI 實作前需依現有 bundler 與目錄結構調整相對路徑，不可盲目照抄。

---

## 6. 素材對應規則

### 6.1 背景層

共用模板依下列順序疊加：

1. `bg_texture_dark.png`
2. `bg_lines_red.png`
3. `bg_spinning_top_silhouette.png`
4. HTML 資訊區塊

背景素材需使用絕對定位，並設定 `pointer-events: none`。

建議：

- texture：100% 覆蓋
- lines：100% 覆蓋
- silhouette：放置於右上、中央偏右或主角區後方
- silhouette opacity：4%～10%

### 6.2 名次徽章

依 `finalRank` 選擇：

```text
rank === 1  → badge_champion.svg
rank <= 4   → badge_top4.svg
rank <= 8   → badge_top8.svg
rank > 8    → badge_rank.svg
```

`badge_rank.svg` 不含實際名次數字，名次數字由 HTML 文字疊加於徽章預留區。

### 6.3 統計圖示

固定對應：

```text
總戰績   → icon_record.svg
總得分   → icon_score.svg
勝率     → icon_winrate.svg
賽事表現 → icon_performance.svg
```

### 6.4 資訊圖示

固定對應：

```text
比賽日期 → icon_calendar.svg
對戰紀錄 → icon_match.svg
店家地址 → icon_location.svg
店家 IG  → icon_instagram.svg
```

### 6.5 勝敗標記

每一筆已完成對戰：

```text
result === win  → tag_win.svg
result === loss → tag_loss.svg
```

素材可縮小顯示，但不可重新以 CSS 畫出近似標記。

### 6.6 分隔線

建議實際用途：

```text
divider_center_red.svg  → 賽事資訊區與主角區之間
divider_dashed_red.svg  → 瑞士輪與後續階段之間
divider_diamond.svg     → 對戰紀錄與店家資訊區之間
divider_slash.svg       → 預留作局部裝飾或 fallback
```

不要求一張圖同時使用全部四種，但視覺分隔線應優先使用素材，不再用 Canvas 手動畫。

---

## 7. 共用模板版面結構

模板固定分為：

1. 賽事資訊區
2. 主角資訊區
3. 數據摘要區
4. 完整對戰紀錄區
5. 店家資訊區

所有名次共用相同 DOM 結構。

### 7.1 賽事資訊區

顯示：

- Spin League 小型品牌文字或正式 Logo
- 賽事名稱
- 賽制
- 戰鬥台資訊
- 瑞士輪進度
- 日期圖示與日期

使用素材：

- `bg_texture_dark.png`
- `bg_lines_red.png`
- `icon_calendar.svg`
- `divider_center_red.svg`

### 7.2 主角資訊區

顯示：

- 名次徽章素材
- 選手名稱
- 最終名次
- resultTag
- performanceLabel

不因名次改變 DOM 結構。

### 7.3 數據摘要區

固定四格：

- 總戰績
- 總得分
- 勝率
- 賽事表現

每格使用相對應的 `stats/*.svg`。

### 7.4 完整對戰紀錄區

顯示每場已完成對戰：

- 階段
- 對手
- WIN／LOSS 素材
- 比分

以 `icon_match.svg` 作區塊標題。

不同階段可使用 `divider_dashed_red.svg` 分開。

### 7.5 店家資訊區

顯示：

- 正式店家 Logo；若缺失則顯示店家名稱文字
- IG
- 地址
- 小型 `Powered by Spin League`

使用：

- `icon_instagram.svg`
- `icon_location.svg`
- `divider_diamond.svg`

目前不顯示 QR Code。

---

## 8. 動態資料與計算規則

### 8.1 賽事欄位

- `eventName`
- `eventFormatText`
- `battleStationsText`
- `roundProgressText`
- `eventDate`

### 8.2 選手欄位

- `playerName`
- `finalRank`
- `totalWins`
- `totalLosses`
- `totalPoints`
- `winRate`
- `resultTag`
- `performanceLabel`

### 8.3 對戰紀錄欄位

每一筆 `matches[]`：

- `stageLabel`
- `opponentName`
- `result`
- `scoreFor`
- `scoreAgainst`

### 8.4 店家資訊欄位

- `storeName`
- `storeLogo`
- `storeInstagram`
- `storeAddress`

### 8.5 總戰績與總得分

必須從賽事開始累積，包含：

- 瑞士預賽
- 資格加賽
- 四強循環
- 淘汰賽
- 其他正式完成場次

不可只計算最後階段。

### 8.6 勝率

```text
勝率 = totalWins / (totalWins + totalLosses)
```

### 8.7 resultTag

```text
rank === 1 → CHAMPION
rank <= 4  → TOP 4
rank <= 8  → TOP 8
其他       → RANK {rank} 或只顯示名次
```

### 8.8 performanceLabel

```text
rank === 1 且 losses === 0 → 完美奪冠
rank === 1                 → 冠軍
rank <= 4                  → 晉級四強
rank <= 8                  → 瑞士前八
其他                       → 全力應戰
```

---

## 9. HTML／CSS 模板要求

建議元件：

```text
ResultShareCard
TournamentResultShareCard
```

模板需：

- 固定 1080 × 1350
- 使用 HTML 語意區塊
- 以 `<img>` 載入素材
- 不使用 Canvas API 手動畫 UI
- 不使用外部 CDN 圖片
- 不使用 data URL 內嵌整包素材
- 所有圖片需設定固定寬高，避免載入時 layout shift
- 匯出節點不可使用 `display: none`
- 可放在 viewport 外或透明的 export layer
- 匯出時不得受到目前螢幕寬度影響

### 9.1 文字可讀性

- 中文需使用 codebase 現有可用字型堆疊
- 不另外附帶或散布字型檔
- 選手名稱、賽事名稱過長時需有縮字／換行規則
- 不可讓文字溢出卡片
- 不可用圖片素材取代動態中文文字

### 9.2 對戰紀錄過多

建議規則：

- 1～5 場：單欄
- 6～10 場：雙欄
- 超過 10 場：啟用 compact class，降低垂直間距與字級
- 不可靜默省略已完成場次
- 若現有賽制可能超過模板安全容量，AI 必須先分析目前最大場次並回報
- 若仍無法容納，不可輸出缺資料的圖片；需顯示明確錯誤或在實作計畫提出分頁方案

---

## 10. 圖片匯出方式

### 10.1 前端流程

1. 建立／更新隱藏的固定尺寸 HTML 模板
2. 填入選手資料
3. 等待 `document.fonts.ready`
4. 等待全部 `<img>` 完成 `decode()`
5. 將 DOM 節點轉成 PNG
6. 下載 PNG
7. 清除暫存節點

### 10.2 匯出工具

AI 需先檢查 codebase 是否已有 DOM-to-image 工具。

優先順序：

1. 沿用現有且相容的匯出工具
2. 若沒有，評估加入 `html-to-image`
3. 不可為了外觀重新回到 Canvas 手動畫 UI

Canvas 可由匯出函式庫在內部進行最終 rasterize，但應用程式碼不可用 Canvas 指令逐一繪製背景、徽章、圖示與框線。

### 10.3 防止素材匯出失敗

- 素材必須來自同源的本地 bundle
- 不使用遠端圖片 URL
- 圖片載入失敗時需記錄錯誤
- Logo 可 fallback
- 背景、徽章與核心圖示缺失時不得靜默輸出空白圖
- 匯出按鈕需有 loading 狀態並防止重複點擊

---

## 11. 程式結構

### 11.1 戰績資料層

```text
buildShareCardData(tournament, playerName)
```

只負責資料，不可 import 視覺素材。

### 11.2 素材設定層

```text
src/config/share-card-assets.js
```

集中素材 URL 與 fallback。

### 11.3 模板層

```text
ResultShareCard
```

只負責 HTML／CSS 排版與素材套用。

### 11.4 匯出層

```text
downloadShareCardAsPng()
```

只負責 preload、DOM-to-image 與下載。

---

## 12. 舊資料與安全降級

必須支援舊賽事資料。

- 無店家 Logo：顯示店家名稱
- 無 IG：隱藏 IG 列
- 無地址：隱藏地址列
- 無 Spin League 正式 Logo：顯示文字 `SPIN LEAGUE`
- 無完整階段名稱：由現有 round 資料建立可讀標籤
- 非冠軍選手仍可正常生成
- 不因某一個非核心裝飾素材缺失而整體崩潰

核心背景或名次徽章缺失時，應阻止匯出並顯示可理解的錯誤。

---

## 13. 顯示位置與使用流程

只有賽事完成時顯示：

- `下載戰績圖`

流程：

1. 進入已完成賽事
2. 開啟排行榜
3. 展開任一選手
4. 點擊下載
5. 顯示生成中狀態
6. 下載 1080 × 1350 PNG

---

## 14. 測試需求

### 14.1 資料測試

至少測試：

- 第 1 名
- 第 2 名
- 第 4 名
- 第 7 名
- 第 8 名

確認：

- 總勝敗正確
- 總得分從瑞士輪開始累積
- 勝率正確
- 名次正確
- resultTag 正確
- performanceLabel 正確
- 對戰順序正確

### 14.2 素材測試

需驗證：

- 所有執行期素材路徑存在
- 主要 SVG／PNG 能載入
- 第 1 名使用 `badge_champion.svg`
- 第 2、4 名使用 `badge_top4.svg`
- 第 7、8 名使用 `badge_top8.svg`
- 其他名次使用 `badge_rank.svg`
- 勝局使用 `tag_win.svg`
- 敗局使用 `tag_loss.svg`
- 統計卡使用對應圖示
- 沒有 Logo 時 fallback 正常

### 14.3 模板測試

- 所有名次使用相同 DOM 結構
- 不存在冠軍專用模板
- 模板尺寸固定
- 長選手名稱不溢出
- 長賽事名稱不溢出
- 對戰紀錄數量變化不破版
- 所有素材在匯出圖中可見

### 14.4 匯出測試

- 成功下載 PNG
- 尺寸為 1080 × 1350
- 圖片不是空白
- 背景素材有出現
- 名次徽章有出現
- 勝敗標記有出現
- 多次下載結果一致
- 手機與桌機資料一致

---

## 15. 不在本次範圍

本次不要實作：

- IG API 分享
- 9:16 模板
- 多模板切換
- 模板編輯器
- 動畫輸出
- QR Code
- 批次生成
- 遠端後端圖片生成
- AI 即時生成視覺素材
- 執行期下載外部 CDN 素材

---

## 16. 驗收條件

以下全部成立才算完成：

1. 賽事完成後可下載任一選手戰績圖
2. 輸出為 1080 × 1350 PNG
3. 所有名次共用同一 HTML／CSS 模板
4. 背景、徽章、圖示、標記、分隔線來自素材包
5. 程式不再用 Canvas API 手動畫 UI 外觀
6. 動態文字與戰績由程式正確填入
7. 總戰績與總得分從瑞士輪開始累積
8. 完整對戰紀錄正確
9. 第 1、2、4、7、8 名皆可正常生成
10. 店家 Logo 缺失時可安全 fallback
11. 所有素材路徑集中管理
12. 舊資料可使用
13. 核心素材載入失敗時有明確錯誤
14. 不需後端生成圖片
15. 不修改正式環境 binding 或部署設定

---

## 17. 可直接交給 AI／Codex 的任務指令

```text
請先閱讀專案根目錄的 AGENTS.md、DEVELOPMENT.md，以及：

spec/Spin-League-share-card-feature-spec.md

並檢查提供的 spin-league-share-card-assets 素材包。

請將現有戰績分享圖功能改為「素材驅動的 HTML／CSS 共用模板」。

核心要求：

1. 將執行期素材整理至 src/assets/share-card/。
2. 建立單一素材 manifest，例如 src/config/share-card-assets.js。
3. 所有名次使用同一套 1080 × 1350 HTML／CSS 模板。
4. 不建立冠軍版、非冠軍版或個別名次模板。
5. 不再使用 Canvas API 手動畫背景、徽章、圖示、框線、WIN／LOSS 標記或分隔線。
6. Canvas 只可由 DOM-to-image 匯出工具在內部用於最終 rasterize。
7. 使用素材：
   - backgrounds/*.png 作背景層
   - badges/*.svg 作名次徽章
   - stats/*.svg 作四個統計卡圖示
   - icons/*.svg 作日期、對戰、地點、IG 圖示
   - tags/*.svg 作 WIN／LOSS 標記
   - dividers/*.svg 作版面分隔線
8. 名次徽章規則：
   - 第 1 名：badge_champion.svg
   - 第 2～4 名：badge_top4.svg
   - 第 5～8 名：badge_top8.svg
   - 其他：badge_rank.svg，名次數字由 HTML 疊加
9. 保留現有 buildShareCardData 或等價資料整理層。
10. 總勝敗、總得分與完整對戰紀錄必須從瑞士輪開始統計。
11. 正式 Logo 不可由 AI 重畫。素材包缺少 Logo 時：
    - 優先沿用 codebase 現有的正式 88coffee Logo
    - 否則顯示店家名稱文字 fallback
12. 所有圖片必須為本地同源 bundle。
13. 匯出前等待 document.fonts.ready 與全部 img.decode()。
14. 只有賽事完成後顯示下載按鈕。
15. 至少驗證第 1、2、4、7、8 名。
16. 不實作 QR Code、9:16、多模板、動畫、IG API 或後端圖片生成。
17. 不部署正式環境，不修改 Sites project_id、D1 binding 或正式資料。

請先分析現有 codebase 並回報：

- 現有 Canvas 戰績圖程式位置
- 預計移除或保留的程式
- HTML／CSS 模板放置位置
- 素材 manifest 放置位置
- 現有匯出套件及是否需新增依賴
- 店家 Logo 的現有來源
- 對戰紀錄最大數量與 overflow 策略
- 預計修改檔案

先提出計畫，不要立即修改。

確認後再實作。完成後執行專案既有快速測試、完整測試與 build，最後回報：

- 修改檔案
- 素材整合狀況
- 測試結果
- 尚未完成項目
- 剩餘風險
```

---
