import { logCommandDetails } from '../utils/logger.js';

export function setupArchivedTasksHandler(bot, taskCallbacks) {
  bot.command('archived', async (ctx) => {
    logCommandDetails('archived', ctx);
    
    // 調用 taskCallbacks 的方法來顯示封存任務
    await taskCallbacks.showArchivedTasks(ctx, 0);
  });
}
