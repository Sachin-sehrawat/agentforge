#!/usr/bin/env node
/**
 * SQLite Backup Script
 *
 * Creates a timestamped binary copy of agents.db plus a JSON sidecar with
 * metadata (timestamp, row counts per table, file size, SHA-256 checksum).
 *
 * Usage:
 *   node scripts/backup-sqlite.js [options]
 *
 * Options:
 *   --sqlite-path <path>   Path to agents.db          (default: agents.db)
 *   --backup-dir  <path>   Destination directory       (default: ./backups/sqlite)
 *   --help, -h             Show this help message
 *
 * Exit codes:
 *   0  success
 *   1  error
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

// ─── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : null;
}

const SHOW_HELP   = argv.includes('--help') || argv.includes('-h');
const SQLITE_PATH = resolve(ROOT, getArg('--sqlite-path') ?? 'agents.db');
const BACKUP_DIR  = resolve(ROOT, getArg('--backup-dir')  ?? join('backups', 'sqlite'));

if (SHOW_HELP) {
  console.log(`
SQLite Backup Script

Usage:
  node scripts/backup-sqlite.js [options]

Options:
  --sqlite-path <path>   Path to agents.db          (default: agents.db)
  --backup-dir  <path>   Destination directory       (default: ./backups/sqlite)
  --help, -h             Show this message
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function getRowCounts(dbPath) {
  let initSqlJs;
  try {
    const mod = await import('sql.js');
    initSqlJs = mod.default ?? mod;
  } catch {
    log.warn('sql.js not available — row counts skipped (run npm install)');
    return null;
  }

  const SQL    = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db     = new SQL.Database(buffer);

  const counts = {};
  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  if (tables.length) {
    for (const name of tables[0].values.flat()) {
      const res = db.exec(`SELECT COUNT(*) FROM "${name}"`);
      counts[name] = res.length ? res[0].values[0][0] : 0;
    }
  }
  db.close();
  return counts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.sep();
  log.info('AgentForge: SQLite Backup');
  log.info(`Source : ${SQLITE_PATH}`);
  log.info(`Dest   : ${BACKUP_DIR}`);
  log.sep();

  if (!fs.existsSync(SQLITE_PATH)) {
    log.error(`SQLite file not found: ${SQLITE_PATH}`);
    process.exit(1);
  }

  const stat     = fs.statSync(SQLITE_PATH);
  const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `sqlite-backup-${stamp}`;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Copy the database file
  const destDb = join(BACKUP_DIR, `${baseName}.db`);
  fs.copyFileSync(SQLITE_PATH, destDb);
  log.ok(`Database copied → ${destDb}`);

  // Compute checksum on the copy
  const checksum = sha256(destDb);
  log.info(`SHA-256: ${checksum}`);

  // Get row counts
  const rowCounts = await getRowCounts(SQLITE_PATH);

  // Write metadata sidecar
  const meta = {
    timestamp:   new Date().toISOString(),
    source:      SQLITE_PATH,
    backup_file: destDb,
    size_bytes:  stat.size,
    sha256:      checksum,
    row_counts:  rowCounts,
  };

  const destMeta = join(BACKUP_DIR, `${baseName}.meta.json`);
  fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2));
  log.ok(`Metadata written → ${destMeta}`);

  if (rowCounts) {
    for (const [table, count] of Object.entries(rowCounts)) {
      log.info(`  ${table}: ${count} row(s)`);
    }
  }

  log.sep();
  log.ok('SQLite backup complete.');
  log.info(`Restore with: cp "${destDb}" "${SQLITE_PATH}"`);
}

main().catch((err) => {
  log.error('Unexpected error:', err.message);
  process.exit(1);
});
