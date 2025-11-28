import MessageParser from '../messageParser.js';

export function setupMessageHandler(bot, taskService, assignService, jiraLinkService) {
  // 除錯：記錄所有收到的訊息（但跳過命令，因為已經記錄過了）
  bot.on('message', (ctx) => {
    // 跳過記錄命令（上面已經記錄過了）
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }
    
    const chatType = ctx.chat.type;
    const chatTitle = ctx.chat.title || ctx.chat.first_name || '未知';
    const username = ctx.from.username || ctx.from.first_name || '未知';
    const userId = ctx.from.id;
    const messageText = ctx.message.text || '[非文字訊息]';
    
    console.log('📨 收到訊息:', {
      聊天類型: chatType,
      聊天名稱: chatTitle,
      用戶: `@${username} (${userId})`,
      訊息內容: messageText,
      時間: new Date().toLocaleString('zh-TW')
    });
  });

  // 處理群組中的文字訊息（但排除命令）
  bot.on('text', async (ctx) => {
    // 跳過命令（上面已經處理過了）
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      return;
    }
    
    const text = ctx.message.text;

    // 優先檢查是否有待處理的 Jira 連結任務名稱輸入（指派給其他人）
    if (jiraLinkService) {
      console.log('%c Line:37 debug 🍡 jiraLinkService', 'color:#b03734', jiraLinkService)
      const handled = await jiraLinkService.handleAssignOtherTitleInput(ctx, text);
      if (handled) {
        console.log('%c Line:39 debug 🌽 handled', 'color:#4fff4B', handled)
        return; // 已處理任務名稱輸入
      }
    }

    // 優先檢查是否有待處理的 Jira 連結任務名稱輸入（指派給本人）
    if (jiraLinkService) {
      const handled = await jiraLinkService.handleTitleInput(ctx, text);
      if (handled) {
        console.log('%c Line:48 debug 🌽 handled', 'color:#4fff4B', handled)
        return; // 已處理任務名稱輸入
      }
    }

    // 優先檢查是否有待處理的分配任務（可以在任何聊天類型中處理）
    if (assignService) {
      const handled = await assignService.handleAssignInput(ctx, text);
      if (handled) {
        return; // 已處理分配任務
      }
    }
    
    // 只處理群組中的訊息（group 或 supergroup）
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
      return;
    }
    
    // 檢查訊息是否包含 Jira 連結
    if (!text.includes('jira.dsteam.vip/browse/')) {
      return;
    }

    const parsed = MessageParser.parseJiraMessage(text);
    
    console.log('🔍 解析 Jira 訊息結果:', parsed);

    // 如果找到 Jira 連結，進入交互模式
    if (parsed && parsed.ticketId) {
      // 如果有負責人，直接處理
      if (parsed.assigneeUsername) {
        console.log(`✅ 檢測到工作分配: ${parsed.ticketId} -> @${parsed.assigneeUsername}`);
        await taskService.handleTaskAssignment(ctx, parsed);
      } else {
        // 沒有負責人，進入交互模式
        console.log(`🔗 檢測到 Jira 連結: ${parsed.ticketId}，進入交互模式`);
        
        // 設置 Jira 連結狀態
        if (jiraLinkService) {
          jiraLinkService.setJiraLinkState(
            ctx.from.id,
            ctx.chat.id,
            parsed.ticketId,
            parsed.jiraUrl
          );
        }
        
        // 顯示選項按鈕
        const jiraLinkKeyboard = {
          inline_keyboard: [
            [
              { text: '1️⃣ 指派任務給本人', callback_data: `jira_link_assign_self:${parsed.ticketId}` }
            ],
            [
              { text: '2️⃣ 指派任務給其他人', callback_data: `jira_link_assign_other:${parsed.ticketId}` }
            ],
            [
              { text: '3️⃣ 沒有要幹嘛，看看就好', callback_data: `jira_link_cancel:${parsed.ticketId}` }
            ]
          ]
        };
        
        await ctx.reply(
          `🔗 檢測到任務單號：**${parsed.ticketId}**\n\n` +
          `請選擇操作：\n` +
          `1️⃣ 指派任務給本人\n` +
          `2️⃣ 指派任務給其他人\n` +
          `3️⃣ 沒有要幹嘛，看看就好`,
          {
            reply_markup: jiraLinkKeyboard,
            parse_mode: 'Markdown'
          }
        );
      }
    } else {
      console.log('ℹ️ 訊息包含 Jira 連結但解析失敗');
    }
  });
}

