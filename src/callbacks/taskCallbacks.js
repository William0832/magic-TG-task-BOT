import { REPORT_STATUSES } from '../constants/status.js';
import { TaskService } from '../services/taskService.js';
import { MyTasksService } from '../services/myTasksService.js';
import { AssignService } from '../services/assignService.js';

export class TaskCallbacks {
  constructor(db, bot, taskService, assignService) {
    this.db = db;
    this.bot = bot;
    this.taskService = taskService;
    this.assignService = assignService;
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
  範例: /status PROJ-1234 1 或 /status PROJ-1234 下週處理
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
      } else if (action === 'assign_select_user') {
        await this.showUserList(ctx);
      } else if (action === 'assign_user') {
        await this.promptTicketInfo(ctx, rest[0]);
      } else if (action === 'assign_cancel') {
        await ctx.answerCbQuery('已取消');
        if (this.assignService) {
          this.assignService.clearAssignState(ctx.from.id, ctx.chat.id);
        }
        await ctx.deleteMessage();
      }
    });
  }

  async showUserList(ctx) {
    try {
      await ctx.answerCbQuery('載入用戶列表...');
      
      // 檢查是否在群組中
      if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
        return ctx.editMessageText('⚠️ 此功能只能在群組中使用');
      }

      const chatId = ctx.chat.id;
      const members = new Map(); // 使用 Map 去重
      
      // 獲取聊天室管理員列表
      try {
        const administrators = await ctx.telegram.getChatAdministrators(chatId);
        for (const admin of administrators) {
          if (admin.user && !admin.user.is_bot) {
            const userId = admin.user.id;
            const username = admin.user.username;
            const fullName = `${admin.user.first_name} ${admin.user.last_name || ''}`.trim();
            
            // 使用 userId 作為 key 去重
            if (!members.has(userId)) {
              members.set(userId, {
                userId,
                username: username || null,
                fullName: fullName || admin.user.first_name || '未知用戶'
              });
            }
          }
        }
      } catch (error) {
        console.log(`   無法獲取管理員列表: ${error.message}`);
      }

      // 嘗試獲取聊天信息中的成員（如果可能）
      // 注意：Telegram Bot API 不提供直接獲取所有成員的方法
      // 我們只能獲取管理員列表

      // 如果沒有找到成員，提示用戶
      if (members.size === 0) {
        return ctx.editMessageText('⚠️ 無法獲取用戶列表\n\n💡 提示：請直接使用命令：\n/assign <任務單號> @username [標題]', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '⬅️ 返回', callback_data: 'assign_cancel' }
              ]
            ]
          }
        });
      }

      // 構建用戶按鈕（每行一個）
      const userButtons = [];
      const membersArray = Array.from(members.values());
      
      membersArray.forEach((member) => {
        const displayName = member.username ? `@${member.username}` : member.fullName;
        userButtons.push([{
          text: displayName,
          callback_data: `assign_user:${member.userId}:${member.username || member.fullName}`
        }]);
      });

      // 添加取消按鈕
      userButtons.push([
        { text: '⬅️ 返回', callback_data: 'assign_cancel' }
      ]);

      const keyboard = {
        inline_keyboard: userButtons
      };

      await ctx.editMessageText(`👥 選擇要分配任務的用戶：\n\n找到 ${membersArray.length} 個用戶（管理員）`, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('顯示用戶列表時發生錯誤:', error);
      await ctx.answerCbQuery('載入失敗');
      await ctx.editMessageText(`❌ 載入用戶列表失敗: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⬅️ 返回', callback_data: 'assign_cancel' }
            ]
          ]
        }
      });
    }
  }

  async promptTicketInfo(ctx, userIdAndUsername) {
    try {
      await ctx.answerCbQuery('請輸入任務資訊');
      
      const [userId, username] = userIdAndUsername.split(':');
      const displayName = username ? `@${username}` : `用戶 ${userId}`;
      
      // 保存選擇的用戶信息到分配服務
      if (this.assignService) {
        this.assignService.setAssignState(
          ctx.from.id,
          ctx.chat.id,
          userId,
          username || displayName
        );
      }
      
      const message = `📋 分配任務給 ${displayName}\n\n` +
        `請輸入任務資訊：\n\n` +
        `格式：<任務單號> [標題]\n` +
        `範例：PROJ-1234 修復登入問題\n\n` +
        `💡 提示：任務單號是必填的，標題是可選的\n` +
        `💡 提示：直接發送任務單號和標題即可`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '⬅️ 返回選擇用戶', callback_data: 'assign_select_user' },
            { text: '❌ 取消', callback_data: 'assign_cancel' }
          ]
        ]
      };

      await ctx.editMessageText(message, {
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('提示任務資訊時發生錯誤:', error);
      await ctx.answerCbQuery('處理失敗');
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

      // 檢查任務狀態（允許接受狀態為"正在進行"或 null 的任務）
      const currentStatus = task.report_status || task.status;
      if (currentStatus && currentStatus !== '正在進行') {
        return ctx.answerCbQuery(`任務狀態已變更為: ${currentStatus}`);
      }

      const { hasPermission } = await this.taskService.checkPermission(ctx, task);
      if (!hasPermission) {
        console.log(`   ❌ 權限不足：用戶 ${username} (${userId}) 嘗試接受任務 ${ticketId}`);
        return ctx.answerCbQuery('❌ 只有任務負責人或管理員可以接受此任務', { show_alert: true });
      }

      // 確保任務狀態為"正在進行"
      if (currentStatus !== '正在進行') {
        await this.db.updateReportStatus(ticketId, '正在進行');
        console.log(`   📝 更新任務 ${ticketId} 狀態為: 正在進行`);
      }

      console.log(`   ✅ 權限驗證通過：用戶 ${username} (${userId}) 接受任務 ${ticketId}`);
      await ctx.answerCbQuery('✅ 任務已受理');
      
      // 更新消息，顯示任務詳情
      const message = `✅ 任務已受理\n\n` +
        `工作單號: ${task.ticket_id}\n` +
        (task.title ? `標題: ${task.title}\n` : '') +
        `狀態: 正在進行\n` +
        `負責人: @${task.assignee_username}\n\n` +
        `任務已確認受理，可以開始處理。`;
      
      await ctx.editMessageText(message);
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

      // 將任務標記為封存（這樣就不會出現在任務列表和週報中）
      await this.db.updateReportStatus(ticketId, '封存');
      console.log(`   📝 任務 ${ticketId} 已標記為封存`);

      console.log(`   ✅ 權限驗證通過：用戶 ${username} (${userId}) 拒絕任務 ${ticketId}`);
      await ctx.answerCbQuery('✅ 任務已拒絕');
      
      // 更新消息
      const message = `❌ 任務已被拒絕\n\n` +
        `工作單號: ${task.ticket_id}\n` +
        (task.title ? `標題: ${task.title}\n` : '') +
        `狀態: 封存\n\n` +
        `此任務已被拒絕，不會出現在任務列表和週報中。`;
      
      await ctx.editMessageText(message);
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

