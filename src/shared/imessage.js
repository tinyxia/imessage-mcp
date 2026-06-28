import Database from "better-sqlite3";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { COCOA_EPOCH_OFFSET_S, DB_PATH } from "./constants.js";
import { cocoaDateToISO } from "./utils.js";

export function validateDbPath() {
  if (!existsSync(DB_PATH)) {
    console.error("❌ iMessage database not found at: " + DB_PATH);
    console.error("   Make sure you are signed into iMessage on this Mac.");
    console.error(
      "   If the database is elsewhere, set IMESSAGE_DB_PATH to its location."
    );
    process.exit(1);
  }
}

export function openDb(options = {}) {
  validateDbPath();
  const db = new Database(DB_PATH, {
    readonly: options.readonly !== false,
    fileMustExist: true,
  });
  db.pragma("journal_mode = WAL");
  if (options.queryOnly) {
    db.pragma("query_only = true");
  }
  return db;
}

export function sendMessage(recipient, text) {
  const escaped = text.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const script = `tell application "Messages" to send "${escaped}" to buddy "${recipient}"`;
  execSync(`osascript -e '${script}'`, {
    encoding: "utf-8",
    timeout: 15_000,
  });
  return { success: true, recipient, text };
}

export function listConversations(limit = 20) {
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
    .all(Math.min(limit, 100));
  db.close();

  return rows.map((r) => ({
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
}

export function readConversation({
  handle,
  chat_id,
  limit = 30,
  before_id,
  include_read = true,
  unread_only = false,
}) {
  const db = openDb();
  let where = "WHERE 1=1";
  const params = [];

  if (handle) {
    where += " AND h.id = ?";
    params.push(handle);
  }
  if (chat_id) {
    where += " AND cmj.chat_id = ?";
    params.push(chat_id);
  }
  if (before_id) {
    where += " AND m.ROWID < ?";
    params.push(before_id);
  }
  if (unread_only) {
    where += " AND m.is_read = 0 AND m.is_from_me = 0 AND m.is_finished = 1";
  } else if (!include_read) {
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
    .all(...params, Math.min(limit, 200));
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
    chat_id: rows[0]?.chat_id ?? null,
    chat_name: rows[0]?.chat_name ?? null,
    total: messages.length,
    messages,
  };
}

export function getNewMessages({ since, max_results = 10, unread_only = false }) {
  const db = openDb();
  let where = "WHERE m.is_from_me = 0 AND m.is_finished = 1";

  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) {
      const cocoaNs = (d.getTime() / 1000 - COCOA_EPOCH_OFFSET_S) * 1_000_000_000;
      where += ` AND m.date > ${Math.floor(cocoaNs)}`;
    }
  }

  if (unread_only) {
    where += " AND m.is_read = 0";
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
    .all(Math.min(max_results, 100));
  db.close();

  return rows.map((r) => ({
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
}

// ─── Bridge-specific helpers ────────────────────────────────────────────────

export function getMasterHandleId(db, masterHandle) {
  const row = db.prepare("SELECT ROWID FROM handle WHERE id = ?").get(masterHandle);
  return row?.ROWID;
}

export function getLatestMessageId(db) {
  const row = db.prepare("SELECT MAX(ROWID) as max_id FROM message").get();
  return row?.max_id || 0;
}

export function getChatName(db, chatId) {
  const row = db
    .prepare(
      `
      SELECT COALESCE(c.display_name, c.chat_identifier, h.id) AS name
      FROM chat c
      LEFT JOIN chat_handle_join chj ON chj.chat_id = c.ROWID
      LEFT JOIN handle h ON h.ROWID = chj.handle_id
      WHERE c.ROWID = ?
      LIMIT 1
    `
    )
    .get(chatId);
  return row?.name || `chat_${chatId}`;
}

export function getNewMessagesForBridge(db, handleId, lastId) {
  return db
    .prepare(
      `
      SELECT m.ROWID, m.text, m.date, cmj.chat_id
      FROM message m
      JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      WHERE m.is_from_me = 0
        AND m.handle_id = ?
        AND m.ROWID > ?
        AND m.is_finished = 1
        AND m.text IS NOT NULL
        AND m.text != ''
      ORDER BY m.ROWID ASC
    `
    )
    .all(handleId, lastId || 0);
}
