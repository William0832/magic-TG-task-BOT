import MessageParser from '../messageParser.js';
import { logCommandDetails } from '../utils/logger.js';

export function setupAssignHandler(bot, taskService) {
  bot.command('assign', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    logCommandDetails('assign', ctx, {
      原始參數: args
    });
    
    if (args.length < 2) {
      console.log('   ℹ️ 顯示選擇用戶選項');
      
      // 檢查是否在群組中
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        const assignKeyboard = {
          inline_keyboard: [
            [
              { text: '👥 選擇用戶', callback_data: 'assign_select_user' }
            ],
            [
              { text: '❓ 查看幫助', callback_data: 'help_assign' }
            ]
          ]
        };
        
        return ctx.reply('📋 分配任務\n\n請選擇要分配任務的用戶：', {
          reply_markup: assignKeyboard
        });
      } else {
        // 私聊中，提示需要在群組中使用
        return ctx.reply('⚠️ 此功能需要在群組中使用\n\n💡 提示：請在群組中發送 /assign 命令，或直接使用：\n/assign <任務單號> @username [標題]');
      }
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

