#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { fileURLToPath } from "url";

// ─── Startup Checks ─────────────────────────────────────────────────────────

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

// --version / --help
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "package.json"), "utf-8")
  );
  console.log(pkg.version);
  process.exit(0);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
  imessage-mcp-server — MCP server for iMessage on macOS

  Usage:
    npx imessage-mcp-server              Start the MCP server (stdio)
    npx imessage-mcp-server --help        Show this help
    npx imessage-mcp-server --version     Show version

  Environment variables:
    IMESSAGE_DB_PATH   Override the path to chat.db (default: ~/Library/Messages/chat.db)
`);
  process.exit(0);
}

// macOS check
if (process.platform !== "darwin") {
  console.error(
    "❌ iMessage MCP only supports macOS (detected: " + process.platform + ")"
  );
  process.exit(1);
}

// osascript check
try {
  execSync("which osascript", { encoding: "utf-8", stdio: "pipe" });
} catch {
  console.error("❌ osascript not found. This tool requires macOS.");
  process.exit(1);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_PATH = resolve(
  process.env.IMESSAGE_DB_PATH || resolve(homedir(), "Library/Messages/chat.db")
);

// Database file check
if (!existsSync(DB_PATH)) {
  console.error("❌ iMessage database not found at: " + DB_PATH);
  console.error("   Make sure you are signed into iMessage on this Mac.");
  console.error(
    "   If the database is elsewhere, set IMESSAGE_DB_PATH to its location."
  );
  process.exit(1);
}
// Apple Cocoa epoch: 2001-01-01 00:00:00 UTC
const COCOA_EPOCH_OFFSET_S = 978_307_200;

// ─── Helpers ────────────────────────────────────────────────────────────────

function openDb() {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma("journal_mode = WAL");
  return db;
}

function cocoaDateToISO(cocoaNs) {
  if (!cocoaNs || cocoaNs <= 0) return null;
  const unixMs = (cocoaNs / 1_000_000_000 + COCOA_EPOCH_OFFSET_S) * 1000;
  return new Date(unixMs).toISOString();
}

/**
 * Send an iMessage via AppleScript.
 * Uses the 'Messages' app which must be signed into iMessage.
 */
function sendMessage(recipient, text) {
  // Escape double quotes in text for AppleScript
  const escaped = text.replace(/"/g, '\\"');
  const script = `tell application "Messages" to send "${escaped}" to buddy "${recipient}"`;
  execSync(`osascript -e '${script}'`, {
    encoding: "utf-8",
    timeout: 15_000,
  });
  return { success: true, recipient, text };
}

// ─── Tool Implementations ───────────────────────────────────────────────────

const TOOLS = {
  send_imessage: {
    description: "Send an iMessage to a recipient's email or phone number",
    inputSchema: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Recipient iMessage account (email or phone number)",
        },
        text: {
          type: "string",
          description: "Message text to send",
        },
      },
      required: ["recipient", "text"],
    },
    handler: (args) => {
      const result = sendMessage(args.recipient, args.text);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    },
  },

  list_conversations: {
    description:
      "List recent iMessage conversations with their latest message preview and unread count",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max conversations to return (default 20)",
          default: 20,
        },
      },
    },
    handler: (args) => {
      const limit = Math.min(args.limit ?? 20, 100);
      const db = openDb();
      const rows = db
        .prepare(
          `
          SELECT
            c.ROWID AS chat_id,
            c.display_name,
            c.chat_identifier,
            c.service_name,
            h.id AS handle_id_str,
            m.ROWID AS last_msg_id,
            m.text AS last_msg_text,
            m.date AS last_msg_date,
            m.is_from_me AS last_msg_from_me,
            (SELECT COUNT(*) FROM message
             WHERE handle_id = h.ROWID
               AND is_read = 0 AND is_from_me = 0
               AND is_finished = 1
            ) AS unread_count
          FROM chat c
          JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
          JOIN handle h ON h.ROWID = chj.handle_id
          LEFT JOIN (
            SELECT cmj.chat_id, MAX(m.ROWID) AS max_msg_id
            FROM chat_message_join cmj
            JOIN message m ON m.ROWID = cmj.message_id
            GROUP BY cmj.chat_id
          ) latest ON latest.chat_id = c.ROWID
          LEFT JOIN message m ON m.ROWID = latest.max_msg_id
          ORDER BY COALESCE(m.date, 0) DESC
          LIMIT ?
        `
        )
        .all(limit);
      db.close();

      const conversations = rows.map((r) => ({
        chat_id: r.chat_id,
        display_name: r.display_name || r.chat_identifier || r.handle_id_str,
        handle: r.handle_id_str,
        service: r.service_name,
        unread_count: r.unread_count || 0,
        last_message: r.last_msg_text
          ? {
              text: r.last_msg_text.substring(0, 200),
              date: cocoaDateToISO(r.last_msg_date),
              is_from_me: !!r.last_msg_from_me,
            }
          : null,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(conversations, null, 2),
          },
        ],
      };
    },
  },

  read_conversation: {
    description:
      "Read messages from a specific conversation by chat_id or handle (email/phone). Returns paginated messages.",
    inputSchema: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description:
            "Filter by handle (email or phone number of the conversation partner)",
        },
        chat_id: {
          type: "number",
          description: "Filter by chat ROWID",
        },
        limit: {
          type: "number",
          description: "Max messages to return (default 30)",
          default: 30,
        },
        before_id: {
          type: "number",
          description:
            "Return messages before this ROWID (for pagination/older messages)",
        },
        include_read: {
          type: "boolean",
          description: "Include already-read messages (default true)",
          default: true,
        },
        unread_only: {
          type: "boolean",
          description: "Only return unread messages (default false)",
          default: false,
        },
      },
    },
    handler: (args) => {
      const limit = Math.min(args.limit ?? 30, 200);
      const includeRead = args.include_read !== false;
      const unreadOnly = args.unread_only === true;

      const db = openDb();

      let where = "WHERE 1=1";
      const params = [];

      if (args.handle) {
        where += " AND h.id = ?";
        params.push(args.handle);
      }
      if (args.chat_id) {
        where += " AND cmj.chat_id = ?";
        params.push(args.chat_id);
      }
      if (args.before_id) {
        where += " AND m.ROWID < ?";
        params.push(args.before_id);
      }
      if (unreadOnly) {
        where += " AND m.is_read = 0 AND m.is_from_me = 0 AND m.is_finished = 1";
      } else if (!includeRead) {
        where += " AND m.is_read = 0 AND m.is_from_me = 0";
      }

      const rows = db
        .prepare(
          `
          SELECT
            m.ROWID,
            m.text,
            m.is_from_me,
            m.is_read,
            m.is_delivered,
            m.date,
            m.service,
            m.date_read,
            m.date_delivered,
            h.id AS handle_id_str,
            c.ROWID AS chat_id,
            COALESCE(c.display_name, c.chat_identifier) AS chat_name
          FROM message m
          JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
          JOIN chat c ON c.ROWID = cmj.chat_id
          LEFT JOIN handle h ON h.ROWID = m.handle_id
          ${where}
          ORDER BY m.date DESC
          LIMIT ?
        `
        )
        .all(...params, limit);
      db.close();

      const messages = rows
        .map((r) => ({
          id: r.ROWID,
          chat_id: r.chat_id,
          chat_name: r.chat_name,
          text: r.text,
          from_me: !!r.is_from_me,
          from: r.is_from_me ? "me" : r.handle_id_str,
          is_read: !!r.is_read,
          is_delivered: !!r.is_delivered,
          service: r.service,
          date: cocoaDateToISO(r.date),
          date_read: cocoaDateToISO(r.date_read),
          date_delivered: cocoaDateToISO(r.date_delivered),
        }))
        .reverse();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                chat_id: rows[0]?.chat_id ?? null,
                chat_name: rows[0]?.chat_name ?? null,
                total: messages.length,
                messages,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },

  get_new_messages: {
    description:
      "Get recently received messages since a given timestamp. Use this to poll for new incoming iMessages.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description:
            "ISO timestamp to fetch messages from (e.g., '2026-06-28T10:00:00.000Z'). If omitted, returns last 10 messages.",
        },
        mark_read: {
          type: "boolean",
          description:
            "Whether to mark unread messages as read in chat.db (default false). NOTE: This modifies the database.",
          default: false,
        },
        max_results: {
          type: "number",
          description: "Max messages to return (default 10)",
          default: 10,
        },
      },
    },
    handler: (args) => {
      const maxResults = Math.min(args.max_results ?? 10, 100);
      const markRead = args.mark_read === true;
      const db = openDb();

      let where = "WHERE m.is_from_me = 0 AND m.is_finished = 1";

      if (args.since) {
        const sinceDate = new Date(args.since);
        if (!isNaN(sinceDate.getTime())) {
          const cocoaNs =
            (sinceDate.getTime() / 1000 - COCOA_EPOCH_OFFSET_S) * 1_000_000_000;
          where += ` AND m.date > ${Math.floor(cocoaNs)}`;
        }
      }

      const rows = db
        .prepare(
          `
          SELECT
            m.ROWID,
            m.text,
            m.is_from_me,
            m.is_read,
            m.is_delivered,
            m.date,
            m.service,
            h.id AS handle_id_str,
            c.ROWID AS chat_id,
            COALESCE(c.display_name, c.chat_identifier) AS chat_name
          FROM message m
          JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
          JOIN chat c ON c.ROWID = cmj.chat_id
          LEFT JOIN handle h ON h.ROWID = m.handle_id
          ${where}
          ORDER BY m.date DESC
          LIMIT ?
        `
        )
        .all(maxResults);
      db.close();

      const messages = rows.map((r) => ({
        id: r.ROWID,
        chat_id: r.chat_id,
        chat_name: r.chat_name,
        text: r.text,
        from: r.handle_id_str,
        is_read: !!r.is_read,
        is_delivered: !!r.is_delivered,
        service: r.service,
        date: cocoaDateToISO(r.date),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: messages.length,
                has_unread: messages.some((m) => !m.is_read),
                messages,
              },
              null,
              2
            ),
          },
        ],
      };
    },
  },
};

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "imessage-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(TOOLS).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = TOOLS[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args ?? {});
});

// ─── Startup ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("iMessage MCP Server running on stdio");
