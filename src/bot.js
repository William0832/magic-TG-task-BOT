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
    
    this.setupHandlers();
  }

  setupHandlers() {
    // IMPORTANT: Register command handlers FIRST, before text handlers
    // This ensures commands are processed before being caught by text handlers
    
    // Command: /assign PROJ-4326 @username [title]
    this.bot.command('assign', async (ctx) => {
      console.log('📝 收到 /assign 命令');
      console.log('   完整命令:', ctx.message.text);
      console.log('   发送者:', ctx.from.username || ctx.from.first_name, `(${ctx.from.id})`);
      console.log('   聊天类型:', ctx.chat.type, ctx.chat.title || ctx.chat.first_name);
      
      const args = ctx.message.text.split(' ').slice(1);
      console.log('   解析参数:', args);
      
      if (args.length < 2) {
        console.log('   ❌ 参数不足');
        return ctx.reply('用法: /assign PROJ-4326 @username [标题]');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      console.log('   提取工作单号:', ticketId);
      if (!ticketId) {
        console.log('   ❌ 无效的工作单号格式');
        return ctx.reply('无效的工作单号格式');
      }

      const assigneeMatch = args[1].match(/@?(\w+)/);
      console.log('   匹配负责人:', assigneeMatch);
      if (!assigneeMatch) {
        console.log('   ❌ 无效的用户名格式');
        return ctx.reply('无效的用户名格式');
      }

      const assigneeUsername = assigneeMatch[1];
      const title = args.slice(2).join(' ') || null;
      const jiraUrl = `https://jira.dsteam.vip/browse/${ticketId}`;

      console.log('✅ 参数解析成功:', {
        ticketId,
        assigneeUsername,
        title,
        jiraUrl
      });

      await this.createTask(ctx, {
        ticketId,
        title,
        assigneeUsername,
        jiraUrl
      });
    });

    // Command: /status PROJ-4326 开发中
    this.bot.command('status', async (ctx) => {
      console.log('📝 收到 /status 命令');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) {
        return ctx.reply('用法: /status PROJ-4326 開發中');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        return ctx.reply('无效的工作单号格式');
      }

      const newStatus = args.slice(1).join(' ');
      if (!this.validStatuses.includes(newStatus)) {
        return ctx.reply(`无效的状态。可用状态: ${this.validStatuses.join(', ')}`);
      }

      try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name;
        await this.db.updateTaskStatus(ticketId, newStatus, userId, username);
        await ctx.reply(`✅ 任务 ${ticketId} 状态已更新为: ${newStatus}`);
      } catch (error) {
        await ctx.reply(`❌ 更新失败: ${error.message}`);
      }
    });

    // Command: /progress PROJ-4326 80
    this.bot.command('progress', async (ctx) => {
      console.log('📝 收到 /progress 命令');
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) {
        return ctx.reply('用法: /progress PROJ-4326 80');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        return ctx.reply('无效的工作单号格式');
      }

      const progress = parseInt(args[1]);
      if (isNaN(progress) || progress < 0 || progress > 100) {
        return ctx.reply('进度必须是 0-100 之间的数字');
      }

      try {
        await this.db.updateTaskProgress(ticketId, progress);
        await ctx.reply(`✅ 任务 ${ticketId} 进度已更新为: ${progress}%`);
      } catch (error) {
        await ctx.reply(`❌ 更新失败: ${error.message}`);
      }
    });

    // Command: /report - Generate weekly report
    // Can be used in private chat or group
    this.bot.command('report', async (ctx) => {
      console.log('📝 收到 /report 命令');
      await this.generateWeeklyReport(ctx);
    });

    // Debug: Log all incoming messages (but skip commands as they're already logged)
    this.bot.on('message', (ctx) => {
      // Skip logging commands (they're already logged above)
      if (ctx.message.text && ctx.message.text.startsWith('/')) {
        return;
      }
      
      const chatType = ctx.chat.type;
      const chatTitle = ctx.chat.title || ctx.chat.first_name || 'Unknown';
      const username = ctx.from.username || ctx.from.first_name || 'Unknown';
      const userId = ctx.from.id;
      const messageText = ctx.message.text || '[非文本消息]';
      
      console.log('📨 收到消息:', {
        聊天类型: chatType,
        聊天名称: chatTitle,
        用户: `@${username} (${userId})`,
        消息内容: messageText,
        时间: new Date().toLocaleString('zh-TW')
      });
    });

    // Handle text messages in groups (but exclude commands)
    this.bot.on('text', async (ctx) => {
      // Skip commands (they're handled by command handlers above)
      if (ctx.message.text && ctx.message.text.startsWith('/')) {
        return;
      }
      
      // Only process messages in groups (group or supergroup)
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        return;
      }

      const text = ctx.message.text;
      
      // Check if message contains Jira link
      if (!text.includes('jira.dsteam.vip/browse/')) {
        return;
      }

      const parsed = MessageParser.parseJiraMessage(text);
      
      console.log('🔍 解析 Jira 消息结果:', parsed);

      // Only process if we found a ticket ID and an assignee
      if (parsed && parsed.ticketId && parsed.assigneeUsername) {
        console.log(`✅ 检测到工作分配: ${parsed.ticketId} -> @${parsed.assigneeUsername}`);
        await this.handleTaskAssignment(ctx, parsed);
      } else if (parsed && parsed.ticketId && !parsed.assigneeUsername) {
        // Found Jira link but no assignee mentioned
        console.log(`⚠️ 检测到工作单 ${parsed.ticketId}，但未找到负责人`);
        await ctx.reply(`⚠️ 检测到工作单 ${parsed.ticketId}，但未找到负责人。请使用 @用户名 指定负责人，或使用命令：/assign ${parsed.ticketId} @username`);
      } else {
        console.log('ℹ️ 消息包含 Jira 链接但解析失败');
      }
    });

    // Handle callback queries (for accept/reject buttons)
    this.bot.on('callback_query', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, ticketId] = data.split(':');

      if (action === 'accept') {
        await this.handleTaskAcceptance(ctx, ticketId);
      } else if (action === 'reject') {
        await ctx.answerCbQuery('任务已拒绝');
        await ctx.editMessageText('❌ 任务已被拒绝');
      }
    });
  }

  async handleTaskAssignment(ctx, parsed) {
    const { ticketId, title, assigneeUsername, jiraUrl } = parsed;

    // Check if task already exists
    const existingTask = await this.db.getTaskByTicketId(ticketId);
    if (existingTask) {
      return ctx.reply(`⚠️ 任务 ${ticketId} 已存在`);
    }

    // Try to fetch title from Jira if not provided
    let finalTitle = title;
    if (!finalTitle && this.jiraService.enabled) {
      const jiraInfo = await this.jiraService.fetchTitleFromUrl(jiraUrl);
      if (jiraInfo) {
        finalTitle = jiraInfo.title;
      }
    }

    // Find assignee user ID (try to get from chat if in group)
    let assigneeUserId = null;
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${assigneeUsername}`);
        assigneeUserId = chatMember.user.id;
      } catch (error) {
        console.log(`Could not find user @${assigneeUsername} in chat`);
      }
    }

    // Create task with "pending acceptance" status
    try {
      await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });

      // Send confirmation message to assignee
      const message = `📋 新任务分配\n\n` +
        `工作单号: ${ticketId}\n` +
        (finalTitle ? `标题: ${finalTitle}\n` : '') +
        `链接: ${jiraUrl}\n\n` +
        `请确认是否受理此任务？`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ 受理', callback_data: `accept:${ticketId}` },
            { text: '❌ 拒绝', callback_data: `reject:${ticketId}` }
          ]
        ]
      };

      if (assigneeUserId) {
        await ctx.telegram.sendMessage(assigneeUserId, message, { reply_markup: keyboard });
        await ctx.reply(`✅ 任务 ${ticketId} 已分配给 @${assigneeUsername}，等待确认中...`);
      } else {
        await ctx.reply(message, { reply_markup: keyboard });
      }
    } catch (error) {
      console.error('Error creating task:', error);
      await ctx.reply(`❌ 创建任务失败: ${error.message}`);
    }
  }

  async createTask(ctx, taskData) {
    const { ticketId, title, assigneeUsername, jiraUrl } = taskData;

    console.log('🔄 开始创建任务:', { ticketId, title, assigneeUsername, jiraUrl });

    // Check if task already exists
    const existingTask = await this.db.getTaskByTicketId(ticketId);
    if (existingTask) {
      console.log(`⚠️ 任务 ${ticketId} 已存在`);
      return ctx.reply(`⚠️ 任务 ${ticketId} 已存在`);
    }

    // Try to fetch title from Jira if not provided
    let finalTitle = title;
    if (!finalTitle && this.jiraService.enabled) {
      console.log('   🔍 尝试从 Jira API 获取标题...');
      const jiraInfo = await this.jiraService.fetchTitleFromUrl(jiraUrl);
      if (jiraInfo) {
        finalTitle = jiraInfo.title;
        console.log('   ✅ 从 Jira 获取到标题:', finalTitle);
      } else {
        console.log('   ℹ️ 无法从 Jira 获取标题');
      }
    } else if (!finalTitle) {
      console.log('   ℹ️ Jira API 未启用，使用提供的标题或留空');
    }

    // Find assignee user ID (try to get from chat if in group)
    let assigneeUserId = null;
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      console.log(`   🔍 尝试在群组中查找用户 @${assigneeUsername}...`);
      try {
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, `@${assigneeUsername}`);
        assigneeUserId = chatMember.user.id;
        console.log(`   ✅ 找到用户 ID: ${assigneeUserId}`);
      } catch (error) {
        console.log(`   ⚠️ 无法在群组中找到用户 @${assigneeUsername}:`, error.message);
      }
    } else {
      console.log('   ℹ️ 不在群组中，跳过用户 ID 查找');
    }

    try {
      console.log('   💾 保存任务到数据库...');
      const taskId = await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });
      console.log(`   ✅ 任务已保存，数据库 ID: ${taskId}`);

      const message = `📋 新任务分配\n\n` +
        `工作单号: ${ticketId}\n` +
        (finalTitle ? `标题: ${finalTitle}\n` : '') +
        `链接: ${jiraUrl}\n\n` +
        `请确认是否受理此任务？`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ 受理', callback_data: `accept:${ticketId}` },
            { text: '❌ 拒绝', callback_data: `reject:${ticketId}` }
          ]
        ]
      };

      if (assigneeUserId) {
        console.log(`   📤 发送确认消息给用户 ${assigneeUserId}...`);
        await ctx.telegram.sendMessage(assigneeUserId, message, { reply_markup: keyboard });
        console.log('   ✅ 确认消息已发送');
        await ctx.reply(`✅ 任务 ${ticketId} 已分配给 @${assigneeUsername}，等待确认中...`);
      } else {
        console.log('   📤 在群组中发送确认消息...');
        await ctx.reply(message, { reply_markup: keyboard });
      }
      console.log('✅ 任务创建流程完成');
    } catch (error) {
      console.error('❌ 创建任务失败:', error);
      await ctx.reply(`❌ 创建任务失败: ${error.message}`);
    }
  }

  async handleTaskAcceptance(ctx, ticketId) {
    try {
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任务不存在');
      }

      if (task.status !== '待開發') {
        return ctx.answerCbQuery('任务状态已变更');
      }

      await ctx.answerCbQuery('任务已受理');
      await ctx.editMessageText('✅ 任务已受理，状态: 待開發');
      
      // Note: Task is already in "待開發" status, no need to update again
      // The acceptance just confirms the assignment
    } catch (error) {
      console.error('Error handling acceptance:', error);
      await ctx.answerCbQuery('处理失败');
    }
  }

  async generateWeeklyReport(ctx) {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      // Calculate week start (Monday) and end (Sunday)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)); // Monday
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // Sunday
      weekEnd.setHours(23, 59, 59, 999);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
      };

      // Get all active tasks
      const activeTasks = await this.db.getAllActiveTasks();
      
      // Get completed tasks this week
      const completedTasks = await this.db.getTasksCompletedThisWeek(
        weekStart.toISOString(),
        weekEnd.toISOString()
      );

      // Build report
      let report = `📊 週報\n\n`;
      report += `日期: ${formatDate(weekStart)} ~ ${formatDate(weekEnd)}\n\n`;

      // Current tasks
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

      // This week's progress
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

      // Next week's planned tasks (same as current active tasks for now)
      report += `- 下週預計任務\n`;
      if (activeTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        activeTasks.forEach((task, index) => {
          const title = task.title ? ` ${task.title}` : '';
          report += ` ${index + 1}. ${task.ticket_id}${title}\n`;
        });
      }

      await ctx.reply(report);
    } catch (error) {
      console.error('Error generating report:', error);
      await ctx.reply(`❌ 生成报告失败: ${error.message}`);
    }
  }

  async launch() {
    try {
      await this.bot.launch();
      console.log('✅ Bot is running...');
      console.log('📋 已注册的命令: /assign, /status, /progress, /report');
      console.log('💡 提示: 在 Telegram 中发送命令测试，或查看控制台日志');
      
      // Graceful shutdown
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      console.error('❌ Bot 启动失败:', error);
      throw error;
    }
  }
}

export default MissionBot;

