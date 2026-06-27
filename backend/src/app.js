import express from 'express';
import cors from 'cors';
import compression from 'compression';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import db, { pool, withClient } from './db.js';
import { toCanonical } from './serialization/agentSchema.js';
import { parseJson, parseMarkdown } from './serialization/importAgent.js';
import { getDb, healthCheck as mongoHealth } from './mongo.js';
import { TOOL_CATALOG, TOOL_IDS } from './tools/toolDefinitions.js';
import { validatePreferences, validateWorkspaceData, validateDraftInput, validateSignupInput, validateLoginInput, validateBuiltinSkillInput, validatePersonaCategoryInput, validatePersonaInput, validateAgentDefinition } from './validation.js';
import { hashPassword, verifyPassword } from './auth/crypto.js';
import { signAccessToken } from './auth/token.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';

const app = express();
app.use(cors());
// Compress responses > 1kb — reduces payload size by ~70% for JSON arrays
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '1mb' }));

// --- Request/response logging and metrics -----------------------------------

// In-memory counters for the /api/metrics endpoint
const _metrics = {
  requests: 0,
  errors: 0,
  totalDurationMs: 0,
  startedAt: Date.now(),
};

app.use((req, res, next) => {
  const start = Date.now();
  _metrics.requests++;
  // Keep-Alive lets the k6/browser reuse TCP connections across requests
  res.set('Connection', 'keep-alive');
  res.on('finish', () => {
    const ms = Date.now() - start;
    _metrics.totalDurationMs += ms;
    if (res.statusCode >= 500) _metrics.errors++;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// --- In-memory rate limiter --------------------------------------------------
// 100 requests per IP per minute on MongoDB-backed routes.

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

// Evict stale entries every 5 minutes so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000).unref();

export function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);

  res.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.set('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT_MAX - entry.count)));
  res.set('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}

// Apply rate limiting to all MongoDB-backed and auth routes.
app.use('/api/auth', rateLimit);
app.use('/api/preferences', rateLimit);
app.use('/api/workspace', rateLimit);
app.use('/api/drafts', rateLimit);
app.use('/api/subscriptions', rateLimit);

// --- Tool catalog ---------------------------------------------------------

app.get('/api/tools', (req, res) => {
  const tools = TOOL_IDS.map((id) => ({
    id,
    label: TOOL_CATALOG[id].label,
    kind: TOOL_CATALOG[id].kind,
    description: TOOL_CATALOG[id].anthropicTool?.description || 'Built-in tool.',
  }));
  res.json(tools);
});

// --- Agent import (stateless) ---------------------------------------------

const IMPORT_SIZE_LIMIT = 256 * 1024; // 256 KB

app.post('/api/agents/import', optionalAuth, (req, res) => {
  const { format, content } = req.body ?? {};

  if (format !== 'json' && format !== 'markdown') {
    return res.status(400).json({ error: 'format must be "json" or "markdown"' });
  }
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }
  if (Buffer.byteLength(content, 'utf8') > IMPORT_SIZE_LIMIT) {
    return res.status(400).json({ error: 'Content exceeds the 256 KB size limit' });
  }

  const result = format === 'json' ? parseJson(content) : parseMarkdown(content);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ agent: result.agent, warnings: result.warnings });
});

// --- Agent CRUD ------------------------------------------------------------

// Legacy endpoint kept for back-compat; now scoped to public agents only (private agents
// were never meant to be world-readable — the original "SELECT *" was a security oversight).
// Clients that need subscription flags should migrate to /api/agents/public or /api/agents/mine.
app.get('/api/agents', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM agents WHERE visibility = 'public' ORDER BY updated_at DESC"
    );
    res.json(rows.map(serializeAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public agents only; when authenticated each item carries isSubscribed.
app.get('/api/agents/public', optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      const { rows } = await db.query(
        `SELECT a.*, (s.agent_id IS NOT NULL) AS is_subscribed
         FROM agents a
         LEFT JOIN subscriptions s ON s.agent_id = a.id AND s.user_id = $1
         WHERE a.visibility = 'public'
         ORDER BY a.updated_at DESC`,
        [req.user.userId]
      );
      return res.json(rows.map((r) => ({ ...serializeAgent(r), isSubscribed: Boolean(r.is_subscribed) })));
    }
    const { rows } = await db.query(
      "SELECT * FROM agents WHERE visibility = 'public' ORDER BY updated_at DESC"
    );
    res.json(rows.map(serializeAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Owned agents + subscribed public agents for the authenticated user.
app.get('/api/agents/mine', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT a.*,
              (a.owner_id = $1) AS is_owned,
              (s.agent_id IS NOT NULL) AS is_subscribed
       FROM agents a
       LEFT JOIN subscriptions s ON s.agent_id = a.id AND s.user_id = $1
       WHERE a.owner_id = $1
          OR (a.visibility = 'public' AND s.agent_id IS NOT NULL)
       ORDER BY a.updated_at DESC`,
      [userId]
    );
    res.json(rows.map((r) => ({
      ...serializeAgent(r),
      isOwned: Boolean(r.is_owned),
      isSubscribed: Boolean(r.is_subscribed),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    const agent = rows[0];
    if (agent.visibility !== 'public' && agent.owner_id !== req.user?.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(serializeAgent(agent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pre-flight validation — stateless, no persistence.
app.post('/api/agents/validate', optionalAuth, async (req, res) => {
  const parsed = validateAgentInput(req.body);
  if (parsed.error) {
    return res.json({ errors: [{ code: 'INVALID_INPUT', field: null, message: parsed.error }], warnings: [] });
  }

  let existingNames = [];
  if (req.user) {
    try {
      const { rows } = await db.query('SELECT name FROM agents WHERE owner_id = $1', [req.user.userId]);
      existingNames = rows.map((r) => r.name);
    } catch {
      // non-fatal — skip duplicate-name check
    }
  }

  const { errors, warnings } = validateAgentDefinition(parsed, { existingNames });
  res.json({ errors, warnings });
});

app.post('/api/agents', requireAuth, async (req, res) => {
  const agent = validateAgentInput(req.body);
  if (agent.error) return res.status(400).json({ error: agent.error });

  // Structural validation (no DB context needed).
  const { errors } = validateAgentDefinition(agent);
  if (errors.length > 0) return res.status(400).json({ errors });

  const changeSummary = typeof req.body?.changeSummary === 'string' ? req.body.changeSummary.trim() : '';
  const id = crypto.randomUUID();
  const owner_id = req.user.userId;
  try {
    // Fetch peer names for the duplicate-name warning.
    const { rows: nameRows } = await db.query(
      'SELECT name FROM agents WHERE owner_id = $1',
      [owner_id]
    );
    const existingNames = nameRows.map((r) => r.name);
    const { warnings } = validateAgentDefinition(agent, { existingNames });

    const newRow = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO agents (id, name, persona, system_prompt, model, tools, positions, skills, instructions, visibility, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id,
          agent.name,
          agent.persona,
          agent.systemPrompt,
          agent.model,
          JSON.stringify(agent.tools),
          JSON.stringify(agent.positions),
          JSON.stringify(agent.skills),
          JSON.stringify(agent.instructions),
          agent.visibility,
          owner_id,
        ]
      );
      const row = rows[0];
      const canonical = toCanonical(row);
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
      await client.query(
        `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary)
         VALUES ($1, 1, $2, $3, $4)`,
        [row.id, hash, JSON.stringify(canonical), changeSummary]
      );
      return row;
    });
    res.status(201).json({ ...serializeAgent(newRow), warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/agents/:id', requireAuth, async (req, res) => {
  const agent = validateAgentInput(req.body);
  if (agent.error) return res.status(400).json({ error: agent.error });

  const { errors } = validateAgentDefinition(agent);
  if (errors.length > 0) return res.status(400).json({ errors });

  const changeSummary = typeof req.body?.changeSummary === 'string' ? req.body.changeSummary.trim() : '';

  try {
    // Fetch peer names for the duplicate-name warning (exclude this agent's current name).
    const { rows: nameRows } = await db.query(
      'SELECT name FROM agents WHERE owner_id = $1 AND id != $2',
      [req.user.userId, req.params.id]
    );
    const existingNames = nameRows.map((r) => r.name);
    const { warnings } = validateAgentDefinition(agent, { existingNames });

    const updatedRow = await withClient(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT owner_id FROM agents WHERE id = $1',
        [req.params.id]
      );
      if (!existing[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }
      if (existing[0].owner_id !== req.user.userId) { const e = new Error('Forbidden'); e.statusCode = 403; throw e; }

      const { rows } = await client.query(
        `UPDATE agents
         SET name = $1, persona = $2, system_prompt = $3, model = $4,
             tools = $5, positions = $6, skills = $7, instructions = $8,
             visibility = $9, updated_at = NOW()
         WHERE id = $10
         RETURNING *`,
        [
          agent.name,
          agent.persona,
          agent.systemPrompt,
          agent.model,
          JSON.stringify(agent.tools),
          JSON.stringify(agent.positions),
          JSON.stringify(agent.skills),
          JSON.stringify(agent.instructions),
          agent.visibility,
          req.params.id,
        ]
      );
      const row = rows[0];

      const canonical = toCanonical(row);
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

      const { rows: latest } = await client.query(
        `SELECT canonical_hash, version_no FROM agent_versions
         WHERE agent_id = $1 ORDER BY version_no DESC LIMIT 1`,
        [row.id]
      );

      if (!latest[0] || latest[0].canonical_hash !== hash) {
        const nextNo = latest[0] ? latest[0].version_no + 1 : 1;
        await client.query(
          `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary)
           VALUES ($1, $2, $3, $4, $5)`,
          [row.id, nextNo, hash, JSON.stringify(canonical), changeSummary]
        );
      }

      return row;
    });

    res.json({ ...serializeAgent(updatedRow), warnings });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/agents/:id', requireAuth, async (req, res) => {
  const VALID_VISIBILITY = ['public', 'private'];
  const visibility = typeof req.body?.visibility === 'string' ? req.body.visibility : null;
  if (!visibility || !VALID_VISIBILITY.includes(visibility)) {
    return res.status(400).json({ error: 'visibility must be "public" or "private"' });
  }

  try {
    const { rows: existing } = await db.query(
      'SELECT owner_id FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Agent not found' });
    if (existing[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await db.query(
      `UPDATE agents SET visibility = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [visibility, req.params.id]
    );
    res.json(serializeAgent(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT owner_id FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (rows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    await db.query('DELETE FROM agents WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent version history ------------------------------------------------

app.get('/api/agents/:id/versions', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  try {
    const { rows: agentRows } = await db.query(
      'SELECT owner_id FROM agents WHERE id = $1',
      [agentId]
    );
    if (!agentRows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (agentRows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await db.query(
      `SELECT version_no, change_summary, created_by, created_at
       FROM agent_versions
       WHERE agent_id = $1
       ORDER BY version_no DESC`,
      [agentId]
    );
    res.json(rows.map((r) => ({
      versionNo: r.version_no,
      changeSummary: r.change_summary ?? '',
      createdBy: r.created_by ?? null,
      createdAt: r.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents/:id/versions/:versionNo', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const versionNo = parseInt(req.params.versionNo, 10);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return res.status(400).json({ error: 'versionNo must be a positive integer' });
  }
  try {
    const { rows: agentRows } = await db.query(
      'SELECT owner_id FROM agents WHERE id = $1',
      [agentId]
    );
    if (!agentRows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (agentRows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await db.query(
      `SELECT version_no, snapshot, change_summary, created_by, created_at
       FROM agent_versions
       WHERE agent_id = $1 AND version_no = $2`,
      [agentId, versionNo]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Version not found' });

    res.json({
      versionNo: rows[0].version_no,
      snapshot: rows[0].snapshot,
      changeSummary: rows[0].change_summary ?? '',
      createdBy: rows[0].created_by ?? null,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents/:id/versions/:versionNo/restore', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const versionNo = parseInt(req.params.versionNo, 10);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return res.status(400).json({ error: 'versionNo must be a positive integer' });
  }
  try {
    const updatedRow = await withClient(async (client) => {
      const { rows: agentRows } = await client.query(
        'SELECT owner_id FROM agents WHERE id = $1',
        [agentId]
      );
      if (!agentRows[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }
      if (agentRows[0].owner_id !== req.user.userId) { const e = new Error('Forbidden'); e.statusCode = 403; throw e; }

      const { rows: versionRows } = await client.query(
        'SELECT snapshot FROM agent_versions WHERE agent_id = $1 AND version_no = $2',
        [agentId, versionNo]
      );
      if (!versionRows[0]) { const e = new Error('Version not found'); e.statusCode = 404; throw e; }

      const snap = versionRows[0].snapshot;

      const { rows } = await client.query(
        `UPDATE agents
         SET name = $1, persona = $2, system_prompt = $3, model = $4,
             tools = $5, positions = $6, skills = $7, instructions = $8,
             updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [
          snap.name,
          snap.persona,
          snap.systemPrompt,
          snap.model,
          JSON.stringify(snap.tools ?? []),
          JSON.stringify(snap.positions ?? {}),
          JSON.stringify(snap.skills ?? []),
          JSON.stringify(snap.instructions ?? []),
          agentId,
        ]
      );
      const row = rows[0];

      const canonical = toCanonical(row);
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');

      const { rows: latest } = await client.query(
        'SELECT version_no FROM agent_versions WHERE agent_id = $1 ORDER BY version_no DESC LIMIT 1',
        [agentId]
      );
      const nextNo = latest[0] ? latest[0].version_no + 1 : 1;

      await client.query(
        `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          agentId,
          nextNo,
          hash,
          JSON.stringify(canonical),
          `Restored from v${versionNo}`,
          req.user.userId,
        ]
      );

      return row;
    });

    res.json(serializeAgent(updatedRow));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Agent subscribe / unsubscribe ----------------------------------------
// REST sugar over the subscriptions table, scoped to an agent URL.
// Only public agents are subscribable; subscribing to your own agent is allowed.
// Subscribe is idempotent (ON CONFLICT DO NOTHING → 200 on duplicate).
// Unsubscribe returns 404 when the row doesn't exist.

app.post('/api/agents/:id/subscribe', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  try {
    const { rows } = await db.query('SELECT visibility FROM agents WHERE id = $1', [agentId]);
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (rows[0].visibility !== 'public') {
      return res.status(403).json({ error: 'Cannot subscribe to a private agent' });
    }
    await db.query(
      'INSERT INTO subscriptions (user_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, agentId]
    );
    res.status(200).json({ userId, agentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id/subscribe', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  try {
    const { rowCount } = await db.query(
      'DELETE FROM subscriptions WHERE user_id = $1 AND agent_id = $2',
      [userId, agentId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Subscription not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Custom Skills CRUD ---------------------------------------------------

// Legacy endpoint — returns public skills only (no auth required).
app.get('/api/skills', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM custom_skills WHERE visibility = 'public' ORDER BY created_at ASC"
    );
    res.json(rows.map(serializeSkill));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public skills with optional isOwned flag when authenticated.
app.get('/api/skills/public', optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      const { rows } = await db.query(
        `SELECT *, (owner_id = $1) AS is_owned
         FROM custom_skills
         WHERE visibility = 'public'
         ORDER BY created_at ASC`,
        [req.user.userId]
      );
      return res.json(rows.map((r) => ({ ...serializeSkill(r), isOwned: Boolean(r.is_owned) })));
    }
    const { rows } = await db.query(
      "SELECT * FROM custom_skills WHERE visibility = 'public' ORDER BY created_at ASC"
    );
    res.json(rows.map(serializeSkill));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All skills owned by the authenticated user (public and private).
app.get('/api/skills/mine', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      'SELECT * FROM custom_skills WHERE owner_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    res.json(rows.map((r) => ({ ...serializeSkill(r), isOwned: true })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills', requireAuth, async (req, res) => {
  const skill = validateSkillInput(req.body);
  if (skill.error) return res.status(400).json({ error: skill.error });

  const id = crypto.randomUUID();
  const owner_id = req.user.userId;
  try {
    const { rows } = await db.query(
      'INSERT INTO custom_skills (id, label, color, description, instruction, visibility, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [id, skill.label, skill.color, skill.description, skill.instruction, skill.visibility, owner_id]
    );
    res.status(201).json({ ...serializeSkill(rows[0]), isOwned: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/skills/:id', requireAuth, async (req, res) => {
  const skill = validateSkillInput(req.body);
  if (skill.error) return res.status(400).json({ error: skill.error });

  try {
    const { rows: existing } = await db.query(
      'SELECT owner_id FROM custom_skills WHERE id = $1',
      [req.params.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Skill not found' });
    if (existing[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await db.query(
      `UPDATE custom_skills
       SET label = $1, color = $2, description = $3, instruction = $4, visibility = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [skill.label, skill.color, skill.description, skill.instruction, skill.visibility, req.params.id]
    );
    res.json({ ...serializeSkill(rows[0]), isOwned: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/skills/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT owner_id FROM custom_skills WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Skill not found' });
    if (rows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });

    await db.query('DELETE FROM custom_skills WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent Templates (MongoDB) --------------------------------------------
// Read-only public endpoint; templates are admin-managed via the DB directly.

app.get('/api/templates', async (req, res) => {
  try {
    const templates = await getDb()
      .collection('agent_templates')
      .find({})
      .sort({ createdAt: 1 })
      .toArray();
    res.json(templates.map(serializeTemplateList));
  } catch (err) {
    res.status(503).json({ error: 'Template service unavailable', detail: err.message });
  }
});

app.get('/api/templates/:id', async (req, res) => {
  try {
    const doc = await getDb()
      .collection('agent_templates')
      .findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: 'Template not found' });
    res.json(serializeTemplate(doc));
  } catch (err) {
    res.status(503).json({ error: 'Template service unavailable', detail: err.message });
  }
});

// --- Builtin Skills (MongoDB) ---------------------------------------------
// GET is public; write operations require authentication.

app.get('/api/builtin-skills', async (req, res) => {
  try {
    const skills = await getDb()
      .collection('builtin_skills')
      .find({})
      .sort({ createdAt: 1 })
      .toArray();
    res.json(skills.map(serializeBuiltinSkill));
  } catch (err) {
    res.status(503).json({ error: 'Skill service unavailable', detail: err.message });
  }
});

app.post('/api/builtin-skills', requireAuth, async (req, res) => {
  const validation = validateBuiltinSkillInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const now = new Date();
  const doc = { id: crypto.randomUUID(), ...validation.data, createdAt: now, updatedAt: now };
  try {
    const result = await getDb().collection('builtin_skills').insertOne(doc);
    const inserted = await getDb().collection('builtin_skills').findOne({ _id: result.insertedId });
    res.status(201).json(serializeBuiltinSkill(inserted));
  } catch (err) {
    res.status(503).json({ error: 'Skill service unavailable', detail: err.message });
  }
});

app.put('/api/builtin-skills/:id', requireAuth, async (req, res) => {
  const validation = validateBuiltinSkillInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    const updated = await getDb()
      .collection('builtin_skills')
      .findOneAndUpdate(
        { id: req.params.id },
        { $set: { ...validation.data, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Builtin skill not found' });
    res.json(serializeBuiltinSkill(updated));
  } catch (err) {
    res.status(503).json({ error: 'Skill service unavailable', detail: err.message });
  }
});

app.delete('/api/builtin-skills/:id', requireAuth, async (req, res) => {
  try {
    const { deletedCount } = await getDb()
      .collection('builtin_skills')
      .deleteOne({ id: req.params.id });
    if (deletedCount === 0) return res.status(404).json({ error: 'Builtin skill not found' });
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ error: 'Skill service unavailable', detail: err.message });
  }
});

// --- Persona Categories (MongoDB) -----------------------------------------
// GET is public; write operations require authentication.
// Personas are embedded documents within their parent category.

app.get('/api/personas', async (req, res) => {
  try {
    const categories = await getDb()
      .collection('persona_categories')
      .find({})
      .sort({ createdAt: 1 })
      .toArray();
    res.json(categories.map(serializePersonaCategory));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.post('/api/personas', requireAuth, async (req, res) => {
  const validation = validatePersonaCategoryInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const now = new Date();
  const doc = { id: crypto.randomUUID(), ...validation.data, personas: [], createdAt: now, updatedAt: now };
  try {
    const result = await getDb().collection('persona_categories').insertOne(doc);
    const inserted = await getDb().collection('persona_categories').findOne({ _id: result.insertedId });
    res.status(201).json(serializePersonaCategory(inserted));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.put('/api/personas/:categoryId', requireAuth, async (req, res) => {
  const validation = validatePersonaCategoryInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    const updated = await getDb()
      .collection('persona_categories')
      .findOneAndUpdate(
        { id: req.params.categoryId },
        { $set: { label: validation.data.label, color: validation.data.color, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Persona category not found' });
    res.json(serializePersonaCategory(updated));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.delete('/api/personas/:categoryId', requireAuth, async (req, res) => {
  try {
    const { deletedCount } = await getDb()
      .collection('persona_categories')
      .deleteOne({ id: req.params.categoryId });
    if (deletedCount === 0) return res.status(404).json({ error: 'Persona category not found' });
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.post('/api/personas/:categoryId/personas', requireAuth, async (req, res) => {
  const validation = validatePersonaInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const persona = { id: crypto.randomUUID(), ...validation.data };
  try {
    const updated = await getDb()
      .collection('persona_categories')
      .findOneAndUpdate(
        { id: req.params.categoryId },
        { $push: { personas: persona }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Persona category not found' });
    res.status(201).json(serializePersonaCategory(updated));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.put('/api/personas/:categoryId/personas/:personaId', requireAuth, async (req, res) => {
  const validation = validatePersonaInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    const updated = await getDb()
      .collection('persona_categories')
      .findOneAndUpdate(
        { id: req.params.categoryId, 'personas.id': req.params.personaId },
        {
          $set: {
            'personas.$.name': validation.data.name,
            'personas.$.tagline': validation.data.tagline,
            'personas.$.persona': validation.data.persona,
            'personas.$.systemPrompt': validation.data.systemPrompt,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Persona not found' });
    res.json(serializePersonaCategory(updated));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

app.delete('/api/personas/:categoryId/personas/:personaId', requireAuth, async (req, res) => {
  try {
    const updated = await getDb()
      .collection('persona_categories')
      .findOneAndUpdate(
        { id: req.params.categoryId },
        { $pull: { personas: { id: req.params.personaId } }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Persona category not found' });
    res.json(serializePersonaCategory(updated));
  } catch (err) {
    res.status(503).json({ error: 'Persona service unavailable', detail: err.message });
  }
});

// --- Health checks --------------------------------------------------------

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('/api/health/mongo', async (req, res) => {
  const result = await mongoHealth();
  res.status(result.ok ? 200 : 503).json(result);
});

// --- Performance metrics ---------------------------------------------------
// Exposes runtime stats for dashboards and alerting.
// Includes PostgreSQL pool state and in-process request counters.

app.get('/api/metrics', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - _metrics.startedAt) / 1000);
  const avgDurationMs = _metrics.requests > 0
    ? Math.round(_metrics.totalDurationMs / _metrics.requests)
    : 0;

  res.json({
    uptime_seconds: uptimeSec,
    requests_total: _metrics.requests,
    errors_total: _metrics.errors,
    error_rate: _metrics.requests > 0
      ? (_metrics.errors / _metrics.requests).toFixed(4)
      : '0.0000',
    avg_duration_ms: avgDurationMs,
    // PostgreSQL connection pool state
    pg_pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
    rate_limiter: {
      tracked_ips: rateLimitMap.size,
    },
  });
});

// --- User Preferences (MongoDB) -------------------------------------------

app.get('/api/preferences/:userId', async (req, res) => {
  try {
    const doc = await getDb()
      .collection('user_preferences')
      .findOne({ userId: req.params.userId });
    res.json(doc?.preferences ?? {});
  } catch (err) {
    res.status(503).json({ error: 'Preferences service unavailable', detail: err.message });
  }
});

app.post('/api/preferences/:userId', async (req, res) => {
  const validation = validatePreferences(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { userId } = req.params;
  const now = new Date();
  try {
    // findOneAndUpdate with returnDocument:'after' avoids a separate findOne round-trip
    const doc = await getDb()
      .collection('user_preferences')
      .findOneAndUpdate(
        { userId },
        {
          $set: { preferences: validation.data, updatedAt: now },
          $setOnInsert: { userId, createdAt: now },
        },
        { upsert: true, returnDocument: 'after' }
      );
    res.json({
      userId: doc.userId,
      preferences: doc.preferences,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    res.status(503).json({ error: 'Preferences service unavailable', detail: err.message });
  }
});

// --- Workspace State (MongoDB) --------------------------------------------

app.get('/api/workspace/:workspaceId', async (req, res) => {
  try {
    const doc = await getDb()
      .collection('workspace_state')
      .findOne({ workspaceId: req.params.workspaceId });
    res.json(doc?.data ?? {});
  } catch (err) {
    res.status(503).json({ error: 'Workspace service unavailable', detail: err.message });
  }
});

app.post('/api/workspace/:workspaceId', async (req, res) => {
  const validation = validateWorkspaceData(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { workspaceId } = req.params;
  const now = new Date();
  try {
    const doc = await getDb()
      .collection('workspace_state')
      .findOneAndUpdate(
        { workspaceId },
        {
          $set: { data: validation.data, updatedAt: now },
          $setOnInsert: { workspaceId, createdAt: now },
        },
        { upsert: true, returnDocument: 'after' }
      );
    res.json({
      workspaceId: doc.workspaceId,
      data: doc.data,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  } catch (err) {
    res.status(503).json({ error: 'Workspace service unavailable', detail: err.message });
  }
});

// --- Draft Agents (MongoDB) -----------------------------------------------

app.get('/api/drafts/:workspaceId', async (req, res) => {
  try {
    const drafts = await getDb()
      .collection('draft_agents')
      .find({ workspaceId: req.params.workspaceId })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(drafts.map(serializeDraft));
  } catch (err) {
    res.status(503).json({ error: 'Draft service unavailable', detail: err.message });
  }
});

app.post('/api/drafts/:workspaceId', async (req, res) => {
  const validation = validateDraftInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { workspaceId } = req.params;
  const now = new Date();
  try {
    const result = await getDb().collection('draft_agents').insertOne({
      workspaceId,
      agentData: validation.data.agentData,
      createdAt: now,
      updatedAt: now,
    });
    const doc = await getDb().collection('draft_agents').findOne({ _id: result.insertedId });
    res.status(201).json(serializeDraft(doc));
  } catch (err) {
    res.status(503).json({ error: 'Draft service unavailable', detail: err.message });
  }
});

app.delete('/api/drafts/:draftId', async (req, res) => {
  let objectId;
  try {
    objectId = new ObjectId(req.params.draftId);
  } catch {
    return res.status(400).json({ error: 'Invalid draft ID format' });
  }
  try {
    const { deletedCount } = await getDb()
      .collection('draft_agents')
      .deleteOne({ _id: objectId });
    if (deletedCount === 0) return res.status(404).json({ error: 'Draft not found' });
    res.status(204).end();
  } catch (err) {
    res.status(503).json({ error: 'Draft service unavailable', detail: err.message });
  }
});

// --- Subscriptions --------------------------------------------------------
// Reference semantics: each row is a pointer from a user to a public agent.
// The agent is never copied; subscribers always see the live version.

app.post('/api/subscriptions', requireAuth, async (req, res) => {
  const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim() : '';
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  const userId = req.user.userId;
  try {
    await db.query(
      'INSERT INTO subscriptions (user_id, agent_id) VALUES ($1, $2)',
      [userId, agentId]
    );
    res.status(201).json({ userId, agentId });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already subscribed to this agent' });
    if (err.code === '23503') return res.status(404).json({ error: 'Agent not found' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subscriptions/:agentId', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rowCount } = await db.query(
      'DELETE FROM subscriptions WHERE user_id = $1 AND agent_id = $2',
      [userId, req.params.agentId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Subscription not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscriptions', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT a.*, s.created_at AS subscribed_at
       FROM subscriptions s
       JOIN agents a ON a.id = s.agent_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );
    res.json(rows.map(serializeSubscribedAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscriptions/:agentId', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM subscriptions WHERE user_id = $1 AND agent_id = $2',
      [userId, req.params.agentId]
    );
    res.json({ subscribed: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Auth ----------------------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
  const validation = validateSignupInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { email, password, display_name } = validation.data;
  const id = crypto.randomUUID();
  const password_hash = await hashPassword(password);

  try {
    const { rows } = await db.query(
      `INSERT INTO users (id, email, password_hash, display_name, auth_provider, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'local', NOW(), NOW())
       RETURNING *`,
      [id, email, password_hash, display_name || null]
    );
    const token = signAccessToken(rows[0].id);
    res.status(201).json({ token, user: serializeUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email address is already registered' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const validation = validateLoginInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { email, password } = validation.data;

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const valid = user && await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signAccessToken(user.id);
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    res.json(serializeUser(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Helpers -------------------------------------------------------------

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    authProvider: row.auth_provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    systemPrompt: row.system_prompt,
    model: row.model,
    tools: row.tools ?? [],
    positions: row.positions ?? {},
    skills: row.skills ?? [],
    instructions: row.instructions ?? [],
    ownerId: row.owner_id ?? null,
    visibility: row.visibility ?? 'private',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeSkill(row) {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    description: row.description,
    instruction: row.instruction,
    ownerId: row.owner_id ?? null,
    visibility: row.visibility ?? 'private',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeBuiltinSkill(doc) {
  return {
    id: doc.id,
    label: doc.label,
    color: doc.color,
    description: doc.description || '',
    instruction: doc.instruction,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializePersonaCategory(doc) {
  return {
    id: doc.id,
    label: doc.label,
    color: doc.color,
    personas: (doc.personas || []).map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline || '',
      persona: p.persona || '',
      systemPrompt: p.systemPrompt || '',
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeSubscribedAgent(row) {
  return { ...serializeAgent(row), subscribedAt: row.subscribed_at };
}

function serializeDraft(doc) {
  return {
    id: doc._id.toString(),
    workspaceId: doc.workspaceId,
    agentData: doc.agentData,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeTemplateList(doc) {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description || '',
    category: doc.category || '',
    icon: doc.icon || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeTemplate(doc) {
  return {
    ...serializeTemplateList(doc),
    definition: doc.definition || {},
  };
}

export function validateAgentInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Agent name is required' };

  const tools = Array.isArray(body.tools) ? body.tools.filter((t) => TOOL_CATALOG[t]) : [];

  const VALID_VISIBILITY = ['public', 'private'];
  const visibility =
    typeof body.visibility === 'string' && VALID_VISIBILITY.includes(body.visibility)
      ? body.visibility
      : 'private';

  return {
    name,
    persona: typeof body.persona === 'string' ? body.persona : '',
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : '',
    model: typeof body.model === 'string' && body.model ? body.model : '',
    tools,
    positions: typeof body.positions === 'object' && body.positions ? body.positions : {},
    skills: Array.isArray(body.skills) ? body.skills.filter((s) => typeof s === 'string') : [],
    instructions: Array.isArray(body.instructions) ? body.instructions.filter((s) => typeof s === 'string') : [],
    visibility,
  };
}

export function validateSkillInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'Skill label is required' };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) return { error: 'Skill instruction is required' };

  const VALID_VISIBILITY = ['public', 'private'];
  const visibility =
    typeof body.visibility === 'string' && VALID_VISIBILITY.includes(body.visibility)
      ? body.visibility
      : 'private';

  return {
    label,
    color: typeof body.color === 'string' && body.color ? body.color : '#6366f1',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    instruction,
    visibility,
  };
}

export { app };
