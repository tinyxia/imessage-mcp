import fs from "fs";
import path from "path";
import { homedir } from "os";
import {
  openDb,
  getMasterHandleId,
  getNewMessagesForBridge,
  sendMessage,
} from "../shared/imessage.js";
import { LOG, sleep } from "../shared/utils.js";
import { LlmLoop } from "./llm-loop.js";

const STATE_DIR = path.join(homedir(), ".imessage-mcp-server");
const STATE_PATH = path.join(STATE_DIR, "bridge-state.json");

export class BridgeDaemon {
  constructor(config, mcpManager) {
    this.config = config;
    this.mcpManager = mcpManager;
    this.llmLoop = new LlmLoop(config, mcpManager);
    this.state = this.loadState();
    this.shutdownRequested = false;
    this.processing = false;

    process.on("SIGINT", () => this.requestShutdown("SIGINT"));
    process.on("SIGTERM", () => this.requestShutdown("SIGTERM"));
  }

  requestShutdown(signal) {
    LOG.info(`Received ${signal}, shutting down...`);
    this.shutdownRequested = true;
  }

  loadState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    } catch {
      return {
        lastProcessedId: {},
        conversations: {},
        initialized: false,
      };
    }
  }

  saveState() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const cleaned = { ...this.state };
    for (const [chatId, msgs] of Object.entries(cleaned.conversations || {})) {
      const max = 50;
      if (msgs.length > max) {
        cleaned.conversations[chatId] = msgs.slice(msgs.length - max);
      }
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify(cleaned, null, 2));
  }

  async run() {
    LOG.info("Starting iMessage Bridge Daemon", {
      masterHandle: this.config.masterHandle,
      provider: this.config.provider,
      model: this.config.model,
    });

    await this.mcpManager.connectAll();

    if (!this.state.initialized) {
      await this.initializeState();
    }

    LOG.info("Entering polling loop...");

    while (!this.shutdownRequested) {
      try {
        await this.pollCycle();
      } catch (err) {
        LOG.error("Poll cycle error", { error: err.message });
      }
      if (!this.shutdownRequested) {
        await sleep(this.config.pollIntervalMs);
      }
    }

    await this.mcpManager.close();
    LOG.info("Daemon shut down gracefully");
  }

  async initializeState() {
    const db = openDb();
    try {
      const handleId = getMasterHandleId(db, this.config.masterHandle);
      if (!handleId) {
        LOG.error("Master handle not found in chat.db", {
          handle: this.config.masterHandle,
        });
        const handles = db.prepare("SELECT id FROM handle").all();
        LOG.info("Available handles:");
        for (const h of handles) LOG.info(`  - ${h.id}`);
        process.exit(1);
      }

      if (Object.keys(this.state.lastProcessedId).length === 0) {
        const chats = db
          .prepare(
            `
            SELECT DISTINCT cmj.chat_id
            FROM message m
            JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
            WHERE m.handle_id = ?
          `
          )
          .all(handleId);
        for (const c of chats) {
          const lastMsg = db
            .prepare(
              `
              SELECT MAX(m.ROWID) as last_id
              FROM message m
              JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
              WHERE m.handle_id = ? AND cmj.chat_id = ?
            `
            )
            .get(handleId, c.chat_id);
          if (lastMsg?.last_id) {
            this.state.lastProcessedId[String(c.chat_id)] = lastMsg.last_id;
          }
        }
      }

      this.state.initialized = true;
      this.saveState();
      LOG.info("Initialized: skipping existing messages", {
        chatsTracked: Object.keys(this.state.lastProcessedId).length,
      });
    } finally {
      db.close();
    }
  }

  async pollCycle() {
    const db = openDb();
    try {
      const handleId = getMasterHandleId(db, this.config.masterHandle);
      if (!handleId) {
        LOG.warn("Master handle not found, skipping poll");
        return;
      }

      const chatIds = Object.keys(this.state.lastProcessedId);
      let newMessages = [];

      if (chatIds.length === 0) {
        // First run - discover chats
        const chats = db
          .prepare(
            `
            SELECT DISTINCT cmj.chat_id
            FROM message m
            JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
            WHERE m.handle_id = ?
          `
          )
          .all(handleId);
        for (const c of chats) {
          const lastMsg = db
            .prepare(
              `
              SELECT MAX(m.ROWID) as last_id
              FROM message m
              JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
              WHERE m.handle_id = ? AND cmj.chat_id = ?
            `
            )
            .get(handleId, c.chat_id);
          if (lastMsg?.last_id) {
            this.state.lastProcessedId[String(c.chat_id)] = lastMsg.last_id;
          }
        }
        this.saveState();
      } else {
        for (const chatId of chatIds) {
          const lastId = this.state.lastProcessedId[chatId] || 0;
          const msgs = getNewMessagesForBridge(db, handleId, lastId);
          newMessages.push(...msgs);
        }
      }

      if (newMessages.length > 0 && !this.processing) {
        this.processing = true;
        LOG.info(`Found ${newMessages.length} new message(s)`);

        for (const msg of newMessages) {
          if (this.shutdownRequested) break;
          try {
            await this.processMessage(msg);
            this.saveState();
          } catch (err) {
            LOG.error("Error processing message", {
              msgId: msg.ROWID,
              error: err.message,
            });
          }
        }

        this.processing = false;
      } else if (newMessages.length > 0 && this.processing) {
        LOG.debug("Still processing previous message, skipping poll cycle");
      }
    } finally {
      db.close();
    }
  }

  async processMessage(message) {
    const { ROWID: msgId, text: userText, chat_id: chatId } = message;
    LOG.info(`Processing message #${msgId}`, {
      chatId,
      text: userText.substring(0, 100),
    });

    if (this.config.sendProcessingIndicator) {
      await this.reply("⏳ 收到，正在处理...");
    }

    const replyFn = (text) => this.reply(text);
    await this.llmLoop.process(userText, this.state, chatId, replyFn);

    this.state.lastProcessedId[String(chatId)] = msgId;
    LOG.info(`Message #${msgId} processed successfully`);
  }

  async reply(text) {
    try {
      sendMessage(this.config.masterHandle, text);
      LOG.info("Reply sent", {
        length: text.length,
        preview: text.substring(0, 60),
      });
    } catch (err) {
      LOG.error("Failed to send reply", { error: err.message });
    }
  }
}
