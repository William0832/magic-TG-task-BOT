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
    // Handle text messages in groups
    this.bot.on('text', async (ctx) => {
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

      // Only process if we found a ticket ID and an assignee
      if (parsed && parsed.ticketId && parsed.assigneeUsername) {
        await this.handleTaskAssignment(ctx, parsed);
      } else if (parsed && parsed.ticketId && !parsed.assigneeUsername) {
        // Found Jira link but no assignee mentioned
        await ctx.reply(`⚠️ 检测到工作单 ${parsed.ticketId}，但未找到负责人。请使用 @用户名 指定负责人，或使用命令：/assign ${parsed.ticketId} @username`);
      }
    });

    // Command: /assign PROJ-4326 @username [title]
    this.bot.command('assign', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) {
        return ctx.reply('用法: /assign PROJ-4326 @username [标题]');
      }

      const ticketId = MessageParser.extractTicketId(args[0]);
      if (!ticketId) {
        return ctx.reply('无效的工作单号格式');
      }

      const assigneeMatch = args[1].match(/@?(\w+)/);
      if (!assigneeMatch) {
        return ctx.reply('无效的用户名格式');
      }

      const assigneeUsername = assigneeMatch[1];
      const title = args.slice(2).join(' ') || null;
      const jiraUrl = `https://jira.dsteam.vip/browse/${ticketId}`;

      await this.createTask(ctx, {
        ticketId,
        title,
        assigneeUsername,
        jiraUrl
      });
    });

    // Command: /status PROJ-4326 开发中
    this.bot.command('status', async (ctx) => {
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
    // Usage: /report [my] - "my" to show only your tasks, otherwise show all tasks
    this.bot.command('report', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const showMyTasksOnly = args.length > 0 && args[0].toLowerCase() === 'my';
      
      // Get user info if showing personal tasks
      // Note: We need username for database lookup, but if user doesn't have username,
      // we'll need to use a different approach (like storing user_id in tasks)
      const username = showMyTasksOnly ? ctx.from.username : null;
      
      if (showMyTasksOnly && !username) {
        return ctx.reply('❌ 无法生成个人周报：您的账号没有设置 Telegram 用户名。\n请先在 Telegram 设置中设置用户名，或使用 /report 查看所有任务。');
      }
      
      await this.generateWeeklyReport(ctx, username);
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

    try {
      await this.db.createTask({
        ticketId,
        title: finalTitle,
        assigneeUsername,
        assigneeUserId,
        jiraUrl
      });

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

  async generateWeeklyReport(ctx, username = null) {
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

      // Get active tasks (filter by user if specified)
      let activeTasks;
      if (username) {
        activeTasks = await this.db.getTasksByAssignee(username);
        // Filter out completed tasks
        activeTasks = activeTasks.filter(task => 
          task.status !== '待上線' && task.status !== '已完成'
        );
      } else {
        activeTasks = await this.db.getAllActiveTasks();
      }
      
      // Get completed tasks this week
      let completedTasks = await this.db.getTasksCompletedThisWeek(
        weekStart.toISOString(),
        weekEnd.toISOString()
      );
      
      // Filter by user if specified
      if (username) {
        completedTasks = completedTasks.filter(task => 
          task.assignee_username === username
        );
      }

      // Build report
      const reportTitle = username 
        ? `📊 個人週報 (@${username})\n\n` 
        : `📊 週報\n\n`;
      let report = reportTitle;
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
    await this.bot.launch();
    console.log('Bot is running...');
    
    // Graceful shutdown
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

export default MissionBot;

