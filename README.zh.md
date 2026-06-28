# imessage-mcp-server

> **macOS 上的 iMessage MCP Server + AI Bridge**  
> 通过 [Model Context Protocol](https://modelcontextprotocol.io) 暴露你的 iMessage 读写能力，或者把你的 Mac 变成 24 小时在线的 iMessage AI 助手。

[English README](README.md)

⚠️ **仅限 macOS** — 需要系统「信息」应用及其 SQLite 数据库（`~/Library/Messages/chat.db`）。

---

## 功能特性

### MCP Server 模式

提供 4 个标准 MCP 工具，用于读取和发送 iMessage：

| 工具 | 说明 |
| ------ | ------ |
| `send_imessage` | 向指定邮箱或手机号发送 iMessage |
| `list_conversations` | 列出最近会话，含最新消息摘要和未读数 |
| `read_conversation` | 读取某个会话的分页消息 |
| `get_new_messages` | 按时间戳轮询新收到的消息 |

### Bridge 模式

在后台运行一个自主 AI Agent：

- 轮询你指定的 `masterHandle` 发来的新 iMessage
- 调用 Claude、OpenAI、DeepSeek、Kimi 或任意 OpenAI 兼容模型
- 连接任意 MCP Server 作为工具（文件系统、Shell、Git 等）
- 自动把结果通过 iMessage 回复给你
- 记住多轮对话上下文
- 支持 macOS LaunchAgent 开机自启

---

## 环境要求

- **macOS**（建议 Ventura 或更新版本）
- **Node.js >= 18**
- 已在「信息」App 中**登录 iMessage**
- 给终端 / IDE 授予**完全磁盘访问权限**
  - 系统设置 → 隐私与安全性 → 完全磁盘访问权限
  - 添加你的终端应用（Terminal、iTerm2、VS Code 等）
- **Xcode 命令行工具**（用于编译原生模块 `better-sqlite3`）

```bash
xcode-select --install
```

---

## 快速开始

### MCP Server 模式

把以下内容加到 MCP 客户端配置中：

**Claude Code**（`.claude/settings.json`）：

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server", "--server"]
    }
  }
}
```

**Claude Desktop**（`~/Library/Application Support/Claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server", "--server"]
    }
  }
}
```

**Cursor**（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server", "--server"]
    }
  }
}
```

**VS Code + GitHub Copilot**（`.vscode/mcp.json`）：

```json
{
  "servers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server", "--server"]
    }
  }
}
```

### Bridge 模式

创建 `bridge-config.json`：

```json
{
  "masterHandle": "你的邮箱@icloud.com",
  "provider": "anthropic",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "model": "claude-3-5-sonnet-20241022",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/你的用户名"]
    }
  }
}
```

前台测试运行：

```bash
npx imessage-mcp-server --bridge --config ./bridge-config.json --foreground
```

安装为 macOS LaunchAgent（开机自启）：

```bash
npx imessage-mcp-server --bridge --install-service --config ./bridge-config.json
npx imessage-mcp-server --bridge --status
npx imessage-mcp-server --bridge --uninstall
```

> **注意**：LaunchAgent 不会继承 shell 的环境变量。如果 `apiKey` 使用 `${ANTHROPIC_API_KEY}` 这种环境变量引用，服务启动时会读不到。建议直接把 API Key 写入配置文件。

---

## CLI 参考

```bash
# 查看帮助 / 版本
npx imessage-mcp-server --help
npx imessage-mcp-server --version

# MCP Server 模式
npx imessage-mcp-server --server

# Bridge 模式
npx imessage-mcp-server --bridge --config ./bridge-config.json
npx imessage-mcp-server --bridge --foreground
npx imessage-mcp-server --bridge --test-config
npx imessage-mcp-server --bridge --install-service --config ./bridge-config.json
npx imessage-mcp-server --bridge --status
npx imessage-mcp-server --bridge --uninstall
```

---

## Bridge 配置说明

### 完整配置示例

