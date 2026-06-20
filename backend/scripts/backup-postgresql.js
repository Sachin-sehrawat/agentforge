#!/usr/bin/env node
/**
 * PostgreSQL Backup Script
 *
 * Exports all data from the PostgreSQL database to a timestamped JSON file.
 * The export includes schema information and row counts for each table.
 *
 * Usage:
 *   node scripts/backup-postgresql.js [options]
 *
 * Options:
 *   --backup-dir <path>   Destination directory   (default: ./backups/postgresql)
 *   --help, -h            Show this help message
 *
 * Exit codes:
 *   0  success
 *   1  error
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import fs from 'fs';
import pg from 'pg';
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

const SHOW_HELP  = argv.includes('--help') || argv.includes('-h');
const BACKUP_DIR = resolve(ROOT, getArg('--backup-dir') ?? join('backups', 'postgresql'));

if (SHOW_HELP) {
  console.log(`
PostgreSQL Backup Script

Usage:
  node scripts/backup-postgresql.js [options]

Options:
  --backup-dir <path>   Destination directory   (default: ./backups/postgresql)
  --help, -h            Show this message

Environment variables (or .env file):
  DATABASE_URL        Full PostgreSQL connection string (overrides individual vars)
  POSTGRES_HOST       default: localhost
  POSTGRES_PORT       default: 5432
  POSTGRES_DB         default: agentforge
  POSTGRES_USER       default: agentforge
  POSTGRES_PASSWORD   default: agentforge
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

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

function buildPgPool() {
  const { Pool } = pg;
  const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host:     process.env.POSTGRES_HOST     ?? 'localhost',
        port:     parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
        database: process.env.POSTGRES_DB       ?? 'agentforge',
        user:     process.env.POSTGRES_USER     ?? 'agentforge',
        password: process.env.POSTGRES_PASSWORD ?? 'agentforge',
      };
  return new Pool({ ...config, max: 3, connectionTimeoutMillis: 10_000 });
}

async function getTableSchema(client, table) {
  const { rows } = await client.query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.sep();
  log.info('AgentForge: PostgreSQL Backup');
  log.info(`Backup dir: ${BACKUP_DIR}`);
  log.sep();

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const pool   = buildPgPool();
  const client = await pool.connect();

  try {
    // Gather table list from the public schema
    const { rows: tableList } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const tables    = tableList.map((r) => r.tablename);
    const snapshot  = {};
    const rowCounts = {};

    log.info(`Tables found: ${tables.join(', ')}`);
    log.sep();

    for (const table of tables) {
      const { rows: data }   = await client.query(`SELECT * FROM "${table}"`);
      const schema           = await getTableSchema(client, table);
      snapshot[table]        = { schema, rows: data };
      rowCounts[table]       = data.length;
      log.info(`  ${table}: ${data.length} row(s) exported`);
    }

    const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = join(BACKUP_DIR, `pg-backup-${stamp}.json`);

    const output = {
      metadata: {
        timestamp:   new Date().toISOString(),
        database:    process.env.POSTGRES_DB ?? 'agentforge',
        host:        process.env.POSTGRES_HOST ?? 'localhost',
        row_counts:  rowCounts,
        tables,
      },
      data: snapshot,
    };

    fs.writeFileSync(filename, JSON.stringify(output, null, 2));

    log.sep();
    log.ok(`Backup written → ${filename}`);
    log.ok('PostgreSQL backup complete.');
    log.info(`Restore hint: node scripts/rollback-migration.js --pg-backup "${filename}"`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  log.error('Unexpected error:', err.message);
  process.exit(1);
});
