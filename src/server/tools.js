import {
  sendMessage,
  listConversations,
  readConversation,
  getNewMessages,
} from "../shared/imessage.js";

export const TOOLS = {
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
        content: [{ type: "text", text: JSON.stringify(result) }],
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
      const conversations = listConversations(args.limit ?? 20);
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
      const result = readConversation({
        handle: args.handle,
        chat_id: args.chat_id,
        limit: args.limit ?? 30,
        before_id: args.before_id,
        include_read: args.include_read !== false,
        unread_only: args.unread_only === true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
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
        max_results: {
          type: "number",
          description: "Max messages to return (default 10)",
          default: 10,
        },
        unread_only: {
          type: "boolean",
          description: "Only return unread messages (default false)",
          default: false,
        },
      },
    },
    handler: (args) => {
      const messages = getNewMessages({
        since: args.since,
        max_results: args.max_results ?? 10,
        unread_only: args.unread_only === true,
      });
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
