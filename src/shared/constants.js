import { homedir } from "os";
import { resolve } from "path";

// Apple Cocoa epoch: 2001-01-01 00:00:00 UTC
export const COCOA_EPOCH_OFFSET_S = 978_307_200;

// Default iMessage SQLite database path
export const DEFAULT_DB_PATH = resolve(
  homedir(),
  "Library/Messages/chat.db"
);

// Runtime path override via environment
export const DB_PATH = resolve(
  process.env.IMESSAGE_DB_PATH || DEFAULT_DB_PATH
);

export const DEFAULTS = {
  SERVER: {
    name: "imessage-mcp",
    version: "2.0.0",
  },
  BRIDGE: {
    pollIntervalMs: 3000,
    maxHistoryPerConversation: 20,
    maxToolIterations: 10,
    maxTokens: 4096,
    sendProcessingIndicator: true,
  },
};
