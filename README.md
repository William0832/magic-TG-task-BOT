# TG Mission Bot

Telegram Bot for managing Jira tasks in work groups.

## Features

- 自动检测群组中的 Jira 工作分配消息
- 任务状态管理（待开发/开发中/待测试/测试中/待上線）
- 进度追踪（手动输入百分比）
- 周报生成

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your bot token:
```bash
cp .env.example .env
```

3. Start the bot:
```bash
npm start
```

## Commands

- `/assign PROJ-4326 @username [标题]` - 手动分配任务
- `/status PROJ-4326 开发中` - 更新任务状态
- `/progress PROJ-4326 80` - 更新任务进度（0-100）
- `/report` - 生成本周工作报告（显示所有任务）

**注意**：`/report` 命令可以在群组和私聊中使用。

## Database

SQLite database will be created automatically at `./data/missions.db`

