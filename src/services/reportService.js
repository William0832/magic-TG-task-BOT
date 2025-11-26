export class ReportService {
  constructor(db) {
    this.db = db;
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
      const nextWeekTasks = await this.db.getTasksByReportStatus('下週處理');

      // 下週處理包含：下週處理 + 正在進行
      const allNextWeekTasks = [...nextWeekTasks, ...ongoingTasks];
      // 去重（基於 ticket_id）
      const uniqueNextWeekTasks = Array.from(
        new Map(allNextWeekTasks.map(task => [task.ticket_id, task])).values()
      );

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

      // 下週處理（包含正在進行和下週處理的任務）
      report += `- 下週處理\n`;
      if (uniqueNextWeekTasks.length === 0) {
        report += `  (無)\n`;
      } else {
        uniqueNextWeekTasks.forEach((task, index) => {
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
}

