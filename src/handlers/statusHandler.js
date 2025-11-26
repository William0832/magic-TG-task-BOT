import MessageParser from '../messageParser.js';
import { REPORT_STATUSES, parseStatusInput } from '../constants/status.js';
import { logCommandDetails } from '../utils/logger.js';

export function setupStatusHandler(bot, db) {
  bot.command('status', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    logCommandDetails('status', ctx, {
      原始參數: args
    });

    if (args.length < 2) {
      const statusList = REPORT_STATUSES.map((status, index) => 
        `${index}: ${status}`
      ).join('\n');
      
      const statusButtons = REPORT_STATUSES.map((status, index) => ({
        text: `${index}: ${status}`,
        callback_data: `status_quick:${index}`
      }));
      
      const statusKeyboard = {
        inline_keyboard: [
          statusButtons,
          [
            { text: '❌ 取消', callback_data: 'status_cancel' }
          ]
        ]
      };
      
      return ctx.reply(`用法: /status <任務單號> <狀態>\n\n可用狀態:\n${statusList}`, {
        reply_markup: statusKeyboard
      });
    }

    const ticketId = MessageParser.extractTicketId(args[0]);
    if (!ticketId) {
      console.log('   ❌ 無效的工作單號格式');
      return ctx.reply('無效的工作單號格式');
    }

    const statusInput = args.slice(1).join(' ');
    const newStatus = parseStatusInput(statusInput);
    
    console.log(`   狀態輸入: "${statusInput}" -> 解析為: "${newStatus}"`);
    
    if (!REPORT_STATUSES.includes(newStatus)) {
      const statusList = REPORT_STATUSES.map((status, index) => 
        `${index}: ${status}`
      ).join('\n');
      console.log('   ❌ 無效的狀態');
      return ctx.reply(`無效的狀態。可用狀態:\n${statusList}`);
    }

    try {
      console.log(`   正在更新任務 ${ticketId} 狀態為: ${newStatus}`);
      await db.updateReportStatus(ticketId, newStatus);
      console.log(`   ✅ 狀態更新成功`);
      
      const successKeyboard = {
        inline_keyboard: [
          [
            { text: '📈 更新進度', switch_inline_query_current_chat: `/progress ${ticketId} ` },
            { text: '📊 查看狀態', switch_inline_query_current_chat: `/status ${ticketId} ` }
          ],
          [
            { text: '📋 生成週報', switch_inline_query_current_chat: '/report' }
          ]
        ]
      };
      
      await ctx.reply(`✅ 任務 ${ticketId} 狀態已更新為: ${newStatus}`, {
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

