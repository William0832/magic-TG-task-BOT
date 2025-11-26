import dotenv from 'dotenv';
import Database from './database.js';
import JiraService from './jira.js';
import MissionBot from './bot.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const DB_PATH = process.env.DB_PATH || './data/missions.db';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USERNAME = process.env.JIRA_USERNAME;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!BOT_TOKEN) {
  console.error('錯誤: .env 檔案中需要 BOT_TOKEN');
  process.exit(1);
}

async function main() {
  try {
    // 初始化資料庫
    console.log('正在初始化資料庫...');
    const db = new Database(DB_PATH);
    await db.connect();
    await db.init();
    console.log('資料庫已初始化');

    // 初始化 Jira 服務
    const jiraService = new JiraService(JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN);
    if (jiraService.enabled) {
      console.log('Jira API 整合已啟用');
    } else {
      console.log('Jira API 整合已停用（未提供憑證）');
    }

    // 初始化並啟動 Bot
    console.log('正在啟動 Bot...');
    const bot = new MissionBot(BOT_TOKEN, db, jiraService);
    await bot.launch();
  } catch (error) {
    console.error('嚴重錯誤:', error);
    process.exit(1);
  }
}

main();

