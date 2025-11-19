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
          this.db.run = promisify(this.db.run.bind(this.db));
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
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        jira_url TEXT
      )
    `);

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
      INSERT INTO tasks (ticket_id, title, assignee_username, assignee_user_id, status, jira_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ticketId, title, assigneeUsername, assigneeUserId, '待開發', jiraUrl]);

    // Record status history
    await this.db.run(`
      INSERT INTO status_history (task_id, ticket_id, old_status, new_status, changed_by_user_id, changed_by_username)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [result.lastID, ticketId, null, '待開發', assigneeUserId, assigneeUsername]);

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
      WHERE assignee_username = ?
      ORDER BY updated_at DESC
    `, [assigneeUsername]);
  }

  async getTasksByStatus(status) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE status = ?
      ORDER BY updated_at DESC
    `, [status]);
  }

  async getAllActiveTasks() {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE status NOT IN ('待上線', '已完成')
      ORDER BY updated_at DESC
    `);
  }

  async getTasksCompletedThisWeek(startDate, endDate) {
    return await this.db.all(`
      SELECT * FROM tasks 
      WHERE status = '待上線'
      AND updated_at >= ? AND updated_at <= ?
      ORDER BY updated_at DESC
    `, [startDate, endDate]);
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

