-- 清空資料庫資料的 SQL 腳本
-- 注意：此操作會刪除所有任務和狀態歷史記錄，無法恢復！

-- 1. 先刪除狀態歷史記錄（因為有外鍵約束）
DELETE FROM status_history;

-- 2. 刪除所有任務
DELETE FROM tasks;

-- 3. 重置自動遞增計數器（可選）
-- 如果希望 ID 從 1 開始重新計數，取消下面的註釋
-- DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'status_history');

-- 執行完成後，資料庫結構會保留，但所有資料都會被清空

