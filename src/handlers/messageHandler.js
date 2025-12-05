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
    const messageText = ctx.message.text || ctx.message.caption || '[非文字訊息]';
    const entities = ctx.message.entities || ctx.message.caption_entities || [];
    
    console.log('📨 收到訊息:', {
      聊天類型: chatType,
      聊天名稱: chatTitle,
      用戶: `@${username} (${userId})`,
      訊息內容: messageText,
      訊息類型: ctx.message.text ? 'text' : (ctx.message.caption ? 'caption' : 'other'),
      實體: entities.map(e => e.type),
      時間: new Date().toLocaleString('zh-TW')
    });
  });

  // 處理群組中的文字訊息（但排除命令）
  bot.on('text', async (ctx) => {
    // 跳過命令（上面已經處理過了）
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
      console.log('⚠️ [DEBUG] 跳過命令:', ctx.message.text);
      return;
    }
    
    const text = ctx.message.text;
    
    // 檢查是否有實體（Telegram 自動識別的連結等）
    const entities = ctx.message.entities || [];
    console.log('🔍 [DEBUG] 收到文字訊息:', {
      聊天類型: ctx.chat.type,
      聊天ID: ctx.chat.id,
      用戶ID: ctx.from.id,
      訊息內容: text,
      訊息長度: text.length,
      實體數量: entities.length,
      實體: entities.map(e => ({ type: e.type, offset: e.offset, length: e.length }))
    });
    
    // 如果訊息為空，跳過
    if (!text) {
      console.log('⚠️ [DEBUG] 訊息為空，跳過處理');
      return;
    }
    jiraLinkService
    console.log('%c Line:57 debug 🍑 jiraLinkService', 'color:#2eafb0', jiraLinkService)
    // 優先檢查是否有待處理的 Jira 連結任務名稱輸入（指派給其他人）
    if (jiraLinkService) {
      console.log('🔍 [DEBUG] 檢查指派給其他人的狀態...');
      const assignState = jiraLinkService.getAssignOtherState(ctx.from.id, ctx.chat.id);
      const jiraState = jiraLinkService.getJiraLinkState(ctx.from.id, ctx.chat.id);
      console.log('🔍 [DEBUG] 指派給其他人狀態:', { assignState, jiraState });
      
      const handled = await jiraLinkService.handleAssignOtherTitleInput(ctx, text);
      if (handled) {
        console.log('✅ [DEBUG] 已處理指派給其他人的任務名稱輸入');
        return; // 已處理任務名稱輸入
      }
    }

    // 優先檢查是否有待處理的 Jira 連結任務名稱輸入（指派給本人）
    if (jiraLinkService) {
      console.log('🔍 [DEBUG] 檢查指派給本人的狀態...');
      const jiraState = jiraLinkService.getJiraLinkState(ctx.from.id, ctx.chat.id);
      console.log('🔍 [DEBUG] Jira 連結狀態:', jiraState);
      
      const handled = await jiraLinkService.handleTitleInput(ctx, text);
      if (handled) {
        console.log('✅ [DEBUG] 已處理指派給本人的任務名稱輸入');
        return; // 已處理任務名稱輸入
      }
    }

    // 優先檢查是否有待處理的分配任務（可以在任何聊天類型中處理）
    if (assignService) {
      const handled = await assignService.handleAssignInput(ctx, text);
      if (handled) {
        console.log('✅ [DEBUG] 已處理分配任務');
        return; // 已處理分配任務
      }
    }
    
    // 允許群組和私聊中處理 Jira 連結
    // 但私聊中只能處理 Jira 連結交互，不能選擇其他用戶（因為沒有群組成員列表）
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const isPrivate = ctx.chat.type === 'private';
    const hasPendingState = jiraLinkService && (
      jiraLinkService.getJiraLinkState(ctx.from.id, ctx.chat.id) ||
      jiraLinkService.getAssignOtherState(ctx.from.id, ctx.chat.id)
    );
    
    // 如果不是群組也不是私聊，且沒有待處理狀態，則跳過
    if (!isGroup && !isPrivate && !hasPendingState) {
      console.log('⚠️ [DEBUG] 不支持的聊天類型，跳過處理。聊天類型:', ctx.chat.type);
      return;
    }
    
    if (isPrivate && !hasPendingState) {
      console.log('ℹ️ [DEBUG] 私聊中處理 Jira 連結');
    } else if (isPrivate) {
      console.log('ℹ️ [DEBUG] 私聊中處理待處理狀態');
    }
    
    // 檢查訊息是否包含 Jira 連結（檢查文字和實體）
    const hasJiraLinkInText = text.includes('jira.dsteam.vip/browse/');
    const hasJiraLinkInEntity = entities.some(e => {
      if (e.type === 'url' || e.type === 'text_link') {
        const url = text.substring(e.offset, e.offset + e.length);
        return url.includes('jira.dsteam.vip/browse/');
      }
      return false;
    });
    const hasJiraLink = hasJiraLinkInText || hasJiraLinkInEntity;
    
    console.log('🔍 [DEBUG] 檢查 Jira 連結:', {
      hasJiraLinkInText,
      hasJiraLinkInEntity,
      hasJiraLink,
      text,
      entities: entities.filter(e => e.type === 'url' || e.type === 'text_link')
    });
    
    if (!hasJiraLink) {
      console.log('⚠️ [DEBUG] 訊息不包含 Jira 連結，跳過處理');
      return;
    }

    console.log('🔍 [DEBUG] 開始解析 Jira 訊息...');
    const parsed = MessageParser.parseJiraMessage(text);
    
    console.log('🔍 [DEBUG] 解析 Jira 訊息結果:', JSON.stringify(parsed, null, 2));

    // 如果找到 Jira 連結，進入交互模式
    if (parsed && parsed.ticketId) {
      console.log('✅ [DEBUG] 成功解析到任務單號:', parsed.ticketId);
      
      // 如果有負責人，直接處理
      if (parsed.assigneeUsername) {
        console.log(`✅ [DEBUG] 檢測到工作分配: ${parsed.ticketId} -> @${parsed.assigneeUsername}`);
        await taskService.handleTaskAssignment(ctx, parsed);
      } else {
        // 沒有負責人，進入交互模式
        console.log(`🔗 [DEBUG] 檢測到 Jira 連結: ${parsed.ticketId}，進入交互模式`);
        console.log(`🔗 [DEBUG] 用戶ID: ${ctx.from.id}, 聊天ID: ${ctx.chat.id}`);
        
        // 設置 Jira 連結狀態
        if (jiraLinkService) {
          console.log('🔗 [DEBUG] 設置 Jira 連結狀態...');
          jiraLinkService.setJiraLinkState(
            ctx.from.id,
            ctx.chat.id,
            parsed.ticketId,
            parsed.jiraUrl
          );
          const stateAfterSet = jiraLinkService.getJiraLinkState(ctx.from.id, ctx.chat.id);
          console.log('🔗 [DEBUG] 狀態設置後:', stateAfterSet);
        }
        
        // 顯示選項按鈕
        // 私聊中只顯示「指派給本人」選項，因為無法獲取其他用戶列表
        const isPrivate = ctx.chat.type === 'private';
        console.log('%c Line:173 debug 🍤 isPrivate', 'color:#33a5ff', isPrivate)
        const jiraLinkKeyboard = {
          inline_keyboard: [
            [
              { text: '1️⃣ 指派任務給本人', callback_data: `jira_link_assign_self:${parsed.ticketId}` }
            ]
          ]
        };
        
        // 群組中才顯示「指派給其他人」選項
        if (!isPrivate) {
          jiraLinkKeyboard.inline_keyboard.push([
            { text: '2️⃣ 指派任務給其他人', callback_data: `jira_link_assign_other:${parsed.ticketId}` }
          ]);
        }
        
        jiraLinkKeyboard.inline_keyboard.push([
          { text: '3️⃣ 沒有要幹嘛，看看就好', callback_data: `jira_link_cancel:${parsed.ticketId}` }
        ]);
        
        let messageText = `🔗 檢測到任務單號：**${parsed.ticketId}**\n\n` +
          `請選擇操作：\n` +
          `1️⃣ 指派任務給本人\n`;
        
        if (!isPrivate) {
          messageText += `2️⃣ 指派任務給其他人\n`;
        }
        
        messageText += `3️⃣ 沒有要幹嘛，看看就好`;
        
        console.log('🔗 [DEBUG] 準備發送交互選項...', { isPrivate });
        await ctx.reply(
          messageText,
          {
            reply_markup: jiraLinkKeyboard,
            parse_mode: 'Markdown'
          }
        );
        console.log('✅ [DEBUG] 交互選項已發送');
      }
    } else {
      console.log('❌ [DEBUG] 訊息包含 Jira 連結但解析失敗');
      console.log('❌ [DEBUG] 原始訊息:', text);
    }
  });
}

