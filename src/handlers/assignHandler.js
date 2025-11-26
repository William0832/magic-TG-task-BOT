import MessageParser from '../messageParser.js';
import { logCommandDetails } from '../utils/logger.js';

export function setupAssignHandler(bot, taskService) {
  bot.command('assign', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    logCommandDetails('assign', ctx, {
      原始參數: args
    });
    
    if (args.length < 2) {
      console.log('   ❌ 參數不足');
      
      const assignKeyboard = {
        inline_keyboard: [
          [
            { text: '❓ 查看幫助', callback_data: 'help_assign' },
            { text: '📋 範例', switch_inline_query_current_chat: '/assign PROJ-1234 @username 任務標題' }
          ]
        ]
      };
      
      return ctx.reply('用法: /assign <任務單號> @username [標題]\n或: /assign @username <任務單號> [標題]', {
        reply_markup: assignKeyboard
      });
    }

    // 智能識別參數順序：支援兩種格式
    // 格式1: /assign PROJ-1234 @username [標題]
    // 格式2: /assign @username PROJ-1234 [標題]
    let ticketId = null;
    let assigneeUsername = null;
    let title = null;

    // 檢查第一個參數是否是 @username
    const firstArgIsUsername = args[0] && args[0].startsWith('@');
    
    if (firstArgIsUsername) {
      // 格式2: /assign @username PROJ-1234 [標題]
      const assigneeMatch = args[0].match(/@?(\w+)/);
      if (assigneeMatch) {
        assigneeUsername = assigneeMatch[1];
      }
      ticketId = MessageParser.extractTicketId(args[1]);
      title = args.slice(2).join(' ') || null;
    } else {
      // 格式1: /assign PROJ-1234 @username [標題]
      ticketId = MessageParser.extractTicketId(args[0]);
      const assigneeMatch = args[1].match(/@?(\w+)/);
      if (assigneeMatch) {
        assigneeUsername = assigneeMatch[1];
      }
      title = args.slice(2).join(' ') || null;
    }

    // 驗證必要參數
    if (!ticketId) {
      console.log('   ❌ 無效的工作單號格式');
      return ctx.reply('❌ 無效的工作單號格式\n\n💡 提示：工作單號格式應為 PROJ-1234');
    }

    if (!assigneeUsername) {
      console.log('   ❌ 無效的用戶名格式');
      return ctx.reply('❌ 無效的用戶名格式\n\n💡 提示：請使用 @username 格式');
    }

    const jiraUrl = `https://jira.dsteam.vip/browse/${ticketId}`;

    console.log('✅ 參數解析成功:', {
      工作單號: ticketId,
      負責人: assigneeUsername,
      標題: title || '(無)',
      Jira連結: jiraUrl
    });

    await taskService.createTask(ctx, {
      ticketId,
      title,
      assigneeUsername,
      jiraUrl
    });
  });
}

