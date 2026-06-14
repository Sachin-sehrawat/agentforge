#!/usr/bin/env node
/**
 * SQLite → PostgreSQL Migration Script
 *
 * Reads all data from an existing SQLite agents.db and inserts it into the
 * PostgreSQL database configured via environment variables.
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-pg.js [options]
 *
 * Options:
 *   --sqlite-path <path>   Path to the SQLite file   (default: agents.db)
 *   --backup-dir  <path>   Directory for PG backup    (default: ./backups)
 *   --dry-run              Validate and print without writing to PostgreSQL
 *   --help, -h             Show this help message
 *
 * Exit codes:
 *   0  success
 *   1  error / validation failure
 */

import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getArg(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : null;
}

const DRY_RUN     = argv.includes('--dry-run');
const SHOW_HELP   = argv.includes('--help') || argv.includes('-h');
const SQLITE_PATH = resolve(ROOT, getArg('--sqlite-path') ?? 'agents.db');
const BACKUP_DIR  = resolve(ROOT, getArg('--backup-dir')  ?? 'backups');

if (SHOW_HELP) {
  console.log(`
SQLite → PostgreSQL Migration

Usage:
  node scripts/migrate-sqlite-to-pg.js [options]

Options:
  --sqlite-path <path>   Path to the SQLite file   (default: agents.db)
  --backup-dir  <path>   Directory for PG backup    (default: ./backups)
  --dry-run              Validate and print without writing to PostgreSQL
  --help, -h             Show this message

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
  debug: (...a) => console.log('[DEBUG]', ...a),
  sep:   ()     => console.log('─'.repeat(60)),
};

// ─── UUID Helpers ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(str) {
  return typeof str === 'string' && UUID_RE.test(str);
}

function toUuid(raw) {
  if (isValidUuid(raw)) return raw.toLowerCase();
  const generated = crypto.randomUUID();
  log.warn(`Non-UUID id "${raw}" → generated "${generated}"`);
  return generated;
}

// ─── Data Transformation ──────────────────────────────────────────────────────

function parseJson(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    log.warn(`Failed to parse JSON field, using fallback. Value: ${String(raw).slice(0, 80)}`);
    return fallback;
  }
}

/**
 * SQLite stores timestamps as "YYYY-MM-DD HH:MM:SS" (UTC via datetime('now')).
 * Convert to a proper ISO-8601 string that PostgreSQL TIMESTAMPTZ accepts.
 */
function toTimestamp(raw) {
  if (!raw) return new Date().toISOString();
  // datetime('now') produces "YYYY-MM-DD HH:MM:SS" — treat as UTC
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function transformAgent(row, idMap) {
  const newId = toUuid(row.id);
  if (row.id !== newId) idMap.agents[row.id] = newId;

  return {
    id:            newId,
    name:          row.name ?? '',
    persona:       row.persona        ?? '',
    system_prompt: row.system_prompt  ?? '',
    model:         row.model          || 'claude-sonnet-4-6',
    tools:         parseJson(row.tools,        []),
    positions:     parseJson(row.positions,    {}),
    skills:        parseJson(row.skills,       []),
    instructions:  parseJson(row.instructions, []),
    created_at:    toTimestamp(row.created_at),
    updated_at:    toTimestamp(row.updated_at),
  };
}

function transformSkill(row, idMap) {
  const newId = toUuid(row.id);
  if (row.id !== newId) idMap.skills[row.id] = newId;

  return {
    id:          newId,
    label:       row.label       ?? '',
    color:       row.color       ?? '#6366f1',
    description: row.description ?? '',
    instruction: row.instruction ?? '',
    created_at:  toTimestamp(row.created_at),
    updated_at:  toTimestamp(row.updated_at),
  };
}

// ─── SQLite Reader ────────────────────────────────────────────────────────────

async function openSqlite(filePath) {
  let initSqlJs;
  try {
    const mod = await import('sql.js');
    initSqlJs = mod.default ?? mod;
  } catch {
    log.error('sql.js is not installed.');
    log.error('Run: npm install --save-dev sql.js');
    process.exit(1);
  }

  const SQL    = await initSqlJs();
  const buffer = fs.readFileSync(filePath);
  return new SQL.Database(buffer);
}

/**
 * sql.js exec() returns [{ columns: [...], values: [[...], ...] }].
 * Convert that to an array of plain objects.
 */
function readSqliteTable(db, table) {
  try {
    const results = db.exec(`SELECT * FROM ${table}`);
    if (!results.length) return [];
    const { columns, values } = results[0];
    return values.map((row) =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]]))
    );
  } catch (err) {
    if (err.message.includes('no such table')) {
      log.warn(`Table "${table}" not found in SQLite — skipping`);
      return [];
    }
    throw err;
  }
}

// ─── PostgreSQL Helpers ───────────────────────────────────────────────────────

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

async function pgCount(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return parseInt(rows[0].n, 10);
}

// ─── Backup ───────────────────────────────────────────────────────────────────

async function createPgBackup(client) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const [{ rows: agents }, { rows: skills }] = await Promise.all([
    client.query('SELECT * FROM agents'),
    client.query('SELECT * FROM custom_skills'),
  ]);

  const stamp    = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = join(BACKUP_DIR, `pg-backup-${stamp}.json`);

  fs.writeFileSync(filename, JSON.stringify({ agents, custom_skills: skills }, null, 2));
  log.ok(`PostgreSQL backup written → ${filename}`);
  return filename;
}

// ─── Insert Helpers ───────────────────────────────────────────────────────────

async function insertAgents(client, agents) {
  let inserted = 0;
  let skipped  = 0;

  for (const a of agents) {
    const result = await client.query(
      `INSERT INTO agents
         (id, name, persona, system_prompt, model, tools, positions, skills, instructions, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [
        a.id, a.name, a.persona, a.system_prompt, a.model,
        JSON.stringify(a.tools),
        JSON.stringify(a.positions),
        JSON.stringify(a.skills),
        JSON.stringify(a.instructions),
        a.created_at,
        a.updated_at,
      ]
    );
    if (result.rowCount > 0) {
      inserted++;
      log.debug(`  agent inserted: ${a.id} (${a.name})`);
    } else {
      skipped++;
      log.warn(`  agent skipped (conflict): ${a.id} (${a.name})`);
    }
  }

  return { inserted, skipped };
}

