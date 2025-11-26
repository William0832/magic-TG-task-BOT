import MessageParser from '../messageParser.js';

export function setupMessageHandler(bot, taskService, assignService) {
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

    // 只有在找到工作單號和負責人時才處理
    if (parsed && parsed.ticketId && parsed.assigneeUsername) {
      console.log(`✅ 檢測到工作分配: ${parsed.ticketId} -> @${parsed.assigneeUsername}`);
      await taskService.handleTaskAssignment(ctx, parsed);
    } else if (parsed && parsed.ticketId && !parsed.assigneeUsername) {
      // 找到 Jira 連結但未提及負責人
      console.log(`⚠️ 檢測到工作單 ${parsed.ticketId}，但未找到負責人`);
      
      const assignKeyboard = {
        inline_keyboard: [
          [
            { text: '👥 選擇用戶', callback_data: 'assign_select_user' }
          ],
          [
            { text: '❓ 查看幫助', callback_data: 'help_assign' }
          ]
        ]
      };
      
      await ctx.reply(`⚠️ 檢測到工作單 ${parsed.ticketId}，但未找到負責人。請選擇用戶或使用命令：/assign ${parsed.ticketId} @username`, {
        reply_markup: assignKeyboard
      });
    } else {
      console.log('ℹ️ 訊息包含 Jira 連結但解析失敗');
    }
  });
}

