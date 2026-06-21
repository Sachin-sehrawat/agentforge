#!/usr/bin/env node
/**
 * MongoDB Backup Script
 *
 * Exports all collections from the MongoDB database to a single timestamped
 * JSON file, organized by collection name with document counts.
 *
 * Usage:
 *   node scripts/backup-mongodb.js [options]
 *
 * Options:
 *   --backup-dir <path>   Destination directory   (default: ./backups/mongodb)
 *   --help, -h            Show this help message
 *
 * Exit codes:
 *   0  success
 *   1  error
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

const SHOW_HELP  = argv.includes('--help') || argv.includes('-h');
const BACKUP_DIR = resolve(ROOT, getArg('--backup-dir') ?? join('backups', 'mongodb'));

if (SHOW_HELP) {
  console.log(`
MongoDB Backup Script

Usage:
  node scripts/backup-mongodb.js [options]

Options:
  --backup-dir <path>   Destination directory   (default: ./backups/mongodb)
  --help, -h            Show this message

Environment variables (or .env file):
  MONGO_URI   Full MongoDB connection URI (required)
              e.g. mongodb://admin:pass@localhost:27017/agentbuilder?authSource=admin
  MONGO_DB    Database name (default: agentbuilder, overridden by URI db if present)
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.sep();
  log.info('AgentForge: MongoDB Backup');
  log.info(`Backup dir: ${BACKUP_DIR}`);
  log.sep();

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    log.error('MONGO_URI environment variable is not set.');
    log.error('Set it in backend/.env or export it before running this script.');
    process.exit(1);
  }

  const dbName = process.env.MONGO_DB ?? 'agentbuilder';

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });

  try {
    await client.connect();
    log.ok('Connected to MongoDB');

    const db          = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const collNames   = collections.map((c) => c.name).sort();

    log.info(`Collections: ${collNames.join(', ') || '(none)'}`);
    log.sep();

    const snapshot  = {};
    const docCounts = {};

    for (const name of collNames) {
      const docs        = await db.collection(name).find({}).toArray();
      snapshot[name]    = docs;
      docCounts[name]   = docs.length;
      log.info(`  ${name}: ${docs.length} document(s) exported`);
    }

    const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = join(BACKUP_DIR, `mongo-backup-${stamp}.json`);

    const output = {
      metadata: {
        timestamp:   new Date().toISOString(),
        database:    dbName,
        collections: collNames,
        doc_counts:  docCounts,
      },
      data: snapshot,
    };

    fs.writeFileSync(filename, JSON.stringify(output, null, 2));

    log.sep();
    log.ok(`Backup written → ${filename}`);
    log.ok('MongoDB backup complete.');
    log.info(`Restore hint: node scripts/rollback-migration.js --mongo-backup "${filename}"`);

  } finally {
    await client.close();
  }
}

main().catch((err) => {
  log.error('Unexpected error:', err.message);
  process.exit(1);
});
