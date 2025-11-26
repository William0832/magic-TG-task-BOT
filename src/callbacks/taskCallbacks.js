import { REPORT_STATUSES } from '../constants/status.js';
import { TaskService } from '../services/taskService.js';
import { MyTasksService } from '../services/myTasksService.js';

export class TaskCallbacks {
  constructor(db, bot, taskService) {
    this.db = db;
    this.bot = bot;
    this.taskService = taskService;
    this.myTasksService = new MyTasksService(db);
  }

  setupCallbacks() {
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
  ${REPORT_STATUSES.map((status, index) => `  ${index}: ${status}`).join('\n\t')}
  範例: /status PROJ-1234 1 或 /status PROJ-1234 已上線
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
        const status = REPORT_STATUSES[statusIndex];
        await ctx.reply(`請使用命令：/status <任務單號> ${statusIndex} 或 /status <任務單號> ${status}`);
      } else if (action === 'status_cancel') {
        await ctx.answerCbQuery('已取消');
        await ctx.deleteMessage();
      } else if (action === 'refresh_mytasks') {
        await ctx.answerCbQuery('正在重新整理...');
        await this.myTasksService.refreshMyTasksMessage(ctx, 0);
      } else if (action === 'mytasks_page') {
        const page = parseInt(rest[0]) || 0;
        await ctx.answerCbQuery(`載入第 ${page + 1} 頁...`);
        await this.myTasksService.refreshMyTasksMessage(ctx, page);
      } else if (action === 'task_detail') {
        await this.showTaskDetail(ctx, rest[0]);
      } else if (action === 'task_back') {
        await ctx.answerCbQuery('返回任務列表');
        await this.myTasksService.refreshMyTasksMessage(ctx, 0);
      } else if (action === 'show_status_menu') {
        await this.showStatusMenu(ctx, rest[0]);
      } else if (action === 'show_progress_menu') {
        await this.showProgressMenu(ctx, rest[0]);
      } else if (action === 'update_status') {
        await this.updateTaskStatusFromButton(ctx, rest[0], rest[1]);
      } else if (action === 'update_progress') {
        await this.updateTaskProgressFromButton(ctx, rest[0], rest[1]);
      }
    });
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

      const { hasPermission } = await this.taskService.checkPermission(ctx, task);
      if (!hasPermission) {
        console.log(`   ❌ 權限不足：用戶 ${username} (${userId}) 嘗試接受任務 ${ticketId}`);
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以接受此任務', { show_alert: true });
      }

      console.log(`   ✅ 權限驗證通過：用戶 ${username} (${userId}) 接受任務 ${ticketId}`);
      await ctx.answerCbQuery('任務已受理');
      await ctx.editMessageText('✅ 任務已受理，狀態: 正在進行');
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

      const { hasPermission } = await this.taskService.checkPermission(ctx, task);
      if (!hasPermission) {
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

  async showTaskDetail(ctx, ticketId) {
    try {
      await ctx.answerCbQuery('載入任務詳情...');
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.editMessageText('❌ 任務不存在');
      }

      let message = `📋 任務詳情\n\n`;
      message += `工作單號: ${task.ticket_id}\n`;
      if (task.title) {
        message += `標題: ${task.title}\n`;
      }
      message += `負責人: @${task.assignee_username}\n`;
      message += `狀態: ${task.report_status || task.status || '正在進行'}\n`;
      message += `進度: ${task.progress || 0}%\n`;
      if (task.jira_url) {
        message += `連結: ${task.jira_url}\n`;
      }
      if (task.updated_at) {
        message += `更新時間: ${task.updated_at}\n`;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 更新狀態', callback_data: `show_status_menu:${ticketId}` },
            { text: '📈 更新進度', callback_data: `show_progress_menu:${ticketId}` }
          ],
          [
            { text: '⬅️ 返回列表', callback_data: 'task_back' }
          ]
        ]
      };

      await ctx.editMessageText(message, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('顯示任務詳情時發生錯誤:', error);
      await ctx.answerCbQuery('載入失敗');
      await ctx.editMessageText(`❌ 載入任務詳情失敗: ${error.message}`);
    }
  }

  async showStatusMenu(ctx, ticketId) {
    try {
      await ctx.answerCbQuery('選擇狀態');
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      const statusButtons = REPORT_STATUSES.map((status, index) => ({
        text: `${index}: ${status}`,
        callback_data: `update_status:${ticketId}:${index}`
      }));

      const keyboardRows = [];
      for (let i = 0; i < statusButtons.length; i += 2) {
        keyboardRows.push(statusButtons.slice(i, i + 2));
      }

      keyboardRows.push([
        { text: '⬅️ 返回詳情', callback_data: `task_detail:${ticketId}` }
      ]);

      const keyboard = {
        inline_keyboard: keyboardRows
      };

      await ctx.editMessageText(`📊 選擇任務 ${ticketId} 的新狀態：`, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('顯示狀態選單時發生錯誤:', error);
      await ctx.answerCbQuery('載入失敗');
    }
  }

  async showProgressMenu(ctx, ticketId) {
    try {
      await ctx.answerCbQuery('選擇進度');
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      const progressButtons = [
        { text: '10%', callback_data: `update_progress:${ticketId}:10` },
        { text: '25%', callback_data: `update_progress:${ticketId}:25` },
        { text: '50%', callback_data: `update_progress:${ticketId}:50` },
        { text: '75%', callback_data: `update_progress:${ticketId}:75` },
        { text: '100%', callback_data: `update_progress:${ticketId}:100` }
      ];

      const keyboard = {
        inline_keyboard: [
          progressButtons,
          [
            { text: '⬅️ 返回詳情', callback_data: `task_detail:${ticketId}` }
          ]
        ]
      };

      await ctx.editMessageText(`📈 選擇任務 ${ticketId} 的新進度：`, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('顯示進度選單時發生錯誤:', error);
      await ctx.answerCbQuery('載入失敗');
    }
  }

  async updateTaskStatusFromButton(ctx, ticketId, statusIndex) {
    try {
      const statusIndexNum = parseInt(statusIndex);
      if (isNaN(statusIndexNum) || statusIndexNum < 0 || statusIndexNum >= REPORT_STATUSES.length) {
        return ctx.answerCbQuery('無效的狀態');
      }

      const newStatus = REPORT_STATUSES[statusIndexNum];
      
      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      const { hasPermission } = await this.taskService.checkPermission(ctx, task);
      if (!hasPermission) {
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以更新狀態', { show_alert: true });
      }

      await this.db.updateReportStatus(ticketId, newStatus);
      await ctx.answerCbQuery(`✅ 狀態已更新為: ${newStatus}`);
      await this.showTaskDetail(ctx, ticketId);
    } catch (error) {
      console.error('更新狀態時發生錯誤:', error);
      await ctx.answerCbQuery('更新失敗');
    }
  }

  async updateTaskProgressFromButton(ctx, ticketId, progressValue) {
    try {
      const progress = parseInt(progressValue);
      if (isNaN(progress) || progress < 0 || progress > 100) {
        return ctx.answerCbQuery('無效的進度值');
      }

      const task = await this.db.getTaskByTicketId(ticketId);
      if (!task) {
        return ctx.answerCbQuery('任務不存在');
      }

      const { hasPermission } = await this.taskService.checkPermission(ctx, task);
      if (!hasPermission) {
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以更新進度', { show_alert: true });
      }

      await this.db.updateTaskProgress(ticketId, progress);
      await ctx.answerCbQuery(`✅ 進度已更新為: ${progress}%`);
      await this.showTaskDetail(ctx, ticketId);
    } catch (error) {
      console.error('更新進度時發生錯誤:', error);
      await ctx.answerCbQuery('更新失敗');
    }
  }
}

