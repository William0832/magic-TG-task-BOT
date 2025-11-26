export class TaskService {
  constructor(db, jiraService = null) {
    this.db = db;
    this.jiraService = jiraService;
  }

  setJiraService(jiraService) {
    this.jiraService = jiraService;
  }

  async handleTaskAssignment(ctx, parsed) {
    const { ticketId, title, assigneeUsername, jiraUrl } = parsed;

    // 檢查任務是否已存在
    const existingTask = await this.db.getTaskByTicketId(ticketId);
    if (existingTask) {
      return ctx.reply(`⚠️ 任務 ${ticketId} 已存在`);
    }

    // 如果未提供標題，嘗試從 Jira 獲取
    let finalTitle = title;
    if (!finalTitle && this.jiraService && this.jiraService.enabled) {
      const jiraInfo = await this.jiraService.fetchTitleFromUrl(jiraUrl);
      if (jiraInfo) {
        finalTitle = jiraInfo.title;
      }
    }

    // 查找負責人用戶 ID（如果在群組中，嘗試從聊天中獲取）
    let assigneeUserId = null;
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${assigneeUsername}`);
        assigneeUserId = chatMember.user.id;
      } catch (error) {
        console.log(`無法在聊天中找到用戶 @${assigneeUsername}`);
      }
    }

    try {
      await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });

      const message = `📋 新任務分配\n\n` +
        `工作單號: ${ticketId}\n` +
        (finalTitle ? `標題: ${finalTitle}\n` : '') +
        `連結: ${jiraUrl}\n\n` +
        `請確認是否受理此任務？`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ 受理', callback_data: `accept:${ticketId}` },
            { text: '❌ 拒絕', callback_data: `reject:${ticketId}` }
          ]
        ]
      };

      if (assigneeUserId) {
        await ctx.telegram.sendMessage(assigneeUserId, message, { reply_markup: keyboard });
        await ctx.reply(`✅ 任務 ${ticketId} 已分配給 @${assigneeUsername}，等待確認中...`);
      } else {
        await ctx.reply(message, { reply_markup: keyboard });
      }
    } catch (error) {
      console.error('創建任務時發生錯誤:', error);
      await ctx.reply(`❌ 創建任務失敗: ${error.message}`);
    }
  }

  async createTask(ctx, taskData) {
    const { ticketId, title, assigneeUsername, jiraUrl } = taskData;

    console.log('🔄 開始創建任務:', { ticketId, title, assigneeUsername, jiraUrl });

    // 檢查任務是否已存在
    const existingTask = await this.db.getTaskByTicketId(ticketId);
    if (existingTask) {
      console.log(`⚠️ 任務 ${ticketId} 已存在`);
      return ctx.reply(`⚠️ 任務 ${ticketId} 已存在`);
    }

    // 如果未提供標題，嘗試從 Jira API 獲取
    let finalTitle = title;
    if (!finalTitle && this.jiraService.enabled) {
      console.log('   🔍 嘗試從 Jira API 獲取標題...');
      const jiraInfo = await this.jiraService.fetchTitleFromUrl(jiraUrl);
      if (jiraInfo) {
        finalTitle = jiraInfo.title;
        console.log('   ✅ 從 Jira 獲取到標題:', finalTitle);
      } else {
        console.log('   ℹ️ 無法從 Jira 獲取標題');
      }
    } else if (!finalTitle) {
      console.log('   ℹ️ Jira API 未啟用，使用提供的標題或留空');
    }

    // 查找負責人用戶 ID（如果在群組中，嘗試從聊天中獲取）
    let assigneeUserId = null;
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      console.log(`   🔍 嘗試在群組中查找用戶 @${assigneeUsername}...`);
      try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${assigneeUsername}`);
        assigneeUserId = chatMember.user.id;
        console.log(`   ✅ 找到用戶 ID: ${assigneeUserId}`);
      } catch (error) {
        console.log(`   ⚠️ 無法在群組中找到用戶 @${assigneeUsername}:`, error.message);
      }
    } else {
      console.log('   ℹ️ 不在群組中，跳過用戶 ID 查找');
    }

    try {
      console.log('   💾 保存任務到資料庫...');
      const taskId = await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });
      console.log(`   ✅ 任務已保存，資料庫 ID: ${taskId}`);

      const message = `📋 新任務分配\n\n` +
        `工作單號: ${ticketId}\n` +
        (finalTitle ? `標題: ${finalTitle}\n` : '') +
        `連結: ${jiraUrl}\n\n` +
        `請確認是否受理此任務？`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ 受理', callback_data: `accept:${ticketId}` },
            { text: '❌ 拒絕', callback_data: `reject:${ticketId}` }
          ]
        ]
      };

      if (assigneeUserId && ctx.telegram) {
        console.log(`   📤 發送確認訊息給用戶 ${assigneeUserId}...`);
        await ctx.telegram.sendMessage(assigneeUserId, message, { reply_markup: keyboard });
        console.log('   ✅ 確認訊息已發送');
        await ctx.reply(`✅ 任務 ${ticketId} 已分配給 @${assigneeUsername}，等待確認中...`);
      } else {
        console.log('   📤 在群組中發送確認訊息...');
        await ctx.reply(message, { reply_markup: keyboard });
      }
      console.log('✅ 任務創建流程完成');
    } catch (error) {
      console.error('❌ 創建任務失敗:', error);
      await ctx.reply(`❌ 創建任務失敗: ${error.message}`);
    }
  }

  async checkPermission(ctx, task) {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;
    
    // 檢查是否為任務負責人
    const isAssignee = 
      (task.assignee_user_id && task.assignee_user_id === userId) ||
      (task.assignee_username && task.assignee_username === username);
    
    let isAdmin = false;
    
    // 如果在群組中，檢查是否為管理員
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        isAdmin = ['creator', 'administrator'].includes(chatMember.status);
      } catch (error) {
        console.log(`   無法檢查管理員權限: ${error.message}`);
      }
    }

    return { isAssignee, isAdmin, hasPermission: isAssignee || isAdmin };
  }
}

