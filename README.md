# imessage-mcp-server

> **MCP server + AI bridge for iMessage on macOS**  
> Expose your iMessage history and send capabilities via the [Model Context Protocol](https://modelcontextprotocol.io), or turn your Mac into a 24/7 AI assistant that auto-replies to your iMessages.

[中文 README](README.zh.md)

⚠️ **macOS only** — requires the Messages app and its SQLite database (`~/Library/Messages/chat.db`).

---

## Features

### MCP Server mode
Four standard MCP tools for reading and sending iMessages:

| Tool | Description |
|------|-------------|
| `send_imessage` | Send an iMessage to a recipient's email or phone number |
| `list_conversations` | List recent conversations with latest message preview and unread count |
| `read_conversation` | Read paginated messages from a specific conversation |
| `get_new_messages` | Poll for new incoming messages since a timestamp |

### Bridge mode
Run an autonomous AI agent in the background:

- Polls for new iMessages from your configured `masterHandle`
- Sends them to Claude, OpenAI, DeepSeek, Kimi, or any OpenAI-compatible model
- Connects any MCP Servers as tools (filesystem, shell, git, etc.)
- Auto-replies with results
- Remembers conversation context
- Supports macOS LaunchAgent for auto-start on login

---

## Prerequisites

- **macOS** (Ventura or later recommended)
- **Node.js >= 18**
- **iMessage signed in** via the Messages app
- **Full Disk Access** for your terminal / IDE
  - Go to _System Settings → Privacy & Security → Full Disk Access_
  - Add your terminal app (Terminal, iTerm2, VS Code, etc.)
- **Xcode Command Line Tools** (needed to compile the native `better-sqlite3` module)

```bash
xcode-select --install
```

---

## Quick Start

### MCP Server mode

Add to your MCP configuration:

**Claude Code** (`.claude/settings.json`):

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

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Cursor** (`.cursor/mcp.json`):

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

**VS Code + GitHub Copilot** (`.vscode/mcp.json`):

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

### Bridge mode

Create a `bridge-config.json`:

```json
{
  "masterHandle": "your-email@icloud.com",
  "provider": "anthropic",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "model": "claude-3-5-sonnet-20241022",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/YOU"]
    }
  }
}
```

Run in foreground for testing:

```bash
npx imessage-mcp-server --bridge --config ./bridge-config.json --foreground
```

Install as a macOS LaunchAgent (auto-start on login):

```bash
npx imessage-mcp-server --bridge --install-service --config ./bridge-config.json
npx imessage-mcp-server --bridge --status
npx imessage-mcp-server --bridge --uninstall
```

> **Note:** When running as a LaunchAgent, the bridge does **not** inherit environment variables from your shell. If your `apiKey` uses `${ANTHROPIC_API_KEY}` env substitution, the service won't be able to resolve it. Put the API key directly in the config file instead.

---

## CLI Reference

```bash
# Show help / version
npx imessage-mcp-server --help
npx imessage-mcp-server --version

# MCP Server mode
npx imessage-mcp-server --server

# Bridge mode
npx imessage-mcp-server --bridge --config ./bridge-config.json
npx imessage-mcp-server --bridge --foreground
npx imessage-mcp-server --bridge --test-config
npx imessage-mcp-server --bridge --install-service --config ./bridge-config.json
npx imessage-mcp-server --bridge --status
npx imessage-mcp-server --bridge --uninstall
```

---

## Bridge Configuration

### Full schema

```json
{
  "masterHandle": "your-email@icloud.com",
  "provider": "anthropic",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "baseUrl": null,
  "model": "claude-3-5-sonnet-20241022",
  "maxTokens": 4096,
  "pollIntervalMs": 3000,
  "maxHistoryPerConversation": 20,
  "maxToolIterations": 10,
  "sendProcessingIndicator": true,
  "systemPrompt": "Optional custom system prompt",
  "projectDir": "/Users/YOU/project",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/YOU"]
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

### Supported providers

| Provider | `provider` value | Notes |
|----------|------------------|-------|
| Anthropic / Claude | `anthropic` or `claude` | Native thinking blocks |
| OpenAI | `openai` | Official API |
| DeepSeek | `deepseek` | OpenAI-compatible endpoint |
| Kimi | `kimi` | OpenAI-compatible endpoint |
| Any OpenAI-compatible | `openai` | Set `baseUrl` |

### Environment variables

| Variable | Description |
|----------|-------------|
| `IMESSAGE_DB_PATH` | Override the path to `chat.db` |
| `IMESSAGE_MASTER_HANDLE` | Your iMessage handle for bridge mode |
| `IMESSAGE_PROVIDER` | Default LLM provider |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | API keys |
| `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` | Custom API endpoints |

Config files support `${VAR_NAME}` syntax for env substitution.

---

## MCP Tools (Server mode)

### `send_imessage`

Send an iMessage to a recipient.

```json
{ "recipient": "example@icloud.com", "text": "Hello from MCP!" }
```

### `list_conversations`

List recent iMessage conversations.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Max conversations (max 100) |

### `read_conversation`

Read messages from a specific conversation.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `handle` | string | — | Filter by email/phone |
| `chat_id` | number | — | Filter by chat ROWID |
| `limit` | number | 30 | Max messages (max 200) |
| `before_id` | number | — | Paginate before ROWID |
| `include_read` | boolean | true | Include read messages |
| `unread_only` | boolean | false | Only unread |

### `get_new_messages`

Poll for recently received messages.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `since` | string | — | ISO timestamp |
| `max_results` | number | 10 | Max messages (max 100) |
| `unread_only` | boolean | false | Only unread |

---

## Bridge Tools

In bridge mode, the AI can use any tools exposed by the configured MCP servers, plus two built-in local tools:

- `send_imessage` — send a message to any recipient
- `send_long_reply` — split a long response into multiple iMessages

---

## Security Notes

- The iMessage database is opened in **read-only mode** for all read operations.
- Bridge mode only processes messages from the configured `masterHandle`; all other senders are ignored.
- Use `safety.readOnly: true` to prevent write tools.
- Use `safety.allowedTools` to whitelist allowed tools.
- Use `safety.blockedCommands` to blacklist dangerous shell patterns.
- All chat data stays on your Mac; only API calls to your chosen LLM provider leave the machine.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| ❌ iMessage database not found | Sign into Messages app or set `IMESSAGE_DB_PATH`. |
| 🔒 Permission denied | Grant **Full Disk Access** to your terminal/IDE. |
| 🔐 "Database is locked" | Quit Messages app or wait for sync. |
| 💻 osascript failed | Make sure Messages.app is running and signed in. |
| ⚠️ better-sqlite3 compile errors | Run `xcode-select --install`. |
| 🐢 First `npx` run is slow | Native modules compile on first run; later runs are cached. |

---

## License

MIT © 2026 tinyxia
