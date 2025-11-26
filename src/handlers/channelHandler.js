export function setupChannelHandler(bot, reportService) {
  // 處理頻道帖子（channel post）
  bot.on('channel_post', async (ctx) => {
    const timestamp = new Date().toLocaleString('zh-TW', { 
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    console.log('\n' + '='.repeat(60));
    console.log('📢 收到頻道帖子');
    console.log(`⏰ 時間: ${timestamp}`);
    console.log(`📋 訊息內容: ${ctx.channelPost?.text || '[非文字訊息]'}`);
    console.log(`\n💬 頻道資訊:`);
    console.log(`   頻道名稱: ${ctx.chat.title || '未知'}`);
    console.log(`   頻道ID: ${ctx.chat.id}`);
    console.log(`   頻道用戶名: @${ctx.chat.username || '無'}`);
    console.log('='.repeat(60) + '\n');

    // 如果頻道帖子是命令，處理它
    if (ctx.channelPost?.text?.startsWith('/')) {
      const command = ctx.channelPost.text.split(' ')[0];
      console.log(`📝 頻道收到命令: ${command}`);
      
      // 處理頻道中的 /report 命令
      if (command === '/report') {
        await reportService.generateWeeklyReport(ctx);
      }
    }
  });
}

