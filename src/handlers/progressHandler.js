import MessageParser from '../messageParser.js';
import { logCommandDetails } from '../utils/logger.js';

export function setupProgressHandler(bot, db, taskCallbacks) {
  bot.command('progress', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    logCommandDetails('progress', ctx, {
      原始參數: args
    });

    if (args.length < 2) {
      // 如果沒有參數，顯示用戶的任務列表（排除封存）
      await taskCallbacks.showTaskListForProgress(ctx);
      return;
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
      await db.updateTaskProgress(ticketId, progress);
      console.log(`   ✅ 進度更新成功`);
      
      const successKeyboard = {
        inline_keyboard: [
          [
            { text: '📊 更新狀態', switch_inline_query_current_chat: `/status ${ticketId} ` },
            { text: '📈 繼續更新', switch_inline_query_current_chat: `/progress ${ticketId} ` }
          ],
          [
            { text: '📋 生成週報', switch_inline_query_current_chat: '/report' }
          ]
        ]
      };
      
      await ctx.reply(`✅ 任務 ${ticketId} 進度已更新為: ${progress}%`, {
        reply_markup: successKeyboard
      });
    } catch (error) {
      console.error(`   ❌ 更新失敗:`, error.message);
      
      const errorKeyboard = {
        inline_keyboard: [
          [
            { text: '🔄 重試', switch_inline_query_current_chat: ctx.message.text },
            { text: '❓ 查看幫助', callback_data: 'help_error' }
          ]
        ]
      };
      
      await ctx.reply(`❌ 更新失敗: ${error.message}`, {
        reply_markup: errorKeyboard
      });
    }
  });
}

