import { logCommandDetails } from '../utils/logger.js';

export function setupMyTasksHandler(bot, myTasksService) {
  bot.command('mytasks', async (ctx) => {
    logCommandDetails('mytasks', ctx);
    await myTasksService.showMyTasks(ctx);
  });
}

