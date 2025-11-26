// 記錄命令詳細資訊
export function logCommandDetails(commandName, ctx, additionalInfo = {}) {
  const timestamp = new Date().toLocaleString('zh-TW', { 
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const user = ctx.from || {};
  const chat = ctx.chat || {};
  const message = ctx.message || ctx.channelPost || {};
  
  const commandText = message.text || '[無文字]';
  const args = commandText.split(' ').slice(1);

  console.log('\n' + '='.repeat(60));
  console.log(`📝 收到命令: /${commandName}`);
  console.log(`⏰ 時間: ${timestamp}`);
  console.log(`📋 完整命令: ${commandText}`);
  console.log(`📦 參數數量: ${args.length}`);
  if (args.length > 0) {
    console.log(`📦 參數內容: [${args.join(', ')}]`);
  }
  console.log(`\n👤 用戶資訊:`);
  console.log(`   用戶ID: ${user.id || '未知'}`);
  console.log(`   用戶名: @${user.username || '無'}`);
  console.log(`   全名: ${user.first_name || ''} ${user.last_name || ''}`.trim() || '未知');
  console.log(`   語言: ${user.language_code || '未知'}`);
  console.log(`\n💬 聊天資訊:`);
  console.log(`   聊天類型: ${chat.type || '未知'}`);
  console.log(`   聊天ID: ${chat.id || '未知'}`);
  console.log(`   聊天名稱: ${chat.title || chat.first_name || chat.username || '未知'}`);
  if (chat.username) {
    console.log(`   聊天用戶名: @${chat.username}`);
  }
  
  if (Object.keys(additionalInfo).length > 0) {
    console.log(`\n📊 額外資訊:`);
    Object.entries(additionalInfo).forEach(([key, value]) => {
      if (typeof value === 'object') {
        console.log(`   ${key}:`, JSON.stringify(value, null, 2).split('\n').join('\n   '));
      } else {
        console.log(`   ${key}: ${value}`);
      }
    });
  }
  console.log('='.repeat(60) + '\n');
}

