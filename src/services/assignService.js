// 臨時存儲分配任務的狀態
const assignStates = new Map();

export class AssignService {
  constructor(taskService) {
    this.taskService = taskService;
  }

  // 設置分配狀態
  setAssignState(userId, chatId, assigneeUserId, assigneeUsername) {
    const key = `${userId}_${chatId}`;
    assignStates.set(key, {
      assigneeUserId,
      assigneeUsername,
      timestamp: Date.now()
    });
    
    // 5分鐘後自動清除
    setTimeout(() => {
      assignStates.delete(key);
    }, 5 * 60 * 1000);
  }

  // 獲取分配狀態
  getAssignState(userId, chatId) {
    const key = `${userId}_${chatId}`;
    return assignStates.get(key);
  }

  // 清除分配狀態
  clearAssignState(userId, chatId) {
    const key = `${userId}_${chatId}`;
    assignStates.delete(key);
  }

  // 處理任務分配輸入
  async handleAssignInput(ctx, text) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const state = this.getAssignState(userId, chatId);
    
    if (!state) {
      return false; // 沒有待處理的分配
    }

    // 解析輸入：<任務單號> [標題]
    const parts = text.trim().split(/\s+/);
    if (parts.length === 0) {
      return false;
    }

    const ticketId = parts[0];
    const title = parts.slice(1).join(' ') || null;

    // 驗證任務單號格式
    if (!/^[A-Z]+-\d+$/.test(ticketId)) {
      await ctx.reply('❌ 無效的任務單號格式\n\n💡 提示：任務單號格式應為 PROJ-1234');
      return true; // 已處理，但格式錯誤
    }

    // 清除狀態
    this.clearAssignState(userId, chatId);

    // 創建任務
    const jiraUrl = `https://jira.dsteam.vip/browse/${ticketId}`;
    await this.taskService.createTask(ctx, {
      ticketId,
      title,
      assigneeUsername: state.assigneeUsername,
      assigneeUserId: state.assigneeUserId,
      jiraUrl
    });

    return true; // 已處理
  }
}

