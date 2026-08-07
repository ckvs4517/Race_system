# Spin League Share Card Assets

這是一組供 1080 × 1350 戰績分享圖使用的深色賽事 UI 素材。

## 完成狀態

已完成 3 個 PNG 背景、4 個名次徽章、4 個統計圖示、4 個小圖示、2 個勝敗標記、4 個分隔線與素材預覽圖。

未完成：
- `logos/logo_spinleague.svg`
- `logos/logo_88coffee.svg`

未提供正式 Logo，因此依規格不自行重畫或杜撰商標。請將正式原始檔補入 `logos/`。

## 色票

- 背景黑 `#080A0D`
- 深灰 `#11151A`
- 框線灰 `#3A4048`
- 主要紅 `#E52B32`
- 暗紅 `#8E1D23`
- 文字白 `#F3F3EF`
- 次要灰 `#A7ABB1`
- 勝利綠 `#61B967`

## 建議顯示尺寸

- `backgrounds/bg_texture_dark.png`：1080 × 1350，100% 底圖。
- `backgrounds/bg_lines_red.png`：1080 × 1350，透明裝飾層。
- `backgrounds/bg_spinning_top_silhouette.png`：800 × 800，建議寬 280–520 px、透明度 4%–10%。
- `badges/*.svg`：建議寬 90–180 px。
- `stats/*.svg`：建議寬 44–88 px。
- `icons/*.svg`：建議寬 24–48 px。
- `tags/*.svg`：建議寬 120–220 px。
- `dividers/*.svg`：建議容器寬度 100%。

## currentColor

多數主要線條使用 `currentColor`。inline SVG 可直接由 CSS `color` 改色；以 `<img>` 載入時通常無法繼承父層 `color`，可改用 inline SVG、建置階段替換或 CSS mask。品牌紅與勝利綠為固定色。

```css
.share-icon { width:48px; height:48px; color:#F3F3EF; }
.share-badge { width:140px; height:auto; color:#F3F3EF; }
.share-divider { width:100%; height:auto; color:#A7ABB1; }
```

## Canvas 使用

匯出 Canvas 前需等待 SVG／PNG 完整載入。素材不包含腳本、外部 URL、外部字型或內嵌點陣圖。

## Logo 注意事項

正式 Logo 的文字、比例、線條與顏色不可修改。本包未建立近似商標。

## 原創與商標聲明

徽章、圖示、分隔線與抽象陀螺輪廓為原創幾何設計，不重製官方 Beyblade 商標或既有產品外觀。相關名稱與標誌權利歸各自權利人所有。

## 完整檔案清單

```text
spin-league-share-card-assets/
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
├─ logos/
│  └─ LOGOS_REQUIRED.txt
├─ dividers/
│  ├─ divider_center_red.svg
│  ├─ divider_dashed_red.svg
│  ├─ divider_slash.svg
│  └─ divider_diamond.svg
├─ preview/
│  └─ asset-board-preview.png
└─ README.md
```

`logo_spinleague.svg` 與 `logo_88coffee.svg` 會在取得正式 Logo 後補入。

## 驗證結果

- 所有 SVG 均已通過 XML 解析。
- 所有 SVG 均已透過 CairoSVG 實際轉譯測試。
- SVG 不含腳本、外部圖片或 base64 點陣圖。
- 透明 PNG 為 RGBA，背景 PNG 為 RGB。
- PNG 尺寸已核對。
