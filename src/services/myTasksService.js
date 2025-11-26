import { REPORT_STATUSES } from '../constants/status.js';

export class MyTasksService {
  constructor(db) {
    this.db = db;
  }

  async showMyTasks(ctx, page = 0) {
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

      // 每頁顯示5個任務
      const tasksPerPage = 5;
      const totalPages = Math.ceil(tasks.length / tasksPerPage);
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const startIndex = currentPage * tasksPerPage;
      const endIndex = Math.min(startIndex + tasksPerPage, tasks.length);
      const currentTasks = tasks.slice(startIndex, endIndex);

      // 按週報狀態統計
      const tasksByStatus = {};
      tasks.forEach(task => {
        const status = task.report_status || task.status || '正在進行';
        if (status !== '封存') {
          if (!tasksByStatus[status]) {
            tasksByStatus[status] = 0;
          }
          tasksByStatus[status]++;
        }
      });

      // 構建任務列表訊息
      let message = `📋 您負責的任務列表\n\n`;
      message += `總共 ${tasks.length} 個任務（不包含封存）\n`;
      
      // 顯示狀態統計
      const statusStats = [];
      REPORT_STATUSES.filter(s => s !== '封存').forEach(status => {
        if (tasksByStatus[status] > 0) {
          statusStats.push(`${status}: ${tasksByStatus[status]}`);
        }
      });
      if (statusStats.length > 0) {
        message += `狀態統計: ${statusStats.join(', ')}\n`;
      }
      
      message += `\n頁面 ${currentPage + 1}/${totalPages}\n`;
      message += `點擊下方按鈕查看任務詳情\n\n`;

      // 構建按鈕鍵盤 - 每個任務一行
      const keyboardRows = [];
      currentTasks.forEach((task) => {
        const status = task.report_status || task.status || '正在進行';
        const title = task.title ? task.title.substring(0, 20) : '';
        const progress = task.progress > 0 ? ` [${task.progress}%]` : '';
        const buttonText = `${task.ticket_id}${title ? ` - ${title}` : ''}${progress}`;
        
        keyboardRows.push([{
          text: buttonText.length > 64 ? buttonText.substring(0, 61) + '...' : buttonText,
          callback_data: `task_detail:${task.ticket_id}`
        }]);
      });

      // 添加分頁按鈕
      const paginationButtons = [];
      if (totalPages > 1) {
        if (currentPage > 0) {
          paginationButtons.push({ text: '⬅️ 上一頁', callback_data: `mytasks_page:${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
          paginationButtons.push({ text: '下一頁 ➡️', callback_data: `mytasks_page:${currentPage + 1}` });
        }
        if (paginationButtons.length > 0) {
          keyboardRows.push(paginationButtons);
        }
      }

      // 添加底部操作按鈕
      keyboardRows.push([
        { text: '🔄 重新整理', callback_data: 'refresh_mytasks' },
        { text: '📑 生成週報', switch_inline_query_current_chat: '/report' }
      ]);

      const keyboard = {
        inline_keyboard: keyboardRows
      };

      console.log(`   ✅ 找到 ${tasks.length} 個任務，顯示第 ${currentPage + 1} 頁（${currentTasks.length} 個任務）`);
      await ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('查詢任務列表時發生錯誤:', error);
      await ctx.reply(`❌ 查詢失敗: ${error.message}`);
    }
  }

  async refreshMyTasksMessage(ctx, page = 0) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;
      
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
        
        await ctx.editMessageText(`📋 您目前沒有任何負責的任務\n\n💡 提示：使用 /assign 命令分配任務，或在群組中發送包含 Jira 連結的訊息`, {
          reply_markup: emptyKeyboard
        });
        return;
      }

      // 每頁顯示5個任務
      const tasksPerPage = 5;
      const totalPages = Math.ceil(tasks.length / tasksPerPage);
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      const startIndex = currentPage * tasksPerPage;
      const endIndex = Math.min(startIndex + tasksPerPage, tasks.length);
      const currentTasks = tasks.slice(startIndex, endIndex);

      // 按週報狀態統計
      const tasksByStatus = {};
      tasks.forEach(task => {
        const status = task.report_status || task.status || '正在進行';
        if (status !== '封存') {
          if (!tasksByStatus[status]) {
            tasksByStatus[status] = 0;
          }
          tasksByStatus[status]++;
        }
      });

      // 構建任務列表訊息
      let message = `📋 您負責的任務列表\n\n`;
      message += `總共 ${tasks.length} 個任務（不包含封存）\n`;
      
      // 顯示狀態統計
      const statusStats = [];
      REPORT_STATUSES.filter(s => s !== '封存').forEach(status => {
        if (tasksByStatus[status] > 0) {
          statusStats.push(`${status}: ${tasksByStatus[status]}`);
        }
      });
      if (statusStats.length > 0) {
        message += `狀態統計: ${statusStats.join(', ')}\n`;
      }
      
      message += `\n頁面 ${currentPage + 1}/${totalPages}\n`;
      message += `點擊下方按鈕查看任務詳情\n\n`;

      // 構建按鈕鍵盤 - 每個任務一行
      const keyboardRows = [];
      currentTasks.forEach((task) => {
        const status = task.report_status || task.status || '正在進行';
        const title = task.title ? task.title.substring(0, 20) : '';
        const progress = task.progress > 0 ? ` [${task.progress}%]` : '';
        const buttonText = `${task.ticket_id}${title ? ` - ${title}` : ''}${progress}`;
        
        keyboardRows.push([{
          text: buttonText.length > 64 ? buttonText.substring(0, 61) + '...' : buttonText,
          callback_data: `task_detail:${task.ticket_id}`
        }]);
      });

      // 添加分頁按鈕
      const paginationButtons = [];
      if (totalPages > 1) {
        if (currentPage > 0) {
          paginationButtons.push({ text: '⬅️ 上一頁', callback_data: `mytasks_page:${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
          paginationButtons.push({ text: '下一頁 ➡️', callback_data: `mytasks_page:${currentPage + 1}` });
        }
        if (paginationButtons.length > 0) {
          keyboardRows.push(paginationButtons);
        }
      }

      // 添加底部操作按鈕
      keyboardRows.push([
        { text: '🔄 重新整理', callback_data: 'refresh_mytasks' },
        { text: '📑 生成週報', switch_inline_query_current_chat: '/report' }
      ]);

      const keyboard = {
        inline_keyboard: keyboardRows
      };

      await ctx.editMessageText(message, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
    } catch (error) {
      console.error('重新整理任務列表時發生錯誤:', error);
      await ctx.answerCbQuery('重新整理失敗');
    }
  }
}

