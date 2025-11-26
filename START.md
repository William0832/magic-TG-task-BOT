# 專案啟動指南

## 快速開始

### 1. 安裝依賴

如果還沒有安裝依賴，執行：

```bash
npm install
```

### 2. 獲取 Telegram Bot Token

1. 開啟 Telegram，搜尋 `@BotFather`
2. 發送 `/newbot` 命令
3. 按照提示設定 Bot 名稱和用戶名
4. BotFather 會返回一個 Token，格式類似：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. **儲存這個 Token，稍後會用到**

### 3. 設定環境變數

創建 `.env` 檔案（如果還沒有）：

```bash
cp .env.example .env
```

編輯 `.env` 檔案，填入你的 Bot Token：

```env
# Telegram Bot Token（必需）
BOT_TOKEN=你的_bot_token_這裡

# Jira Configuration（可選，如果需要自動獲取任務標題）
JIRA_BASE_URL=https://jira.dsteam.vip
JIRA_USERNAME=你的_jira_用戶名
JIRA_API_TOKEN=你的_jira_api_token

# Database（可選，預設使用 ./data/missions.db）
DB_PATH=./data/missions.db
```

**最小設定**：只需要設定 `BOT_TOKEN` 即可執行。

**Jira API 設定**（可選）：
- 如果需要 Bot 自動從 Jira 獲取任務標題，需要設定 Jira API
- 獲取 API Token：https://id.atlassian.com/manage-profile/security/api-tokens
- 如果不設定，Bot 會嘗試從訊息中提取標題，如果沒有則標題為空

### 4. 啟動 Bot

```bash
npm start
```

或者使用開發模式（自動重啟）：

```bash
npm run dev
```

### 5. 驗證 Bot 執行

啟動成功後，你會看到：

```
Initializing database...
Database initialized
Jira API integration disabled (no credentials provided)
Starting bot...
Bot is running...
```

### 6. 測試 Bot

1. 在 Telegram 中找到你的 Bot（使用 BotFather 給你的用戶名）
2. 發送 `/start` 測試 Bot 是否響應
3. 將 Bot 新增到你的工作群組
4. 在群組中發送包含 Jira 連結的訊息測試

## 使用範例

### 在群組中自動檢測工作分配

發送訊息：
```
https://jira.dsteam.vip/browse/PROJ-1234
[H5] 發現中心優化-新增返回&活動未讀&任務未完成等
@william0875566 麻煩你了
```

Bot 會自動：
- 識別工作單號 `PROJ-1234`
- 提取標題
- 識別負責人 `william0875566`
- 發送確認訊息給負責人

### 手動分配任務

```
/assign PROJ-1234 @william0875566 [單號名稱]
```

### 更新任務狀態

```
/status PROJ-1234 1
```

### 更新任務進度

```
/progress PROJ-1234 80
```

### 生成週報

在私聊中發送：
```
/report        # 查看所有任務
/report my    # 查看個人任務
```

## 常見問題

### Bot 沒有響應？

1. 檢查 `.env` 檔案中的 `BOT_TOKEN` 是否正確
2. 檢查 Bot 是否已啟動（查看終端輸出）
3. 確保 Bot 已新增到群組並有發送訊息權限

### 資料庫檔案在哪裡？

資料庫檔案會自動創建在 `./data/missions.db`

### 如何重置資料庫？

刪除 `./data/missions.db` 檔案，重啟 Bot 會自動創建新的資料庫

### Jira API 設定失敗？

如果不設定 Jira API，Bot 仍然可以正常運作，只是無法自動獲取任務標題。標題會從訊息中提取，如果沒有則留空。

## 下一步

- 將 Bot 新增到工作群組
- 測試工作分配功能
- 設定 Jira API（可選）
- 開始使用任務管理功能

