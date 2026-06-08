import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import path from "path";

// Eén gedeelde databaseverbinding voor de hele server.
// SQLite houdt de MVP zelfstandig draaibaar zonder externe diensten.
const dataDir = path.join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __carInboxDb: Database.Database | undefined;
}

function init(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS start_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact TEXT NOT NULL UNIQUE,
      contact_type TEXT NOT NULL,            -- 'email' | 'phone'
      name TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL,                   -- genormaliseerd kenteken
      user_id INTEGER NOT NULL,
      photo_url TEXT,
      notify_push INTEGER NOT NULL DEFAULT 1,
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_sms INTEGER NOT NULL DEFAULT 0,
      start_group_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (plate, user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (start_group_id) REFERENCES start_groups(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL,                   -- doelkenteken (genormaliseerd)
      sender_id INTEGER NOT NULL,
      type TEXT NOT NULL,                    -- preset-sleutel of 'vrij'
      body TEXT NOT NULL,
      anonymous INTEGER NOT NULL DEFAULT 0,  -- anoniem voor de ontvanger, nooit voor het systeem
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      read_at TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      reporter_id INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_plates_plate ON plates(plate);
    CREATE INDEX IF NOT EXISTS idx_messages_plate ON messages(plate);
  `);

  // Seed één afgebakende startgroep (cold start): vanaf dag één hoge dekking.
  const count = db.prepare("SELECT COUNT(*) AS n FROM start_groups").get() as {
    n: number;
  };
  if (count.n === 0) {
    db.prepare("INSERT INTO start_groups (name, type) VALUES (?, ?)").run(
      "Bedrijventerrein De Hoek",
      "bedrijventerrein"
    );
    db.prepare("INSERT INTO start_groups (name, type) VALUES (?, ?)").run(
      "Leasevloot Noord",
      "wagenpark"
    );
  }

  return db;
}

export const db: Database.Database = global.__carInboxDb ?? init();
if (process.env.NODE_ENV !== "production") global.__carInboxDb = db;
