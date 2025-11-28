// 管理 Jira 連結檢測的交互狀態
const jiraLinkStates = new Map();

export class JiraLinkService {
  constructor(taskService, assignService) {
    this.taskService = taskService;
    this.assignService = assignService;
  }

  // 設置 Jira 連結狀態
  setJiraLinkState(userId, chatId, ticketId, jiraUrl) {
    const key = `${userId}_${chatId}`;
    jiraLinkStates.set(key, {
      ticketId,
      jiraUrl,
      timestamp: Date.now()
    });
    
    // 5分鐘後自動清除
    setTimeout(() => {
      jiraLinkStates.delete(key);
    }, 5 * 60 * 1000);
  }

  // 獲取 Jira 連結狀態
  getJiraLinkState(userId, chatId) {
    const key = `${userId}_${chatId}`;
    return jiraLinkStates.get(key);
  }

  // 清除 Jira 連結狀態
  clearJiraLinkState(userId, chatId) {
    const key = `${userId}_${chatId}`;
    jiraLinkStates.delete(key);
  }

  // 處理任務名稱輸入
  async handleTitleInput(ctx, text) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const state = this.getJiraLinkState(userId, chatId);
    
    if (!state) {
      return false; // 沒有待處理的 Jira 連結
    }

    const title = text.trim() || null;
    
    // 清除狀態
    this.clearJiraLinkState(userId, chatId);

    // 創建任務
    await this.taskService.createTask(ctx, {
      ticketId: state.ticketId,
      title,
      assigneeUsername: ctx.from.username || ctx.from.first_name,
      assigneeUserId: ctx.from.id,
      jiraUrl: state.jiraUrl
    });

    return true; // 已處理
  }

  // 處理指派給其他人的任務名稱輸入
  async handleAssignTitleInput(ctx, text, assigneeUsername, assigneeUserId) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const state = this.getJiraLinkState(userId, chatId);
    
    if (!state) {
      return false; // 沒有待處理的 Jira 連結
    }

    const title = text.trim() || null;
    
    // 清除狀態
    this.clearJiraLinkState(userId, chatId);

    // 創建任務
    await this.taskService.createTask(ctx, {
      ticketId: state.ticketId,
      title,
      assigneeUsername,
      assigneeUserId,
      jiraUrl: state.jiraUrl
    });

    return true; // 已處理
  }

  // 設置指派給其他人的狀態
  setAssignOtherState(userId, chatId, assigneeUserId, assigneeUsername) {
    const key = `${userId}_${chatId}_assign_other`;
    jiraLinkStates.set(key, {
      assigneeUserId,
      assigneeUsername,
      timestamp: Date.now()
    });
    
    // 5分鐘後自動清除
    setTimeout(() => {
      jiraLinkStates.delete(key);
    }, 5 * 60 * 1000);
  }

  // 獲取指派給其他人的狀態
  getAssignOtherState(userId, chatId) {
    const key = `${userId}_${chatId}_assign_other`;
    return jiraLinkStates.get(key);
  }

  // 清除指派給其他人的狀態
  clearAssignOtherState(userId, chatId) {
    const key = `${userId}_${chatId}_assign_other`;
    jiraLinkStates.delete(key);
  }

  // 處理指派給其他人的任務名稱輸入（帶狀態）
  async handleAssignOtherTitleInput(ctx, text) {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const jiraState = this.getJiraLinkState(userId, chatId);
    const assignState = this.getAssignOtherState(userId, chatId);
    
    if (!jiraState || !assignState) {
      return false; // 沒有待處理的狀態
    }

    const title = text.trim() || null;
    
    // 清除所有狀態
    this.clearJiraLinkState(userId, chatId);
    this.clearAssignOtherState(userId, chatId);

    // 創建任務
    await this.taskService.createTask(ctx, {
      ticketId: jiraState.ticketId,
      title,
      assigneeUsername: assignState.assigneeUsername,
      assigneeUserId: assignState.assigneeUserId,
      jiraUrl: jiraState.jiraUrl
    });

    return true; // 已處理
  }
}

