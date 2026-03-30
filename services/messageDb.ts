import * as SQLite from "expo-sqlite";
import type { ChatMessage } from "@/types";

let db: SQLite.SQLiteDatabase | null = null;

export async function initMessageDb(): Promise<void> {
  db = await SQLite.openDatabaseAsync("whisper_messages.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      peer          TEXT NOT NULL,
      from_user     TEXT NOT NULL,
      to_user       TEXT NOT NULL,
      text          TEXT NOT NULL,
      timestamp     INTEGER NOT NULL,
      is_mine       INTEGER NOT NULL,
      status        TEXT NOT NULL,
      reply_to_id   TEXT,
      reply_to_text TEXT,
      reply_to_from TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_peer ON messages(peer, timestamp);
  `);

  // Migrate existing databases — add columns if they don't exist yet
  const migrations: Array<[string, string]> = [
    ["reply_to_id", "TEXT"],
    ["reply_to_text", "TEXT"],
    ["reply_to_from", "TEXT"],
    ["type", "TEXT DEFAULT 'text'"],
    ["duration", "INTEGER"],
  ];
  for (const [col, def] of migrations) {
    try {
      await db.execAsync(`ALTER TABLE messages ADD COLUMN ${col} ${def}`);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

export async function saveMessage(
  peer: string,
  msg: ChatMessage,
): Promise<void> {
  if (!db) return;
  await db.runAsync(
    `INSERT OR REPLACE INTO messages
      (id, peer, from_user, to_user, text, timestamp, is_mine, status,
       reply_to_id, reply_to_text, reply_to_from, type, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    msg.id,
    peer,
    msg.from,
    msg.to,
    msg.text,
    msg.timestamp,
    msg.isMine ? 1 : 0,
    msg.status,
    msg.replyTo?.id ?? null,
    msg.replyTo?.text ?? null,
    msg.replyTo?.from ?? null,
    msg.type ?? "text",
    msg.duration ?? null,
  );
}

export async function loadAllMessages(): Promise<
  Record<string, ChatMessage[]>
> {
  if (!db) return {};
  const rows = await db.getAllAsync<{
    id: string;
    peer: string;
    from_user: string;
    to_user: string;
    text: string;
    timestamp: number;
    is_mine: number;
    status: string;
    reply_to_id: string | null;
    reply_to_text: string | null;
    reply_to_from: string | null;
    type: string | null;
    duration: number | null;
  }>("SELECT * FROM messages ORDER BY peer, timestamp ASC");

  const result: Record<string, ChatMessage[]> = {};
  for (const row of rows) {
    if (!result[row.peer]) result[row.peer] = [];
    result[row.peer].push({
      id: row.id,
      from: row.from_user,
      to: row.to_user,
      text: row.text,
      timestamp: row.timestamp,
      isMine: row.is_mine === 1,
      status: row.status as ChatMessage["status"],
      replyTo: row.reply_to_id
        ? {
            id: row.reply_to_id,
            text: row.reply_to_text!,
            from: row.reply_to_from!,
          }
        : undefined,
      type: (row.type === "voice" ? "voice" : "text") as ChatMessage["type"],
      duration: row.duration ?? undefined,
      // audioUri is never persisted — voice audio is ephemeral
    });
  }
  return result;
}

export async function clearAllMessages(): Promise<void> {
  if (!db) return;
  await db.runAsync("DELETE FROM messages");
}
