import { Telegraf } from 'telegraf';
import Database from './database.js';
import MessageParser from './messageParser.js';
import JiraService from './jira.js';

class MissionBot {
  constructor(token, db, jiraService) {
    this.bot = new Telegraf(token);
    this.db = db;
    this.jiraService = jiraService;
    this.validStatuses = ['待開發', '開發中', '待測試', '測試中', '待上線'];
    // 狀態數字對應：0-4 對應狀態文字
    this.statusNumberMap = {
      '0': '待開發',
      '1': '開發中',
      '2': '待測試',
      '3': '測試中',
      '4': '待上線'
    };
    
    this.setupHandlers();
  }

  // 將狀態輸入（數字或文字）轉換為狀態文字
  parseStatusInput(input) {
    // 檢查輸入是否為數字 (0-4)
    if (/^[0-4]$/.test(input.trim())) {
      return this.statusNumberMap[input.trim()];
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
  範例: /status PROJ-1234 1 或 /status PROJ-4326 開發中
/progress <任務單號> <進度百分比數字>
  更新任務進度 (0-100 之間的數字)
  範例: /progress PROJ-1234 80
/report
  生成本週工作報告（可在私聊、群組或頻道中使用）
/post <頻道ID或頻道用戶名>
  發送週報到指定頻道
  範例: /post @my_channel 或 /post -1001234567890
💡 提示: 在群組中發送包含 Jira 連結的訊息，機器人會自動解析並分配任務
💡 提示: 在頻道中發送 /report 命令可直接在頻道中生成週報帖子
`;
      await ctx.reply(helpMessage);
    });
    
    // 命令：/assign PROJ-4326 @username [title]
    this.bot.command('assign', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('assign', ctx, {
        原始參數: args
      });
      
      if (args.length < 2) {
        console.log('   ❌ 參數不足');
        return ctx.reply('用法: /assign PROJ-4326 @username [標題]');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        console.log('   ❌ 無效的工作單號格式');
        return ctx.reply('無效的工作單號格式');
      }

      const assigneeMatch = args[1].match(/@?(\w+)/);
      if (!assigneeMatch) {
        console.log('   ❌ 無效的用戶名格式');
        return ctx.reply('無效的用戶名格式');
      }

      const assigneeUsername = assigneeMatch[1];
      const title = args.slice(2).join(' ') || null;
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

    // 命令：/status PROJ-4326 開發中 或 /status PROJ-4326 1
    this.bot.command('status', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('status', ctx, {
        原始參數: args
      });

      if (args.length < 2) {
        const statusList = this.validStatuses.map((status, index) => 
          `${index}: ${status}`
        ).join('\n');
        return ctx.reply(`用法: /status PROJ-4326 <狀態>\n\n可用狀態:\n${statusList}`);
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        console.log('   ❌ 無效的工作單號格式');
        return ctx.reply('無效的工作單號格式');
      }

      // 解析狀態輸入（可以是數字 0-4 或狀態文字）
      const statusInput = args.slice(1).join(' ');
      const newStatus = this.parseStatusInput(statusInput);
      
      console.log(`   狀態輸入: "${statusInput}" -> 解析為: "${newStatus}"`);
      
      if (!this.validStatuses.includes(newStatus)) {
        const statusList = this.validStatuses.map((status, index) => 
          `${index}: ${status}`
        ).join('\n');
        console.log('   ❌ 無效的狀態');
        return ctx.reply(`無效的狀態。可用狀態:\n${statusList}`);
      }

      try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name;
        console.log(`   正在更新任務 ${ticketId} 狀態為: ${newStatus}`);
        await this.db.updateTaskStatus(ticketId, newStatus, userId, username);
        console.log(`   ✅ 狀態更新成功`);
        await ctx.reply(`✅ 任務 ${ticketId} 狀態已更新為: ${newStatus}`);
      } catch (error) {
        console.error(`   ❌ 更新失敗:`, error.message);
        await ctx.reply(`❌ 更新失敗: ${error.message}`);
      }
    });

    // 命令：/progress PROJ-4326 80
    this.bot.command('progress', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('progress', ctx, {
        原始參數: args
      });

      if (args.length < 2) {
        console.log('   ❌ 參數不足');
        return ctx.reply('用法: /progress PROJ-4326 80');
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
        await ctx.reply(`✅ 任務 ${ticketId} 進度已更新為: ${progress}%`);
      } catch (error) {
        console.error(`   ❌ 更新失敗:`, error.message);
        await ctx.reply(`❌ 更新失敗: ${error.message}`);
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

    // 命令：/post <頻道ID或頻道用戶名> - 發送週報到指定頻道
    // 例如：/post @my_channel 或 /post -1001234567890
    this.bot.command('post', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      this.logCommandDetails('post', ctx, {
        原始參數: args,
        目標頻道: args[0] || '未指定'
      });
      
      if (args.length < 1) {
        console.log('   ❌ 參數不足');
        return ctx.reply('用法: /post <頻道ID或頻道用戶名>\n範例: /post @my_channel 或 /post -1001234567890');
      }

      const channelId = args[0];
      console.log(`   目標頻道: ${channelId}`);
      
      try {
        console.log(`   📤 正在生成週報並發送到頻道 ${channelId}...`);
        await ctx.reply(`📤 正在生成週報並發送到頻道 ${channelId}...`);
        await this.sendWeeklyReportToChannel(channelId);
        console.log(`   ✅ 週報已成功發送到頻道 ${channelId}`);
        await ctx.reply(`✅ 週報已成功發送到頻道 ${channelId}`);
      } catch (error) {
        console.error(`   ❌ 發送失敗:`, error.message);
        console.error(`   錯誤詳情:`, error.response || error);
        await ctx.reply(`❌ 發送失敗: ${error.message}\n\n提示：確保機器人已加入頻道並有發送訊息的權限`);
      }
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
        await ctx.reply(`⚠️ 檢測到工作單 ${parsed.ticketId}，但未找到負責人。請使用 @用戶名 指定負責人，或使用命令：/assign ${parsed.ticketId} @username`);
      } else {
        console.log('ℹ️ 訊息包含 Jira 連結但解析失敗');
      }
    });

    // 處理回調查詢（用於接受/拒絕按鈕）
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, ticketId] = data.split(':');

      if (action === 'accept') {
        await this.handleTaskAcceptance(ctx, ticketId);
      } else if (action === 'reject') {
        await ctx.answerCbQuery('任務已拒絕');
        await ctx.editMessageText('❌ 任務已被拒絕');
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
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      if (task.status !== '待開發') {
        return ctx.answerCbQuery('任務狀態已變更');
      }

      await ctx.answerCbQuery('任務已受理');
      await ctx.editMessageText('✅ 任務已受理，狀態: 待開發');
      
      // 注意：任務已經處於「待開發」狀態，無需再次更新
      // 受理只是確認分配
    } catch (error) {
      console.error('處理受理時發生錯誤:', error);
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

      // 獲取所有進行中的任務
      const activeTasks = await this.db.getAllActiveTasks();
      
      // 獲取本週完成的任務
      const completedTasks = await this.db.getTasksCompletedThisWeek(
        weekStart.toISOString(),
        weekEnd.toISOString()
      );

      // 構建報告
      let report = `📊 週報\n\n`;
      report += `日期: ${formatDate(weekStart)} ~ ${formatDate(weekEnd)}\n\n`;

      // 目前工作
      report += `- 目前工作\n`;
      if (activeTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        activeTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title} - ${task.progress}%\n`;
        });
      }

      report += `\n`;

      // 本週進度
      report += `- 本週進度(本週結單or上線的內容)\n`;
      if (completedTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        completedTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      report += `\n`;

      // 下週預計任務（目前與進行中的任務相同）
      report += `- 下週預計任務\n`;
      if (activeTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        activeTasks.forEach((task, index) => {
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

  // 發送訊息到頻道
  async sendToChannel(channelId, message, options = {}) {
    try {
      const result = await this.bot.telegram.sendMessage(channelId, message, options);
      console.log(`✅ 已發送訊息到頻道 ${channelId}`);
      return result;
    } catch (error) {
      console.error(`❌ 發送訊息到頻道失敗 (${channelId}):`, error);
      throw error;
    }
  }

  // 生成並發送週報到頻道
  async sendWeeklyReportToChannel(channelId) {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();
      
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
      };

      const activeTasks = await this.db.getAllActiveTasks();
      const completedTasks = await this.db.getTasksCompletedThisWeek(
        weekStart.toISOString(),
        weekEnd.toISOString()
      );

      let report = `📊 週報\n\n`;
      report += `日期: ${formatDate(weekStart)} ~ ${formatDate(weekEnd)}\n\n`;

      report += `- 目前工作\n`;
      if (activeTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        activeTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title} - ${task.progress}%\n`;
        });
      }

      report += `\n- 本週進度(本週結單or上線的內容)\n`;
      if (completedTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        completedTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      report += `\n- 下週預計任務\n`;
      if (activeTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        activeTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      await this.sendToChannel(channelId, report);
      return report;
    } catch (error) {
      console.error('生成並發送週報到頻道時發生錯誤:', error);
      throw error;
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
        { command: 'post', description: '發送週報到指定頻道' }
      ];
      
      await this.bot.telegram.setMyCommands(commands);
      console.log('✅ 選單按鈕已設置');
      
      await this.bot.launch();
      console.log('✅ Bot 正在運行...');
      console.log('📋 已註冊的命令: /help, /assign, /status, /progress, /report, /post');
      console.log('💡 提示: 在 Telegram 中發送命令測試，或查看控制台日誌');
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

