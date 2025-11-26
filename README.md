# TG Mission Bot

Telegram Bot for managing Jira tasks in work groups.

## 功能

- 自動檢測群組中的 Jira 工作分配訊息
- 任務狀態管理（待開發/開發中/待測試/測試中/待上線）
- 進度追蹤（手動輸入百分比）
- 週報生成

## 安裝設定

1. 安裝依賴：
```bash
npm install
```

2. 複製 `.env.example` 到 `.env` 並填入你的 bot token：
```bash
cp .env.example .env
```

3. 啟動 Bot：
```bash
npm start
```

## 命令

- `/assign PROJ-1234 @username [標題]` - 手動分配任務
- `/status PROJ-1234 開發中` - 更新任務狀態
- `/progress PROJ-1234 80` - 更新任務進度（0-100）
- `/report` - 生成本週工作報告（顯示所有任務）

**注意**：`/report` 命令可以在群組和私聊中使用。

## 資料庫

SQLite 資料庫會自動創建在 `./data/missions.db`

