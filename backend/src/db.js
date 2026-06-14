import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'agents.db');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    persona TEXT DEFAULT '',
    system_prompt TEXT DEFAULT '',
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    tools TEXT NOT NULL DEFAULT '[]',
    positions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrate: add skills column if it doesn't exist yet
try {
  db.exec(`ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // column already exists — safe to ignore
}

// Migrate: add instructions column if it doesn't exist yet
try {
  db.exec(`ALTER TABLE agents ADD COLUMN instructions TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // column already exists — safe to ignore
}

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_skills (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT NOT NULL DEFAULT '',
    instruction TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export default db;
