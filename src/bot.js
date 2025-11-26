import { Telegraf } from 'telegraf';
import Database from './database.js';
import JiraService from './jira.js';

// Handlers
import { setupHelpHandler } from './handlers/helpHandler.js';
import { setupAssignHandler } from './handlers/assignHandler.js';
import { setupStatusHandler } from './handlers/statusHandler.js';
import { setupProgressHandler } from './handlers/progressHandler.js';
import { setupReportHandler } from './handlers/reportHandler.js';
import { setupMyTasksHandler } from './handlers/myTasksHandler.js';
import { setupMessageHandler } from './handlers/messageHandler.js';
import { setupChannelHandler } from './handlers/channelHandler.js';

// Callbacks
import { TaskCallbacks } from './callbacks/taskCallbacks.js';

// Services
import { TaskService } from './services/taskService.js';
import { ReportService } from './services/reportService.js';
import { MyTasksService } from './services/myTasksService.js';

class MissionBot {
  constructor(token, db, jiraService) {
    this.bot = new Telegraf(token);
    this.db = db;
    this.jiraService = jiraService;
    
    // 初始化服務
    this.taskService = new TaskService(db, jiraService);
    this.reportService = new ReportService(db);
    this.myTasksService = new MyTasksService(db);
    
    // 初始化回調處理器
    this.taskCallbacks = new TaskCallbacks(db, this.bot, this.taskService);
    
    this.setupHandlers();
  }

  setupHandlers() {
    // 重要：先註冊命令處理器，再註冊文字處理器
    // 這確保命令在被文字處理器捕獲之前先被處理
    
    // 設置命令處理器
    setupHelpHandler(this.bot);
    setupAssignHandler(this.bot, this.taskService);
    setupStatusHandler(this.bot, this.db);
    setupProgressHandler(this.bot, this.db);
    setupReportHandler(this.bot, this.reportService);
    setupMyTasksHandler(this.bot, this.myTasksService);
    
    // 設置回調處理器
    this.taskCallbacks.setupCallbacks();
    
    // 設置訊息處理器
    setupMessageHandler(this.bot, this.taskService);
    
    // 設置頻道處理器
    setupChannelHandler(this.bot, this.reportService);
  }

  async launch() {
    try {
      // 設置機器人命令選單（選單按鈕）
      const commands = [
        { command: 'help', description: '顯示幫助資訊' },
        { command: 'assign', description: '分配任務給指定用戶' },
        { command: 'status', description: '更新任務狀態 (0=正在進行, 1=已上線, 2=下週繼續, 3=封存)' },
        { command: 'progress', description: '更新任務進度 (0-100)' },
        { command: 'report', description: '生成本週工作報告' },
        { command: 'mytasks', description: '查看本人負責的任務列表（不包含封存）' }
      ];
      
      await this.bot.telegram.setMyCommands(commands);
      console.log('✅ 選單按鈕已設置');
      
      await this.bot.launch();
      console.log('✅ Bot 正在運行...');
      console.log('📋 已註冊的命令: /help, /assign, /status, /progress, /report, /mytasks');
      console.log('💡 提示: 在 Telegram 中發送命令測試，或查看控制台日誌');
      console.log('💡 提示: 任務狀態系統已改為週報狀態（正在進行、已上線、下週繼續、封存）');
      console.log('💡 提示: 點擊輸入框旁邊的選單按鈕可查看所有命令');
      console.log('💡 提示: 頻道帖子功能已啟用，可在頻道中使用 /report 命令');
      
      // 優雅關閉
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      console.error('❌ Bot 啟動失敗:', error);
      throw error;
    }
  }
}

export default MissionBot;