async function insertSkills(client, skills) {
  let inserted = 0;
  let skipped  = 0;

  for (const s of skills) {
    const result = await client.query(
      `INSERT INTO custom_skills
         (id, label, color, description, instruction, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.label, s.color, s.description, s.instruction, s.created_at, s.updated_at]
    );
    if (result.rowCount > 0) {
      inserted++;
      log.debug(`  skill inserted: ${s.id} (${s.label})`);
    } else {
      skipped++;
      log.warn(`  skill skipped (conflict): ${s.id} (${s.label})`);
    }
  }

  return { inserted, skipped };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateTransformed(agents, skills) {
  const errors = [];

  for (const a of agents) {
    if (!a.id)   errors.push(`Agent missing id (name: ${a.name})`);
    if (!a.name) errors.push(`Agent missing name (id: ${a.id})`);
    if (!Array.isArray(a.tools))       errors.push(`Agent ${a.id}: tools is not an array`);
    if (!Array.isArray(a.skills))      errors.push(`Agent ${a.id}: skills is not an array`);
    if (!Array.isArray(a.instructions))errors.push(`Agent ${a.id}: instructions is not an array`);
    if (typeof a.positions !== 'object' || Array.isArray(a.positions))
      errors.push(`Agent ${a.id}: positions is not an object`);
  }

  for (const s of skills) {
    if (!s.id)    errors.push(`Skill missing id (label: ${s.label})`);
    if (!s.label) errors.push(`Skill missing label (id: ${s.id})`);
  }

  return errors;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log.sep();
  log.info('AgentForge: SQLite → PostgreSQL Migration');
  log.info(`Mode      : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  log.info(`SQLite    : ${SQLITE_PATH}`);
  log.info(`Backup dir: ${BACKUP_DIR}`);
  log.sep();

  // 1. Verify SQLite file exists
  if (!fs.existsSync(SQLITE_PATH)) {
    log.error(`SQLite file not found: ${SQLITE_PATH}`);
    process.exit(1);
  }
  log.ok(`SQLite file found (${(fs.statSync(SQLITE_PATH).size / 1024).toFixed(1)} KB)`);

  // 2. Open SQLite and read source data
  const sqliteDb  = await openSqlite(SQLITE_PATH);
  const rawAgents = readSqliteTable(sqliteDb, 'agents');
  const rawSkills = readSqliteTable(sqliteDb, 'custom_skills');
  // Close explicitly before any async work to avoid sql.js WASM shutdown assertion
  sqliteDb.close();

  log.info(`SQLite agents     : ${rawAgents.length}`);
  log.info(`SQLite skills     : ${rawSkills.length}`);
  log.sep();

  if (rawAgents.length === 0 && rawSkills.length === 0) {
    log.warn('Source database is empty — nothing to migrate.');
    process.exit(0);
  }

  // 3. Transform data
  const idMap  = { agents: {}, skills: {} };
  const agents = rawAgents.map((r) => transformAgent(r, idMap));
  const skills = rawSkills.map((r) => transformSkill(r, idMap));

  // 4. Validate transformed data
  const validationErrors = validateTransformed(agents, skills);
  if (validationErrors.length > 0) {
    log.error('Validation errors in transformed data:');
    validationErrors.forEach((e) => log.error(' •', e));
    process.exit(1);
  }
  log.ok('Transformation validation passed');

  if (idMap.agents && Object.keys(idMap.agents).length > 0) {
    log.warn('Some agent IDs were regenerated (non-UUID source IDs):');
    for (const [old, neo] of Object.entries(idMap.agents)) {
      log.warn(`  ${old} → ${neo}`);
    }
  }
  if (idMap.skills && Object.keys(idMap.skills).length > 0) {
    log.warn('Some skill IDs were regenerated (non-UUID source IDs):');
    for (const [old, neo] of Object.entries(idMap.skills)) {
      log.warn(`  ${old} → ${neo}`);
    }
    // Update skill references inside agents.skills arrays
    for (const a of agents) {
      a.skills = a.skills.map((ref) => idMap.skills[ref] ?? ref);
    }
    log.info('Agent skill references updated to match new skill IDs');
  }

  // 5. Dry-run: print and exit
  if (DRY_RUN) {
    log.sep();
    log.info('DRY RUN — transformed records (not written):');
    log.info('');
    log.info('=== AGENTS ===');
    for (const a of agents) {
      console.log(JSON.stringify(a, null, 2));
    }
    log.info('');
    log.info('=== CUSTOM SKILLS ===');
    for (const s of skills) {
      console.log(JSON.stringify(s, null, 2));
    }
    log.sep();
    log.ok(`Dry run complete. Would migrate ${agents.length} agent(s) and ${skills.length} skill(s).`);
    process.exit(0);
  }

  // 6. Connect to PostgreSQL
  const pool   = buildPgPool();
  const client = await pool.connect();

  try {
    // 7. Create backup of current PostgreSQL data
    await createPgBackup(client);

    // 8. Pre-migration counts
    const preCounts = {
      agents: await pgCount(client, 'agents'),
      skills: await pgCount(client, 'custom_skills'),
    };
    log.info(`Pre-migration PG agents : ${preCounts.agents}`);
    log.info(`Pre-migration PG skills : ${preCounts.skills}`);
    log.sep();

    // 9. Migrate inside a transaction
    await client.query('BEGIN');

    log.info('Inserting agents…');
    const agentResult = await insertAgents(client, agents);

    log.info('Inserting custom_skills…');
    const skillResult = await insertSkills(client, skills);

    await client.query('COMMIT');
    log.ok('Transaction committed');
    log.sep();

    // 10. Post-migration validation
    const postCounts = {
      agents: await pgCount(client, 'agents'),
      skills: await pgCount(client, 'custom_skills'),
    };

    log.info('=== Migration Summary ===');
    log.info(`Agents  — source: ${rawAgents.length}, inserted: ${agentResult.inserted}, skipped: ${agentResult.skipped}, PG total: ${postCounts.agents}`);
    log.info(`Skills  — source: ${rawSkills.length}, inserted: ${skillResult.inserted}, skipped: ${skillResult.skipped}, PG total: ${postCounts.skills}`);

    const expectedAgents = preCounts.agents + agentResult.inserted;
    const expectedSkills = preCounts.skills + skillResult.inserted;

    if (postCounts.agents !== expectedAgents) {
      log.error(`Agent count mismatch: expected ${expectedAgents}, got ${postCounts.agents}`);
      process.exit(1);
    }
    if (postCounts.skills !== expectedSkills) {
      log.error(`Skill count mismatch: expected ${expectedSkills}, got ${postCounts.skills}`);
      process.exit(1);
    }

    log.sep();
    log.ok('Row count validation passed');
    log.ok('Migration complete!');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('Migration failed — transaction rolled back');
    log.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  log.error('Unexpected error:', err.message);
  process.exit(1);
});
