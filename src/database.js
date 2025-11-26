import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async connect() {
    // Ensure data directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Store original run method
          const originalRun = this.db.run.bind(this.db);
          
          // Custom run wrapper to preserve lastID
          this.db.run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
              originalRun(sql, params, function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve({ lastID: this.lastID, changes: this.changes });
                }
              });
            });
          };
          this.db.get = promisify(this.db.get.bind(this.db));
          this.db.all = promisify(this.db.all.bind(this.db));
          resolve();
        }
      });
    });
  }

  async init() {
    // Tasks table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        title TEXT,
        assignee_username TEXT NOT NULL,
        assignee_user_id INTEGER,
        status TEXT NOT NULL DEFAULT '待開發',
        report_status TEXT DEFAULT '正在進行',
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        jira_url TEXT
      )
    `);

    // 為現有資料添加 report_status 欄位（如果不存在）
    try {
      await this.db.run(`ALTER TABLE tasks ADD COLUMN report_status TEXT DEFAULT '正在進行'`);
    } catch (error) {
      // 欄位已存在，忽略錯誤
      if (!error.message.includes('duplicate column')) {
        console.log('添加 report_status 欄位時發生錯誤:', error.message);
      }
    }

    // Status history table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        ticket_id TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_by_user_id INTEGER,
        changed_by_username TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // Create index for faster queries
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_ticket_id ON tasks(ticket_id)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_username)
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_status_history_task_id ON status_history(task_id)
    `);
  }

  async createTask(taskData) {
    const { ticketId, title, assigneeUsername, assigneeUserId, jiraUrl } = taskData;
    
    const result = await this.db.run(`
      INSERT INTO tasks (ticket_id, title, assignee_username, assignee_user_id, status, report_status, jira_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [ticketId, title, assigneeUsername, assigneeUserId, '正在進行', '正在進行', jiraUrl]);

    // Record status history
    await this.db.run(`
      INSERT INTO status_history (task_id, ticket_id, old_status, new_status, changed_by_user_id, changed_by_username)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [result.lastID, ticketId, null, '正在進行', assigneeUserId, assigneeUsername]);

    return result.lastID;
  }

  async getTaskByTicketId(ticketId) {
    return await this.db.get(`
      SELECT * FROM tasks WHERE ticket_id = ?
    `, [ticketId]);
  }

  async updateTaskStatus(ticketId, newStatus, changedByUserId, changedByUsername) {
    const task = await this.getTaskByTicketId(ticketId);
    if (!task) {
      throw new Error(`Task ${ticketId} not found`);
    }

    await this.db.run(`
      UPDATE tasks 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ticket_id = ?
    `, [newStatus, ticketId]);

    // Record status history
    await this.db.run(`
      INSERT INTO status_history (task_id, ticket_id, old_status, new_status, changed_by_user_id, changed_by_username)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [task.id, ticketId, task.status, newStatus, changedByUserId, changedByUsername]);
  }

  async updateTaskProgress(ticketId, progress) {
    await this.db.run(`
      UPDATE tasks 
      SET progress = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ticket_id = ?
    `, [progress, ticketId]);
  }

  async getTasksByAssignee(assigneeUsername) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE assignee_username = ? AND report_status != '封存'
      ORDER BY updated_at DESC
    `, [assigneeUsername]);
  }

  async getTasksByUserId(userId) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE assignee_user_id = ? AND report_status != '封存'
      ORDER BY updated_at DESC
    `, [userId]);
  }

  async getMyTasks(userId, username) {
    // 優先使用 user_id 查詢，如果沒有則使用 username
    let tasks = [];
    if (userId) {
      tasks = await this.getTasksByUserId(userId);
    }
    
    // 如果沒有找到任務，嘗試使用 username
    if (tasks.length === 0 && username) {
      tasks = await this.getTasksByAssignee(username);
    }
    
    return tasks;
  }

  async getTasksByStatus(status) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE report_status = ? AND report_status != '封存'
      ORDER BY updated_at DESC
    `, [status]);
  }

  async getAllActiveTasks() {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE report_status != '封存'
      ORDER BY updated_at DESC
    `);
  }

  async getTasksCompletedThisWeek(startDate, endDate) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE report_status = '已上線'
      AND updated_at >= ? AND updated_at <= ?
      ORDER BY updated_at DESC
    `, [startDate, endDate]);
  }

  async updateReportStatus(ticketId, reportStatus) {
    const task = await this.getTaskByTicketId(ticketId);
    if (!task) {
      throw new Error(`Task ${ticketId} not found`);
    }

    // 同時更新 status 和 report_status（保持一致性）
    await this.db.run(`
      UPDATE tasks 
      SET status = ?, report_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ticket_id = ?
    `, [reportStatus, reportStatus, ticketId]);

    // Record status history
    const oldStatus = task.report_status || task.status || null;
    if (oldStatus) {
      await this.db.run(`
        INSERT INTO status_history (task_id, ticket_id, old_status, new_status, changed_by_user_id, changed_by_username)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [task.id, ticketId, oldStatus, reportStatus, null, null]);
    }
  }

  async getTasksByReportStatus(reportStatus) {
    // 封存狀態的任務不應該被查詢（除非明確查詢封存）
    if (reportStatus === '封存') {
      return await this.db.all(`
        SELECT * FROM tasks 
        WHERE report_status = ?
        ORDER BY updated_at DESC
      `, [reportStatus]);
    }
    
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE report_status = ? AND report_status != '封存'
      ORDER BY updated_at DESC
    `, [reportStatus]);
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default Database;