```json
{
  "masterHandle": "你的邮箱@icloud.com",
  "provider": "anthropic",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "baseUrl": null,
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096,
  "pollIntervalMs": 3000,
  "maxHistoryPerConversation": 20,
  "maxToolIterations": 10,
  "sendProcessingIndicator": true,
  "systemPrompt": "可选的自定义系统提示词",
  "projectDir": "/Users/你的用户名/project",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/你的用户名"]
    },
    "shell": {
      "command": "npx",
      "args": ["-y", "mcp-shell-server"]
    }
  },
  "safety": {
    "requireConfirmation": false,
    "allowedTools": null,
    "blockedTools": [],
    "blockedCommands": ["rm -rf /", "sudo"],
    "readOnly": false
  }
}
```

### 支持的模型后端

| 后端 | `provider` 值 | 说明 |
| ------ | -------------- | ------ |
| Anthropic / Claude | `anthropic` 或 `claude` | 原生支持 thinking blocks |
| OpenAI | `openai` | 官方 API |
| DeepSeek | `deepseek` | OpenAI 兼容接口 |
| Kimi | `kimi` | OpenAI 兼容接口 |
| 任意 OpenAI 兼容模型 | `openai` | 设置 `baseUrl` 即可 |

### 环境变量

| 变量 | 说明 |
| ------ | ------ |
| `IMESSAGE_DB_PATH` | 自定义 `chat.db` 路径 |
| `IMESSAGE_MASTER_HANDLE` | Bridge 模式的主用户 iMessage 账号 |
| `IMESSAGE_PROVIDER` | 默认 LLM 后端 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | API 密钥 |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` | 自定义 API 端点 |

配置文件支持 `${VAR_NAME}` 语法引用环境变量。

---

## MCP 工具（Server 模式）

### `send_imessage`

发送一条 iMessage。

```json
{ "recipient": "example@icloud.com", "text": "Hello from MCP!" }
```

### `list_conversations`

列出最近会话。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 20 | 最大返回会话数（最大 100） |

### `read_conversation`

读取某个会话的消息。

| 参数 | 类型 | 默认值 | 说明 |
| ------ | ------ | -------- | ------ |
| `handle` | string | — | 按邮箱/手机号过滤 |
| `chat_id` | number | — | 按 chat ROWID 过滤 |
| `limit` | number | 30 | 最大返回消息数（最大 200） |
| `before_id` | number | — | 分页：返回该 ROWID 之前的消息 |
| `include_read` | boolean | true | 包含已读消息 |
| `unread_only` | boolean | false | 仅返回未读消息 |

### `get_new_messages`

轮询最近收到的消息。

| 参数 | 类型 | 默认值 | 说明 |
| ------ | ------ | -------- | ------ |
| `since` | string | — | ISO 时间戳 |
| `max_results` | number | 10 | 最大返回消息数（最大 100） |
| `unread_only` | boolean | false | 仅返回未读消息 |

---

## Bridge 工具

Bridge 模式下，AI 可以使用所有已配置 MCP Server 提供的工具，外加两个内置本地工具：

- `send_imessage` — 向任意收件人发送消息
- `send_long_reply` — 把长回复拆成多条 iMessage 发送

---

## 安全说明

- 所有读取操作都以**只读模式**打开 `chat.db`，不会修改数据库。
- Bridge 模式只处理 `masterHandle` 发来的消息，其他人完全忽略。
- 使用 `safety.readOnly: true` 可禁用写入类工具。
- 使用 `safety.allowedTools` 可白名单限制可调用的工具。
- 使用 `safety.blockedCommands` 可黑名单拦截危险命令。
- 所有聊天数据留在你的 Mac 上；只有调用 LLM 后端的请求会离开本机。

---

## 常见问题

| 问题 | 解决方法 |
| ------ | --------- |
| ❌ 找不到 iMessage 数据库 | 确认已在「信息」App 登录；或通过 `IMESSAGE_DB_PATH` 指定路径。 |
| 🔒 读取数据库权限不足 | 给终端/IDE 开启「完全磁盘访问权限」。 |
| 🔐 提示 "Database is locked" | 完全退出「信息」App，或等待同步完成。 |
| 💻 osascript 执行失败 | 确认「信息」App 已运行并登录 Apple ID。 |
| ⚠️ better-sqlite3 编译失败 | 运行 `xcode-select --install` 后重试。 |
| 🐢 首次 `npx` 运行很慢 | 首次会下载并编译原生模块，后续会缓存。 |

---

## 许可证

MIT © 2026 tinyxia
