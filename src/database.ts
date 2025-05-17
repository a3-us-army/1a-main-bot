import Database from "better-sqlite3";

const db = new Database("events.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    creator_id TEXT,
    title TEXT,
    time TEXT,
    message_id TEXT,
    channel_id TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS rsvps (
    event_id TEXT,
    user_id TEXT,
    status TEXT,
    PRIMARY KEY (event_id, user_id)
  )
`).run();

export default db;