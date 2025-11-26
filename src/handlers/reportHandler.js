import { logCommandDetails } from '../utils/logger.js';

export function setupReportHandler(bot, reportService) {
  bot.command('report', async (ctx) => {
    logCommandDetails('report', ctx, {
      聊天類型: ctx.chat.type,
      是否為頻道: ctx.chat.type === 'channel'
    });
    await reportService.generateWeeklyReport(ctx);
  });
}

