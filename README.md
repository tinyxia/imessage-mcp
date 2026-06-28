# imessage-mcp-server

> **MCP server for reading and sending iMessages on macOS**  
> Expose your iMessage history and send capabilities via the [Model Context Protocol](https://modelcontextprotocol.io).

⚠️ **macOS only** — requires the Messages app and its SQLite database (`~/Library/Messages/chat.db`).

---

## Features

This MCP server provides **4 tools** for interacting with iMessage:

| Tool | Description |
|------|-------------|
| `send_imessage` | Send an iMessage to a recipient's email or phone number |
| `list_conversations` | List recent conversations with latest message preview and unread count |
| `read_conversation` | Read paginated messages from a specific conversation (by chat_id or handle) |
| `get_new_messages` | Poll for new incoming messages since a timestamp |

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

### Option 1: npx (recommended)

No installation needed — just add to your MCP configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server"]
    }
  }
}
```

**Claude Code** (`.claude/settings.json` in your project):

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["-y", "imessage-mcp-server"]
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
      "args": ["-y", "imessage-mcp-server"]
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
      "args": ["-y", "imessage-mcp-server"]
    }
  }
}
```

### Option 2: Global install

```bash
npm install -g imessage-mcp-server
```

Then reference the binary directly in your MCP config:

```json
{
  "mcpServers": {
    "imessage": {
      "command": "imessage-mcp",
      "args": []
    }
  }
}
```

### Option 3: Clone from source

```bash
git clone https://github.com/tinyxia/imessage-mcp.git
cd imessage-mcp
npm install
```

Then reference the local path:

```json
{
  "mcpServers": {
    "imessage": {
      "command": "node",
      "args": ["/path/to/imessage-mcp/index.js"]
    }
  }
}
```

---

## Tool Reference

### `send_imessage`

Send an iMessage to a recipient.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient` | string | ✅ | Email address or phone number of the recipient |
| `text` | string | ✅ | Message text to send |

**Example:**
```json
{ "recipient": "example@icloud.com", "text": "Hello from MCP!" }
```

### `list_conversations`

List recent conversations with the latest message preview and unread count.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | number | ❌ | 20 | Max conversations to return (max 100) |

### `read_conversation`

Read messages from a specific conversation.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `handle` | string | ❌ | — | Filter by handle (email or phone number) |
| `chat_id` | number | ❌ | — | Filter by chat ROWID |
| `limit` | number | ❌ | 30 | Max messages to return (max 200) |
| `before_id` | number | ❌ | — | Paginate: return messages before this ROWID |
| `include_read` | boolean | ❌ | true | Include already-read messages |
| `unread_only` | boolean | ❌ | false | Only return unread messages |

### `get_new_messages`

Poll for recently received messages.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `since` | string | ❌ | last 10 | ISO timestamp to fetch messages from (e.g. `2026-06-28T10:00:00.000Z`) |
| `mark_read` | boolean | ❌ | false | Mark unread messages as read in chat.db |
| `max_results` | number | ❌ | 10 | Max messages to return (max 100) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `IMESSAGE_DB_PATH` | `~/Library/Messages/chat.db` | Override the path to the iMessage chat database |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| ❌ **iMessage database not found** | Make sure you are signed into iMessage in the Messages app. If your database is in a non-standard location, set `IMESSAGE_DB_PATH`. |
| 🔒 **Permission denied / database unreadable** | Grant **Full Disk Access** to your terminal/IDE in _System Settings → Privacy & Security → Full Disk Access_. Restart your terminal after granting. |
| 🔐 **"Database is locked"** | Quit the Messages app completely or wait for sync to finish. |
| 💻 **osascript failed** | Make sure Messages.app is running and signed into your Apple ID. |
| ⚠️ **better-sqlite3 compilation errors** | Install Xcode CLI Tools: `xcode-select --install` and try again. |
| 🐢 **First `npx` run is slow** | npx downloads and compiles native modules on first run. Subsequent runs are cached. |

---

## Security Notes

- The iMessage database is opened in **read-only mode** (`chat.db` is never modified by read operations)
- The `mark_read` option in `get_new_messages` is the only operation that writes to the database
- Sending messages is done through **AppleScript** (`osascript`) which respects macOS privacy controls
- Your chat data **never leaves your machine** — all processing is local

---

## License

MIT © 2026 tinyxia
