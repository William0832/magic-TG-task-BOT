import { REPORT_STATUSES } from '../constants/status.js';
import { logCommandDetails } from '../utils/logger.js';

export function setupHelpHandler(bot) {
  bot.command('help', async (ctx) => {
    logCommandDetails('help', ctx);
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
    
    const helpKeyboard = {
      inline_keyboard: [
        [
          { text: '📋 分配任務', switch_inline_query_current_chat: '/assign ' },
          { text: '📊 更新狀態', switch_inline_query_current_chat: '/status ' }
        ],
        [
          { text: '📈 更新進度', switch_inline_query_current_chat: '/progress ' },
          { text: '📑 生成週報', switch_inline_query_current_chat: '/report' }
        ],
        [
          { text: '📋 我的任務', switch_inline_query_current_chat: '/mytasks' }
        ]
      ]
    };
    
    await ctx.reply(helpMessage, { reply_markup: helpKeyboard });
  });
}

