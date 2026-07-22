# Spin League

一套為戰鬥陀螺活動設計的 Web 賽事管理系統。觀眾可以公開查看賽程，主辦方則能建立賽事、安排對戰、輸入比分並管理排行榜。

[開啟線上版本](https://spin-league-tournament.ckvs4517.chatgpt.site)

## 主要功能

- 單淘汰賽與瑞士制
- 支援 2～32 位選手、1～8 台戰鬥台
- 建立、編輯、複製與刪除賽事
- 隨機分組、種子、輪空與自動晉級
- 正式比賽與獨立記分板
- 棄賽、未出席與中途退賽判定
- 即時排行榜、勝敗與得分統計
- 多位裁判同步與資料衝突保護
- JSON 備份／還原與 CSV 報表
- 手機與桌面響應式介面

## 技術特色

前端使用原生 HTML、CSS 與 JavaScript ES Modules，後端使用 Cloudflare Worker 與 D1。專案不依賴前端框架，適合下載後閱讀、修改或延伸新的賽制。

## 開始修改

```bash
git clone https://github.com/ckvs4517/Race_system.git
cd Race_system
```

前端需透過 HTTP 載入 ES Modules，可使用 VS Code Live Server 預覽。完整的架構、資料格式、測試與部署方式請閱讀 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 自動測試

每次推送都會由 GitHub Actions 測試 2～32 人的兩種賽制、完整主辦方操作流程、API、多人同步及部署建置。最新結果可在 [Actions](https://github.com/ckvs4517/Race_system/actions) 查看。
