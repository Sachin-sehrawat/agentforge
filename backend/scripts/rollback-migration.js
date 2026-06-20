#!/usr/bin/env node
/**
 * Rollback Migration Script
 *
 * Restores AgentForge data to its pre-migration state by:
 *   1. Rebuilding the SQLite agents.db from a PostgreSQL JSON backup
 *   2. Optionally restoring MongoDB collections from a MongoDB JSON backup
 *   3. Validating the restored data against the backup
 *   4. Printing a rollback status report
 *
 * Usage:
 *   node scripts/rollback-migration.js [options]
 *
 * Options:
 *   --pg-backup    <file>   Path to pg-backup-*.json  (required unless --mongo-only)
 *   --mongo-backup <file>   Path to mongo-backup-*.json (optional)
 *   --sqlite-path  <path>   Where to write the restored SQLite DB (default: agents.db)
 *   --dry-run               Validate and print without writing anything
 *   --mongo-only            Skip SQLite restore; only restore MongoDB
 *   --help, -h              Show this help message
 *
 * Exit codes:
 *   0  success
 *   1  error / validation failure
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

// ─── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : null;
}

const SHOW_HELP    = argv.includes('--help') || argv.includes('-h');
const DRY_RUN      = argv.includes('--dry-run');
const MONGO_ONLY   = argv.includes('--mongo-only');
const PG_BACKUP    = getArg('--pg-backup')    ? resolve(getArg('--pg-backup'))    : null;
const MONGO_BACKUP = getArg('--mongo-backup') ? resolve(getArg('--mongo-backup')) : null;
const SQLITE_PATH  = resolve(ROOT, getArg('--sqlite-path') ?? 'agents.db');

if (SHOW_HELP) {
  console.log(`
AgentForge: Rollback Migration Script

Usage:
  node scripts/rollback-migration.js [options]

Options:
  --pg-backup    <file>   Path to pg-backup-*.json  (required unless --mongo-only)
  --mongo-backup <file>   Path to mongo-backup-*.json (optional)
  --sqlite-path  <path>   Where to write the restored SQLite DB (default: agents.db)
  --dry-run               Validate and print without writing anything
  --mongo-only            Skip SQLite restore; only restore MongoDB
  --help, -h              Show this message

Examples:
  # Full rollback (PostgreSQL → SQLite + MongoDB restore)
  node scripts/rollback-migration.js \\
    --pg-backup backups/postgresql/pg-backup-2026-01-01T00-00-00-000Z.json \\
    --mongo-backup backups/mongodb/mongo-backup-2026-01-01T00-00-00-000Z.json

  # Dry-run to validate before committing
  node scripts/rollback-migration.js \\
    --pg-backup backups/postgresql/pg-backup-<stamp>.json --dry-run

  # MongoDB restore only
  node scripts/rollback-migration.js \\
    --mongo-backup backups/mongodb/mongo-backup-<stamp>.json --mongo-only
`.trim());
  process.exit(0);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const log = {
  info:  (...a) => console.log('[INFO ]', ...a),
  ok:    (...a) => console.log('[OK   ]', ...a),
  warn:  (...a) => console.warn('[WARN ]', ...a),
  error: (...a) => console.error('[ERROR]', ...a),
  sep:   ()     => console.log('─'.repeat(60)),
};

// ─── Report state ─────────────────────────────────────────────────────────────

const report = {
  started_at:     new Date().toISOString(),
  dry_run:        DRY_RUN,
  pg_backup:      PG_BACKUP,
  mongo_backup:   MONGO_BACKUP,
  sqlite_path:    SQLITE_PATH,
  sqlite_restore: null,
  mongo_restore:  null,
  validation:     [],
  status:         'pending',
};

// ─── SQLite helpers ───────────────────────────────────────────────────────────

async function openSqlJs() {
  let initSqlJs;
  try {
    const mod = await import('sql.js');
    initSqlJs = mod.default ?? mod;
  } catch {
    log.error('sql.js is not installed. Run: npm install --save-dev sql.js');
    process.exit(1);
  }
  return initSqlJs();
}

function createSqliteDb(SQL, agents, customSkills) {
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      persona       TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      model         TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      tools         TEXT NOT NULL DEFAULT '[]',
      positions     TEXT NOT NULL DEFAULT '{}',
      skills        TEXT NOT NULL DEFAULT '[]',
      instructions  TEXT NOT NULL DEFAULT '[]',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS custom_skills (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#6366f1',
      description TEXT NOT NULL DEFAULT '',
      instruction TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const agentStmt = db.prepare(`
    INSERT INTO agents
      (id, name, persona, system_prompt, model, tools, positions, skills, instructions, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of agents) {
    agentStmt.run([
      a.id,
      a.name        ?? '',
      a.persona     ?? '',
      a.system_prompt ?? '',
      a.model       ?? 'claude-sonnet-4-6',
      typeof a.tools        === 'string' ? a.tools        : JSON.stringify(a.tools        ?? []),
      typeof a.positions    === 'string' ? a.positions    : JSON.stringify(a.positions    ?? {}),
      typeof a.skills       === 'string' ? a.skills       : JSON.stringify(a.skills       ?? []),
      typeof a.instructions === 'string' ? a.instructions : JSON.stringify(a.instructions ?? []),
      a.created_at  ?? new Date().toISOString(),
      a.updated_at  ?? new Date().toISOString(),
    ]);
  }
  agentStmt.free();

  const skillStmt = db.prepare(`
    INSERT INTO custom_skills
      (id, label, color, description, instruction, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of customSkills) {
    skillStmt.run([
      s.id,
      s.label       ?? '',
      s.color       ?? '#6366f1',
      s.description ?? '',
      s.instruction ?? '',
      s.created_at  ?? new Date().toISOString(),
      s.updated_at  ?? new Date().toISOString(),
    ]);
  }
  skillStmt.free();

  return db;
}

// ─── PostgreSQL → SQLite restore ──────────────────────────────────────────────

async function restoreSqlite(pgBackup) {
  log.sep();
  log.info('Phase 1: Restore SQLite from PostgreSQL backup');
  log.sep();

  const backup = pgBackup;
  const tables = backup.metadata?.tables ?? Object.keys(backup.data ?? {});
  log.info(`Backup timestamp : ${backup.metadata?.timestamp ?? 'unknown'}`);
  log.info(`Tables in backup : ${tables.join(', ')}`);

  const agentData  = (backup.data?.agents?.rows       ?? backup.data?.agents       ?? []);
  const skillData  = (backup.data?.custom_skills?.rows ?? backup.data?.custom_skills ?? []);

  log.info(`Agents to restore: ${agentData.length}`);
  log.info(`Skills to restore: ${skillData.length}`);

  // Validate required fields
  const errors = [];
  for (const a of agentData) {
    if (!a.id)   errors.push(`Agent missing id (name: ${a.name})`);
    if (!a.name) errors.push(`Agent missing name (id: ${a.id})`);
  }
  for (const s of skillData) {
    if (!s.id)    errors.push(`Skill missing id (label: ${s.label})`);
    if (!s.label) errors.push(`Skill missing label (id: ${s.id})`);
  }

  if (errors.length) {
    log.error('Validation errors in backup data:');
    errors.forEach((e) => log.error(' •', e));
    return { success: false, errors };
  }
  log.ok('Backup data validation passed');

  if (DRY_RUN) {
    log.info('DRY RUN — would write SQLite to:', SQLITE_PATH);
    log.info('Agents preview:');
    for (const a of agentData.slice(0, 3)) {
      log.info(`  ${a.id} | ${a.name}`);
    }
    if (agentData.length > 3) log.info(`  … and ${agentData.length - 3} more`);
    return { success: true, dry_run: true, agents: agentData.length, skills: skillData.length };
  }

  // Backup existing SQLite if it exists
  if (fs.existsSync(SQLITE_PATH)) {
    const stamp   = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCopy = `${SQLITE_PATH}.pre-rollback-${stamp}.bak`;
    fs.copyFileSync(SQLITE_PATH, safeCopy);
    log.info(`Existing SQLite backed up → ${safeCopy}`);
  }

  const SQL = await openSqlJs();
  const db  = createSqliteDb(SQL, agentData, skillData);

  // Verify the in-memory DB before writing
  const agentCheck = db.exec('SELECT COUNT(*) FROM agents');
  const skillCheck = db.exec('SELECT COUNT(*) FROM custom_skills');
  const agentCount = agentCheck[0]?.values[0][0] ?? 0;
  const skillCount = skillCheck[0]?.values[0][0] ?? 0;

  if (agentCount !== agentData.length) {
    db.close();
    return { success: false, errors: [`Expected ${agentData.length} agents in DB, got ${agentCount}`] };
  }
  if (skillCount !== skillData.length) {
    db.close();
    return { success: false, errors: [`Expected ${skillData.length} skills in DB, got ${skillCount}`] };
  }

  // Write to disk
  const data = db.export();
  db.close();
  fs.writeFileSync(SQLITE_PATH, Buffer.from(data));

  log.ok(`SQLite written → ${SQLITE_PATH}`);
  log.ok(`  ${agentCount} agent(s), ${skillCount} skill(s) restored`);

  return { success: true, agents: agentCount, skills: skillCount };
}

// ─── MongoDB restore ──────────────────────────────────────────────────────────

async function restoreMongo(mongoBackup) {
  log.sep();
  log.info('Phase 2: Restore MongoDB from backup');
  log.sep();

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    log.error('MONGO_URI environment variable is not set.');
    return { success: false, errors: ['MONGO_URI not configured'] };
  }

  const backup     = mongoBackup;
  const dbName     = backup.metadata?.database ?? process.env.MONGO_DB ?? 'agentforge';
  const collections = backup.metadata?.collections ?? Object.keys(backup.data ?? {});

  log.info(`Backup timestamp : ${backup.metadata?.timestamp ?? 'unknown'}`);
  log.info(`Database         : ${dbName}`);
  log.info(`Collections      : ${collections.join(', ')}`);

  for (const col of collections) {
    const count = (backup.data?.[col] ?? []).length;
    log.info(`  ${col}: ${count} document(s)`);
  }

  if (DRY_RUN) {
    log.info('DRY RUN — would restore MongoDB collections:', collections.join(', '));
    return { success: true, dry_run: true, collections };
  }

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  const restored = {};

  try {
    await client.connect();
    log.ok('Connected to MongoDB');

    const db = client.db(dbName);

    for (const name of collections) {
      const docs = backup.data?.[name] ?? [];

      // Drop existing collection and restore from backup
      await db.collection(name).drop().catch(() => {}); // ignore if not exists
      if (docs.length > 0) {
        await db.collection(name).insertMany(docs);
      }
      restored[name] = docs.length;
      log.ok(`  ${name}: ${docs.length} document(s) restored`);
    }

    // Validate counts
    const errors = [];
    for (const name of collections) {
      const count = await db.collection(name).countDocuments();
      if (count !== (restored[name] ?? 0)) {
        errors.push(`${name}: expected ${restored[name]}, found ${count}`);
      }
    }

    if (errors.length) {
      return { success: false, errors };
    }

    return { success: true, restored };

  } finally {
    await client.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.sep();
  log.info('AgentForge: Rollback Migration');
  log.info(`Mode        : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (!MONGO_ONLY) log.info(`PG backup   : ${PG_BACKUP ?? '(none)'}`);
  if (MONGO_BACKUP) log.info(`Mongo backup: ${MONGO_BACKUP}`);
  if (!MONGO_ONLY) log.info(`SQLite dest : ${SQLITE_PATH}`);
  log.sep();

  // ── Validate inputs ──────────────────────────────────────────────────────────
  if (!MONGO_ONLY && !PG_BACKUP) {
    log.error('--pg-backup <file> is required (or pass --mongo-only to skip SQLite restore).');
    log.error('Run with --help for usage.');
    process.exit(1);
  }

  if (PG_BACKUP && !fs.existsSync(PG_BACKUP)) {
    log.error(`PostgreSQL backup file not found: ${PG_BACKUP}`);
    process.exit(1);
  }

  if (MONGO_BACKUP && !fs.existsSync(MONGO_BACKUP)) {
    log.error(`MongoDB backup file not found: ${MONGO_BACKUP}`);
    process.exit(1);
  }

  // ── Load backups ──────────────────────────────────────────────────────────────
  let pgBackupData    = null;
  let mongoBackupData = null;

  if (PG_BACKUP) {
    try {
      pgBackupData = JSON.parse(fs.readFileSync(PG_BACKUP, 'utf8'));
    } catch (err) {
      log.error(`Failed to parse PostgreSQL backup: ${err.message}`);
      process.exit(1);
    }
  }

  if (MONGO_BACKUP) {
    try {
      mongoBackupData = JSON.parse(fs.readFileSync(MONGO_BACKUP, 'utf8'));
    } catch (err) {
      log.error(`Failed to parse MongoDB backup: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Execute restore phases ────────────────────────────────────────────────────
  if (!MONGO_ONLY && pgBackupData) {
    report.sqlite_restore = await restoreSqlite(pgBackupData);
    if (!report.sqlite_restore.success) {
      log.error('SQLite restore failed:');
      report.sqlite_restore.errors?.forEach((e) => log.error(' •', e));
      report.status = 'failed';
      printReport();
      process.exit(1);
    }
  }

  if (mongoBackupData) {
    report.mongo_restore = await restoreMongo(mongoBackupData);
    if (!report.mongo_restore.success) {
      log.error('MongoDB restore failed:');
      report.mongo_restore.errors?.forEach((e) => log.error(' •', e));
      report.status = 'failed';
      printReport();
      process.exit(1);
    }
  }

  report.status       = DRY_RUN ? 'dry-run-ok' : 'success';
  report.completed_at = new Date().toISOString();
  printReport();
}

function printReport() {
  log.sep();
  log.info('════ ROLLBACK STATUS REPORT ════');
  log.info(`Status          : ${report.status}`);
  log.info(`Started at      : ${report.started_at}`);
  if (report.completed_at) log.info(`Completed at    : ${report.completed_at}`);
  log.info(`Dry run         : ${report.dry_run}`);

  if (report.sqlite_restore) {
    const r = report.sqlite_restore;
    log.info('SQLite restore  :');
    log.info(`  success       : ${r.success}`);
    if (r.agents  != null) log.info(`  agents        : ${r.agents}`);
    if (r.skills  != null) log.info(`  skills        : ${r.skills}`);
    if (r.errors?.length)  log.info(`  errors        : ${r.errors.join('; ')}`);
  }

  if (report.mongo_restore) {
    const r = report.mongo_restore;
    log.info('MongoDB restore :');
    log.info(`  success       : ${r.success}`);
    if (r.restored) {
      for (const [col, count] of Object.entries(r.restored)) {
        log.info(`  ${col}: ${count}`);
      }
    }
    if (r.errors?.length) log.info(`  errors        : ${r.errors.join('; ')}`);
  }

  if (report.status === 'success') {
    log.sep();
    log.ok('Rollback completed successfully.');
    log.info('Next steps:');
    log.info('  1. Verify the restored SQLite DB: node scripts/backup-sqlite.js --dry-run');
    log.info('  2. Restart the backend pointed at agents.db (SQLite mode)');
    log.info('  3. Smoke-test the application');
  }
  log.sep();
}

main().catch((err) => {
  log.error('Unexpected error:', err.message);
  process.exit(1);
});
