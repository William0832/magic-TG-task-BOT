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
  console.error('Error: BOT_TOKEN is required in .env file');
  process.exit(1);
}

async function main() {
  try {
    // Initialize database
    console.log('Initializing database...');
    const db = new Database(DB_PATH);
    await db.connect();
    await db.init();
    console.log('Database initialized');

    // Initialize Jira service
    const jiraService = new JiraService(JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN);
    if (jiraService.enabled) {
      console.log('Jira API integration enabled');
    } else {
      console.log('Jira API integration disabled (no credentials provided)');
    }

    // Initialize and launch bot
    console.log('Starting bot...');
    const bot = new MissionBot(BOT_TOKEN, db, jiraService);
    await bot.launch();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();

