import { Telegraf } from 'telegraf';
import Database from './database.js';
import MessageParser from './messageParser.js';
import JiraService from './jira.js';

class MissionBot {
  constructor(token, db, jiraService) {
    this.bot = new Telegraf(token);
    this.db = db;
    this.jiraService = jiraService;
    // 週報狀態選項（主要狀態系統）
    this.reportStatuses = ['正在進行', '已上線', '下週繼續', '封存'];
    // 週報狀態數字對應：0-3 對應週報狀態文字
    this.reportStatusNumberMap = {
      '0': '正在進行',
      '1': '已上線',
      '2': '下週繼續',
      '3': '封存'
    };
    
    this.setupHandlers();
  }

  // 將狀態輸入（數字或文字）轉換為週報狀態文字
  parseStatusInput(input) {
    // 檢查輸入是否為數字 (0-3)
    if (/^[0-3]$/.test(input.trim())) {
      return this.reportStatusNumberMap[input.trim()];
    }
    // 否則，直接返回輸入（應該是狀態文字）
    return input;
  }

  // 記錄命令詳細資訊
  logCommandDetails(commandName, ctx, additionalInfo = {}) {
    const timestamp = new Date().toLocaleString('zh-TW', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const user = ctx.from || {};
    const chat = ctx.chat || {};
    const message = ctx.message || ctx.channelPost || {};
    
    const commandText = message.text || '[無文字]';
    const args = commandText.split(' ').slice(1);

    console.log('\n' + '='.repeat(60));
    console.log(`📝 收到命令: /${commandName}`);
    console.log(`⏰ 時間: ${timestamp}`);
    console.log(`📋 完整命令: ${commandText}`);
    console.log(`📦 參數數量: ${args.length}`);
    if (args.length > 0) {
      console.log(`📦 參數內容: [${args.join(', ')}]`);
    }
    console.log(`\n👤 用戶資訊:`);
    console.log(`   用戶ID: ${user.id || '未知'}`);
    console.log(`   用戶名: @${user.username || '無'}`);
    console.log(`   全名: ${user.first_name || ''} ${user.last_name || ''}`.trim() || '未知');
    console.log(`   語言: ${user.language_code || '未知'}`);
    console.log(`\n💬 聊天資訊:`);
    console.log(`   聊天類型: ${chat.type || '未知'}`);
    console.log(`   聊天ID: ${chat.id || '未知'}`);
    console.log(`   聊天名稱: ${chat.title || chat.first_name || chat.username || '未知'}`);
    if (chat.username) {
      console.log(`   聊天用戶名: @${chat.username}`);
    }
    
    if (Object.keys(additionalInfo).length > 0) {
      console.log(`\n📊 額外資訊:`);
      Object.entries(additionalInfo).forEach(([key, value]) => {
        if (typeof value === 'object') {
          console.log(`   ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n   '));
        } else {
          console.log(`   ${key}: ${value}`);
        }
      });
    }
    console.log('='.repeat(60) + '\n');
  }

  setupHandlers() {
    // 重要：先註冊命令處理器，再註冊文字處理器
    // 這確保命令在被文字處理器捕獲之前先被處理
    
    // 命令：/help - 顯示幫助訊息
    this.bot.command('help', async (ctx) => {
      this.logCommandDetails('help', ctx);
      const helpMessage = `📋 可用命令列表：
/assign <任務單號> @username [標題]
  分配任務給指定用戶
  範例: /assign PROJ-1234 @john 修復登入問題
/status <任務單號> <狀態>
  更新任務狀態
  可用狀態:
  ${this.validStatuses.map((status, index) => `  ${index}: ${status}`).join('\n\t')}
  範例: /status PROJ-1234 1 或 /status PROJ-1234 開發中
/progress <任務單號> <進度百分比數字>
  更新任務進度 (0-100 之間的數字)
  範例: /progress PROJ-1234 80
/report
  生成本週工作報告（可在私聊、群組或頻道中使用）
/reportstatus <任務單號> <週報狀態>
  設定任務的週報狀態（0=正在進行, 1=已上線, 2=下週繼續）
  範例: /reportstatus PROJ-1234 1 或 /reportstatus PROJ-1234 已上線
/mytasks
  查看本人負責的任務列表
💡 提示: 在群組中發送包含 Jira 連結的訊息，機器人會自動解析並分配任務
💡 提示: 在頻道中發送 /report 命令可直接在頻道中生成週報帖子
`;
      
      const helpKeyboard = {
        inline_keyboard: [
          [
            { text: '📋 分配任務', switch_inline_query_current_chat: '/assign ' },
            { text: '📊 更新狀態', switch_inline_query_current_chat: '/status ' }
          ],
          [
            { text: '📈 更新進度', switch_inline_query_current_chat: '/progress ' },
            { text: '📑 生成週報', switch_inline_query_current_chat: '/report' }
          ],
          [
            { text: '📋 我的任務', switch_inline_query_current_chat: '/mytasks' }
          ]
        ]
      };
      
      await ctx.reply(helpMessage, { reply_markup: helpKeyboard });
    });
    
    // 命令：/assign 
    this.bot.command('assign', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('assign', ctx, {
        原始參數: args
      });
      
      if (args.length < 2) {
        console.log('   ❌ 參數不足');
        
        const assignKeyboard = {
          inline_keyboard: [
            [
              { text: '❓ 查看幫助', callback_data: 'help_assign' },
              { text: '📋 範例', switch_inline_query_current_chat: '/assign PROJ-1234 @username 任務標題' }
            ]
          ]
        };
        
        return ctx.reply('用法: /assign <任務單號> @username [標題]\n或: /assign @username <任務單號> [標題]', {
          reply_markup: assignKeyboard
        });
      }

      // 智能識別參數順序：支援兩種格式
      // 格式1: /assign PROJ-1234 @username [標題]
      // 格式2: /assign @username PROJ-1234 [標題]
      let ticketId = null;
      let assigneeUsername = null;
      let title = null;

      // 檢查第一個參數是否是 @username
      const firstArgIsUsername = args[0] && args[0].startsWith('@');
      
      if (firstArgIsUsername) {
        // 格式2: /assign @username PROJ-1234 [標題]
        const assigneeMatch = args[0].match(/@?(\w+)/);
        if (assigneeMatch) {
          assigneeUsername = assigneeMatch[1];
        }
        ticketId = MessageParser.extractTicketId(args[1]);
        title = args.slice(2).join(' ') || null;
      } else {
        // 格式1: /assign PROJ-1234 @username [標題]
        ticketId = MessageParser.extractTicketId(args[0]);
        const assigneeMatch = args[1].match(/@?(\w+)/);
        if (assigneeMatch) {
          assigneeUsername = assigneeMatch[1];
        }
        title = args.slice(2).join(' ') || null;
      }

      // 驗證必要參數
      if (!ticketId) {
        console.log('   ❌ 無效的工作單號格式');
        return ctx.reply('❌ 無效的工作單號格式\n\n💡 提示：工作單號格式應為 PROJ-1234');
      }

      if (!assigneeUsername) {
        console.log('   ❌ 無效的用戶名格式');
        return ctx.reply('❌ 無效的用戶名格式\n\n💡 提示：請使用 @username 格式');
      }

      const jiraUrl = `https://jira.dsteam.vip/browse/${ticketId}`;

      console.log('✅ 參數解析成功:', {
        工作單號: ticketId,
        負責人: assigneeUsername,
        標題: title || '(無)',
        Jira連結: jiraUrl
      });

      await this.createTask(ctx, {
        ticketId,
        title,
        assigneeUsername,
        jiraUrl
      });
    });

    this.bot.command('status', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('status', ctx, {
        原始參數: args
      });

      if (args.length < 2) {
        const statusList = this.reportStatuses.map((status, index) => 
          `${index}: ${status}`
        ).join('\n');
        
        // 創建狀態選擇按鈕
        const statusButtons = this.reportStatuses.map((status, index) => ({
          text: `${index}: ${status}`,
          callback_data: `status_quick:${index}`
        }));
        
        const statusKeyboard = {
          inline_keyboard: [
            statusButtons,
            [
              { text: '❌ 取消', callback_data: 'status_cancel' }
            ]
          ]
        };
        
        return ctx.reply(`用法: /status <任務單號> <狀態>\n\n可用狀態:\n${statusList}`, {
          reply_markup: statusKeyboard
        });
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        console.log('   ❌ 無效的工作單號格式');
        return ctx.reply('無效的工作單號格式');
      }

      // 解析狀態輸入（可以是數字 0-3 或狀態文字）
      const statusInput = args.slice(1).join(' ');
      const newStatus = this.parseStatusInput(statusInput);
      
      console.log(`   狀態輸入: "${statusInput}" -> 解析為: "${newStatus}"`);
      
      if (!this.reportStatuses.includes(newStatus)) {
        const statusList = this.reportStatuses.map((status, index) => 
          `${index}: ${status}`
        ).join('\n');
        console.log('   ❌ 無效的狀態');
        return ctx.reply(`無效的狀態。可用狀態:\n${statusList}`);
      }

      try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name;
        console.log(`   正在更新任務 ${ticketId} 狀態為: ${newStatus}`);
        await this.db.updateReportStatus(ticketId, newStatus);
        console.log(`   ✅ 狀態更新成功`);
        
        // 新增操作按鈕
        const successKeyboard = {
          inline_keyboard: [
            [
              { text: '📈 更新進度', switch_inline_query_current_chat: `/progress ${ticketId} ` },
              { text: '📊 查看狀態', switch_inline_query_current_chat: `/status ${ticketId} ` }
            ],
            [
              { text: '📋 生成週報', switch_inline_query_current_chat: '/report' }
            ]
          ]
        };
        
        await ctx.reply(`✅ 任務 ${ticketId} 狀態已更新為: ${newStatus}`, {
          reply_markup: successKeyboard
        });
      } catch (error) {
        console.error(`   ❌ 更新失敗:`, error.message);
        
        // 新增錯誤處理按鈕
        const errorKeyboard = {
          inline_keyboard: [
            [
              { text: '🔄 重試', switch_inline_query_current_chat: ctx.message.text },
              { text: '❓ 查看幫助', callback_data: 'help_error' }
            ]
          ]
        };
        
        await ctx.reply(`❌ 更新失敗: ${error.message}`, {
          reply_markup: errorKeyboard
        });
      }
    });

    this.bot.command('progress', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('progress', ctx, {
        原始參數: args
      });

      if (args.length < 2) {
        console.log('   ❌ 參數不足');
        return ctx.reply('用法: /progress <任務單號> <百分比數字>');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        console.log('   ❌ 無效的工作單號格式');
        return ctx.reply('無效的工作單號格式');
      }

      const progress = parseInt(args[1]);
      console.log(`   解析進度: "${args[1]}" -> ${progress}`);
      
      if (isNaN(progress) || progress < 0 || progress > 100) {
        console.log('   ❌ 進度值無效');
        return ctx.reply('進度必須是 0-100 之間的數字');
      }

      try {
        console.log(`   正在更新任務 ${ticketId} 進度為: ${progress}%`);
        await this.db.updateTaskProgress(ticketId, progress);
        console.log(`   ✅ 進度更新成功`);
        
        // 新增操作按鈕
        const successKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 更新狀態', switch_inline_query_current_chat: `/status ${ticketId} ` },
              { text: '📈 繼續更新', switch_inline_query_current_chat: `/progress ${ticketId} ` }
            ],
            [
              { text: '📋 生成週報', switch_inline_query_current_chat: '/report' }
            ]
          ]
        };
        
        await ctx.reply(`✅ 任務 ${ticketId} 進度已更新為: ${progress}%`, {
          reply_markup: successKeyboard
        });
      } catch (error) {
        console.error(`   ❌ 更新失敗:`, error.message);
        
        // 新增錯誤處理按鈕
        const errorKeyboard = {
          inline_keyboard: [
            [
              { text: '🔄 重試', switch_inline_query_current_chat: ctx.message.text },
              { text: '❓ 查看幫助', callback_data: 'help_error' }
            ]
          ]
        };
        
        await ctx.reply(`❌ 更新失敗: ${error.message}`, {
          reply_markup: errorKeyboard
        });
      }
    });

    // 命令：/report - 生成週報
    // 可在私聊、群組或頻道中使用
    this.bot.command('report', async (ctx) => {
      this.logCommandDetails('report', ctx, {
        聊天類型: ctx.chat.type,
        是否為頻道: ctx.chat.type === 'channel'
      });
      await this.generateWeeklyReport(ctx);
    });


    // 命令：/mytasks - 查看本人負責的任務列表
    this.bot.command('mytasks', async (ctx) => {
      this.logCommandDetails('mytasks', ctx);
      await this.showMyTasks(ctx);
    });

    // 除錯：記錄所有收到的訊息（但跳過命令，因為已經記錄過了）
    this.bot.on('message', (ctx) => {
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
    this.bot.on('text', async (ctx) => {
      // 跳過命令（上面已經處理過了）
      if (ctx.message.text && ctx.message.text.startsWith('/')) {
        return;
      }
      
      // 只處理群組中的訊息（group 或 supergroup）
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        return;
      }

      const text = ctx.message.text;
      
      // 檢查訊息是否包含 Jira 連結
      if (!text.includes('jira.dsteam.vip/browse/')) {
        return;
      }

      const parsed = MessageParser.parseJiraMessage(text);
      
      console.log('🔍 解析 Jira 訊息結果:', parsed);

      // 只有在找到工作單號和負責人時才處理
      if (parsed && parsed.ticketId && parsed.assigneeUsername) {
        console.log(`✅ 檢測到工作分配: ${parsed.ticketId} -> @${parsed.assigneeUsername}`);
        await this.handleTaskAssignment(ctx, parsed);
      } else if (parsed && parsed.ticketId && !parsed.assigneeUsername) {
        // 找到 Jira 連結但未提及負責人
        console.log(`⚠️ 檢測到工作單 ${parsed.ticketId}，但未找到負責人`);
        
        const assignKeyboard = {
          inline_keyboard: [
            [
              { text: '📝 分配任務', switch_inline_query_current_chat: `/assign ${parsed.ticketId} @` }
            ],
            [
              { text: '❓ 查看幫助', callback_data: 'help_assign' }
            ]
          ]
        };
        
        await ctx.reply(`⚠️ 檢測到工作單 ${parsed.ticketId}，但未找到負責人。請使用 @用戶名 指定負責人，或使用命令：/assign ${parsed.ticketId} @username`, {
          reply_markup: assignKeyboard
        });
      } else {
        console.log('ℹ️ 訊息包含 Jira 連結但解析失敗');
      }
    });

    // 處理回調查詢（用於接受/拒絕按鈕和其他按鈕）
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, ...rest] = data.split(':');

      if (action === 'accept') {
        await this.handleTaskAcceptance(ctx, rest[0]);
      } else if (action === 'reject') {
        await this.handleTaskRejection(ctx, rest[0]);
      } else if (action === 'help_error' || action === 'help_assign') {
        await ctx.answerCbQuery('顯示幫助資訊');
        const helpMessage = `📋 可用命令列表：
/assign <任務單號> @username [標題]
  分配任務給指定用戶
  範例: /assign PROJ-1234 @john 修復登入問題
/status <任務單號> <狀態>
  更新任務狀態
  可用狀態:
  ${this.validStatuses.map((status, index) => `  ${index}: ${status}`).join('\n\t')}
  範例: /status PROJ-1234 1 或 /status PROJ-1234 開發中
/progress <任務單號> <進度百分比數字>
  更新任務進度 (0-100 之間的數字)
  範例: /progress PROJ-1234 80
/report
  生成本週工作報告（可在私聊、群組或頻道中使用）
/mytasks
  查看本人負責的任務列表（不包含封存任務）
💡 提示: 在群組中發送包含 Jira 連結的訊息，機器人會自動解析並分配任務
💡 提示: 在頻道中發送 /report 命令可直接在頻道中生成週報帖子
💡 提示: 封存的任務不會出現在週報和任務列表中
`;
        await ctx.reply(helpMessage);
      } else if (action === 'status_quick') {
        await ctx.answerCbQuery('請先輸入任務單號，然後使用此狀態');
        const statusIndex = parseInt(rest[0]);
        const status = this.validStatuses[statusIndex];
        await ctx.reply(`請使用命令：/status <任務單號> ${statusIndex} 或 /status <任務單號> ${status}`);
      } else if (action === 'status_cancel') {
        await ctx.answerCbQuery('已取消');
        await ctx.deleteMessage();
      } else if (action === 'refresh_mytasks') {
        await ctx.answerCbQuery('正在重新整理...');
        await this.showMyTasks(ctx);
      }
    });

    // 處理頻道帖子（channel post）
    this.bot.on('channel_post', async (ctx) => {
      const timestamp = new Date().toLocaleString('zh-TW', { 
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      console.log('\n' + '='.repeat(60));
      console.log('📢 收到頻道帖子');
      console.log(`⏰ 時間: ${timestamp}`);
      console.log(`📋 訊息內容: ${ctx.channelPost?.text || '[非文字訊息]'}`);
      console.log(`\n💬 頻道資訊:`);
      console.log(`   頻道名稱: ${ctx.chat.title || '未知'}`);
      console.log(`   頻道ID: ${ctx.chat.id}`);
      console.log(`   頻道用戶名: @${ctx.chat.username || '無'}`);
      console.log('='.repeat(60) + '\n');

      // 如果頻道帖子是命令，處理它
      if (ctx.channelPost?.text?.startsWith('/')) {
        const command = ctx.channelPost.text.split(' ')[0];
        console.log(`📝 頻道收到命令: ${command}`);
        
        // 處理頻道中的 /report 命令
        if (command === '/report') {
          await this.generateWeeklyReport(ctx);
        }
      }
    });
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
    if (!finalTitle && this.jiraService.enabled) {
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

    // 創建任務，狀態為「待確認」
    try {
      await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });

      // 發送確認訊息給負責人
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

      if (assigneeUserId) {
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

  async handleTaskAcceptance(ctx, ticketId) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      if (task.report_status !== '正在進行') {
        return ctx.answerCbQuery('任務狀態已變更');
      }

      // 檢查權限：只有任務負責人或管理員可以點擊
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

      if (!isAssignee && !isAdmin) {
        console.log(`   ❌ 權限不足：用戶 ${username} (${userId}) 嘗試接受任務 ${ticketId}`);
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以接受此任務', { show_alert: true });
      }

      console.log(`   ✅ 權限驗證通過：用戶 ${username} (${userId}) 接受任務 ${ticketId}`);
      await ctx.answerCbQuery('任務已受理');
      await ctx.editMessageText('✅ 任務已受理，狀態: 正在進行');
      
      // 注意：任務已經處於「待開發」狀態，無需再次更新
      // 受理只是確認分配
    } catch (error) {
      console.error('處理受理時發生錯誤:', error);
      await ctx.answerCbQuery('處理失敗');
    }
  }

  async handleTaskRejection(ctx, ticketId) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      // 檢查權限：只有任務負責人或管理員可以點擊
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

      if (!isAssignee && !isAdmin) {
        console.log(`   ❌ 權限不足：用戶 ${username} (${userId}) 嘗試拒絕任務 ${ticketId}`);
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以拒絕此任務', { show_alert: true });
      }

      console.log(`   ✅ 權限驗證通過：用戶 ${username} (${userId}) 拒絕任務 ${ticketId}`);
      await ctx.answerCbQuery('任務已拒絕');
      await ctx.editMessageText('❌ 任務已被拒絕');
    } catch (error) {
      console.error('處理拒絕時發生錯誤:', error);
      await ctx.answerCbQuery('處理失敗');
    }
  }

  async generateWeeklyReport(ctx) {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = 星期日, 1 = 星期一, 以此類推
      
      // 計算週開始（星期一）和結束（星期日）
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); // 星期一
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // 星期日
      weekEnd.setHours(23, 59, 59, 999);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
      };

      // 根據週報狀態獲取任務
      const ongoingTasks = await this.db.getTasksByReportStatus('正在進行');
      const completedTasks = await this.db.getTasksByReportStatus('已上線');
      const nextWeekTasks = await this.db.getTasksByReportStatus('下週繼續');

      // 構建報告
      let report = `📊 週報\n\n`;
      report += `日期: ${formatDate(weekStart)} ~ ${formatDate(weekEnd)}\n\n`;

      // 正在進行
      report += `- 正在進行\n`;
      if (ongoingTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        ongoingTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          const progress = task.progress > 0 ? ` - ${task.progress}%` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}${progress}\n`;
        });
      }

      report += `\n`;

      // 已上線（本週進度）
      report += `- 已上線（本週結單or上線的內容）\n`;
      if (completedTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        completedTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      report += `\n`;

      // 下週繼續處理
      report += `- 下週繼續處理\n`;
      if (nextWeekTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        nextWeekTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      // 如果是頻道帖子，使用 sendMessage；否則使用 reply
      if (ctx.chat.type === 'channel') {
        await ctx.telegram.sendMessage(ctx.chat.id, report);
      } else {
        await ctx.reply(report);
      }
    } catch (error) {
      console.error('生成報告時發生錯誤:', error);
      const errorMsg = `❌ 生成報告失敗: ${error.message}`;
      if (ctx.chat.type === 'channel') {
        await ctx.telegram.sendMessage(ctx.chat.id, errorMsg);
      } else {
        await ctx.reply(errorMsg);
      }
    }
  }

  async showMyTasks(ctx) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;
      
      console.log(`   正在查詢用戶 ${username} (${userId}) 的任務...`);
      
      // 獲取用戶的任務列表
      const tasks = await this.db.getMyTasks(userId, username);
      
      if (tasks.length === 0) {
        const emptyKeyboard = {
          inline_keyboard: [
            [
              { text: '📋 分配任務', switch_inline_query_current_chat: '/assign ' },
              { text: '❓ 查看幫助', callback_data: 'help_assign' }
            ]
          ]
        };
        
        await ctx.reply(`📋 您目前沒有任何負責的任務\n\n💡 提示：使用 /assign 命令分配任務，或在群組中發送包含 Jira 連結的訊息`, {
          reply_markup: emptyKeyboard
        });
        return;
      }

      // 按週報狀態分組任務（排除封存）
      const tasksByStatus = {};
      tasks.forEach(task => {
        const status = task.report_status || task.status || '正在進行';
        if (status !== '封存') {
          if (!tasksByStatus[status]) {
            tasksByStatus[status] = [];
          }
          tasksByStatus[status].push(task);
        }
      });

      // 構建任務列表訊息
      let message = `📋 您負責的任務列表\n\n`;
      message += `總共 ${tasks.length} 個任務（不包含封存）\n\n`;

      // 按照週報狀態順序顯示（排除封存）
      this.reportStatuses.filter(s => s !== '封存').forEach(status => {
        if (tasksByStatus[status] && tasksByStatus[status].length > 0) {
          message += `📌 ${status} (${tasksByStatus[status].length} 個)\n`;
          tasksByStatus[status].forEach((task, index) => {
            const title = task.title ? ` - ${task.title}` : '';
            const progress = task.progress > 0 ? ` (${task.progress}%)` : '';
            message += `  ${index + 1}. ${task.ticket_id}${title}${progress}\n`;
          });
          message += `\n`;
        }
      });

      // 添加操作按鈕
      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 更新狀態', switch_inline_query_current_chat: '/status ' },
            { text: '📈 更新進度', switch_inline_query_current_chat: '/progress ' }
          ],
          [
            { text: '📑 生成週報', switch_inline_query_current_chat: '/report' },
            { text: '🔄 重新整理', callback_data: 'refresh_mytasks' }
          ]
        ]
      };

      console.log(`   ✅ 找到 ${tasks.length} 個任務`);
      await ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('查詢任務列表時發生錯誤:', error);
      await ctx.reply(`❌ 查詢失敗: ${error.message}`);
    }
  }

  async launch() {
    try {
      // 設置機器人命令選單（選單按鈕）
      const commands = [
        { command: 'help', description: '顯示幫助資訊' },
        { command: 'assign', description: '分配任務給指定用戶' },
        { command: 'status', description: '更新任務狀態 (可用: 0-4 或狀態文字)' },
        { command: 'progress', description: '更新任務進度 (0-100)' },
        { command: 'report', description: '生成本週工作報告' },
        { command: 'reportstatus', description: '設定任務週報狀態 (0=正在進行, 1=已上線, 2=下週繼續)' },
        { command: 'mytasks', description: '查看本人負責的任務列表' }
      ];
      
      await this.bot.telegram.setMyCommands(commands);
      console.log('✅ 選單按鈕已設置');
      
      await this.bot.launch();
      console.log('✅ Bot 正在運行...');
      console.log('📋 已註冊的命令: /help, /assign, /status, /progress, /report, /mytasks');
      console.log('💡 提示: 在 Telegram 中發送命令測試，或查看控制台日誌');
      console.log('💡 提示: 任務狀態系統已改為週報狀態（正在進行、已上線、下週繼續、封存）');
      console.log('💡 提示: 點擊輸入框旁邊的選單按鈕可查看所有命令');
      console.log('💡 提示: 頻道帖子功能已啟用，可在頻道中使用 /report 命令');
      
      // 優雅關閉
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      console.error('❌ Bot 啟動失敗:', error);
      throw error;
    }
  }
}

export default MissionBot;

