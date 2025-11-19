# 项目启动指南

## 快速开始

### 1. 安装依赖

如果还没有安装依赖，运行：

```bash
npm install
```

### 2. 获取 Telegram Bot Token

1. 打开 Telegram，搜索 `@BotFather`
2. 发送 `/newbot` 命令
3. 按照提示设置 Bot 名称和用户名
4. BotFather 会返回一个 Token，格式类似：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. **保存这个 Token，稍后会用到**

### 3. 配置环境变量

创建 `.env` 文件（如果还没有）：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 Bot Token：

```env
# Telegram Bot Token（必需）
BOT_TOKEN=你的_bot_token_这里

# Jira Configuration（可选，如果需要自动获取任务标题）
JIRA_BASE_URL=https://jira.dsteam.vip
JIRA_USERNAME=你的_jira_用户名
JIRA_API_TOKEN=你的_jira_api_token

# Database（可选，默认使用 ./data/missions.db）
DB_PATH=./data/missions.db
```

**最小配置**：只需要设置 `BOT_TOKEN` 即可运行。

**Jira API 配置**（可选）：
- 如果需要 Bot 自动从 Jira 获取任务标题，需要配置 Jira API
- 获取 API Token：https://id.atlassian.com/manage-profile/security/api-tokens
- 如果不配置，Bot 会尝试从消息中提取标题，如果没有则标题为空

### 4. 启动 Bot

```bash
npm start
```

或者使用开发模式（自动重启）：

```bash
npm run dev
```

### 5. 验证 Bot 运行

启动成功后，你会看到：

```
Initializing database...
Database initialized
Jira API integration disabled (no credentials provided)
Starting bot...
Bot is running...
```

### 6. 测试 Bot

1. 在 Telegram 中找到你的 Bot（使用 BotFather 给你的用户名）
2. 发送 `/start` 测试 Bot 是否响应
3. 将 Bot 添加到你的工作群组
4. 在群组中发送包含 Jira 链接的消息测试

## 使用示例

### 在群组中自动检测工作分配

发送消息：
```
https://jira.dsteam.vip/browse/PROJ-4326
[H5] 发现中心优化-新增返回&活动未读&任务未完成等
@william0875566 麻煩你了
```

Bot 会自动：
- 识别工作单号 `PROJ-4326`
- 提取标题
- 识别负责人 `william0875566`
- 发送确认消息给负责人

### 手动分配任务

```
/assign PROJ-4326 @william0875566 [H5] 发现中心优化
```

### 更新任务状态

```
/status PROJ-4326 開發中
```

### 更新任务进度

```
/progress PROJ-4326 80
```

### 生成周报

在私聊中发送：
```
/report        # 查看所有任务
/report my    # 查看个人任务
```

## 常见问题

### Bot 没有响应？

1. 检查 `.env` 文件中的 `BOT_TOKEN` 是否正确
2. 检查 Bot 是否已启动（查看终端输出）
3. 确保 Bot 已添加到群组并有发送消息权限

### 数据库文件在哪里？

数据库文件会自动创建在 `./data/missions.db`

### 如何重置数据库？

删除 `./data/missions.db` 文件，重启 Bot 会自动创建新的数据库

### Jira API 配置失败？

如果不配置 Jira API，Bot 仍然可以正常工作，只是无法自动获取任务标题。标题会从消息中提取，如果没有则留空。

## 下一步

- 将 Bot 添加到工作群组
- 测试工作分配功能
- 配置 Jira API（可选）
- 开始使用任务管理功能

