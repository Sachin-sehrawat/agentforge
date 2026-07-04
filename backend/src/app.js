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
import { validatePreferences, validateWorkspaceData, validateDraftInput, validateSignupInput, validateLoginInput, validateBuiltinSkillInput, validatePersonaCategoryInput, validatePersonaInput, validateAgentDefinition, validateTemplateInput, validateRatingInput, validateCategoryInput } from './validation.js';
import { hashPassword, verifyPassword } from './auth/crypto.js';
import { signAccessToken } from './auth/token.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';
import { writeAudit } from './audit.js';

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

// --- Event log helper -------------------------------------------------------
// Fire-and-forget: failures are logged but never bubble up to callers.

function emitEvent(agentId, actorId, type, meta) {
  db.query(
    'INSERT INTO agent_events (agent_id, actor_id, type, meta) VALUES ($1, $2, $3, $4)',
    [agentId, actorId ?? null, type, meta ? JSON.stringify(meta) : null]
  ).catch((err) => {
    console.error(`[event] failed to emit ${type} for agent ${agentId}:`, err.message);
  });
}

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

// --- Bulk operations -------------------------------------------------------

const BULK_LIMIT = 100;

// Generate minimal Markdown for an agent row using server-side tool catalog.
// Skills and instructions are stored as opaque IDs; they are omitted from the
// Markdown output (same limitation as parseMarkdown on re-import).
function agentToMarkdown(row) {
  const toolLines = (row.tools ?? []).length
    ? (row.tools ?? []).map((id) => {
        const meta = TOOL_CATALOG[id];
        return `- **${meta ? meta.label : id}**`;
      }).join('\n')
    : '_No tools added._';

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `# ${row.name || 'Untitled Agent'}

${row.persona ? `> ${row.persona}\n` : ''}## System Prompt

${row.system_prompt || '_No system prompt defined._'}

## Capabilities

${toolLines}

---
_Created with AgentForge · ${date}_
`;
}

app.post('/api/agents/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (ids.length > BULK_LIMIT) {
    return res.status(400).json({ error: `Batch size exceeds the limit of ${BULK_LIMIT}` });
  }

  const callerId = req.user.userId;

  try {
    const result = await withClient(async (client) => {
      const { rows } = await client.query(
        'SELECT id FROM agents WHERE id = ANY($1::uuid[]) AND owner_id = $2',
        [ids, callerId]
      );
      const ownedIds = rows.map((r) => r.id);
      const skipped = ids.filter((id) => !ownedIds.includes(id));

      if (ownedIds.length > 0) {
        await client.query('DELETE FROM agents WHERE id = ANY($1::uuid[])', [ownedIds]);
      }

      return { deleted: ownedIds, skipped };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents/bulk-export', requireAuth, async (req, res) => {
  const { ids, format } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (ids.length > BULK_LIMIT) {
    return res.status(400).json({ error: `Batch size exceeds the limit of ${BULK_LIMIT}` });
  }
  if (format !== 'json' && format !== 'markdown') {
    return res.status(400).json({ error: 'format must be "json" or "markdown"' });
  }

  const callerId = req.user.userId;

  try {
    const { rows } = await db.query(
      'SELECT * FROM agents WHERE id = ANY($1::uuid[]) AND owner_id = $2',
      [ids, callerId]
    );

    const results = rows.map((row) => ({
      id: row.id,
      name: row.name,
      content:
        format === 'json'
          ? JSON.stringify(toCanonical(row), null, 2)
          : agentToMarkdown(row),
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// Per-agent rollup across all agents owned by the authenticated user.
app.get('/api/agents/mine/analytics-summary', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT
         a.id              AS agent_id,
         a.name,
         a.favorite_count,
         a.fork_count,
         a.rating_sum,
         a.rating_count,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.agent_id = a.id)::int AS subscriber_count,
         (SELECT COUNT(*) FROM agent_events e WHERE e.agent_id = a.id AND e.type = 'export')::int AS export_count
       FROM agents a
       WHERE a.owner_id = $1
       ORDER BY a.created_at DESC`,
      [userId]
    );
    res.json(
      rows.map((r) => ({
        agentId: r.agent_id,
        name: r.name,
        subscriberCount: r.subscriber_count,
        favoriteCount: r.favorite_count,
        forkCount: r.fork_count,
        exportCount: r.export_count,
        avgRating: r.rating_count > 0 ? r.rating_sum / r.rating_count : null,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marketplace listing — public agents with full-text search, composable filters,
// multiple sort orders, and offset pagination. Never leaks private agents.
app.get('/api/agents/marketplace', optionalAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
  const toolsRaw = typeof req.query.tools === 'string' ? req.query.tools.trim() : '';
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : '';
  const sort = ['recent', 'popular', 'top_rated', 'most_forked'].includes(req.query.sort)
    ? req.query.sort
    : 'recent';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const minRatingRaw = parseFloat(req.query.minRating);
  const minRating = Number.isFinite(minRatingRaw) ? minRatingRaw : 0;
  const toolIds = toolsRaw
    ? toolsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const userId = req.user?.userId ?? null;

  // Build WHERE clause from composable filters (filterParams are shared with count query).
  const filterParams = [];
  const conditions = ["a.visibility = 'public'"];
  let rankExpr = 'NULL';

  if (q) {
    filterParams.push(q);
    const tsqRef = `websearch_to_tsquery('english', $${filterParams.length})`;
    conditions.push(`a.search_tsv @@ ${tsqRef}`);
    rankExpr = `ts_rank(a.search_tsv, ${tsqRef})`;
  }

  if (model) {
    filterParams.push(model);
    conditions.push(`a.model = $${filterParams.length}`);
  }

  if (toolIds.length > 0) {
    filterParams.push(JSON.stringify(toolIds));
    conditions.push(`a.tools @> $${filterParams.length}::jsonb`);
  }

  if (minRating > 0) {
    filterParams.push(minRating);
    conditions.push(
      `(a.rating_count > 0 AND a.rating_sum::float / a.rating_count >= $${filterParams.length})`
    );
  }

  if (categoryId) {
    filterParams.push(categoryId);
    conditions.push(`a.category_id = $${filterParams.length}`);
  }

  const where = conditions.join(' AND ');

  const orderBy = {
    recent:      'a.updated_at DESC',
    popular:     'a.favorite_count DESC, a.updated_at DESC',
    top_rated:   'avg_rating DESC NULLS LAST, a.rating_count DESC, a.updated_at DESC',
    most_forked: 'a.fork_count DESC, a.updated_at DESC',
  }[sort];

  const offset = (page - 1) * pageSize;

  // Per-user flags require subscription + favorites LEFT JOINs; only added when authenticated.
  const dataParams = [...filterParams];
  let subJoin = '';
  let isSubscribedExpr = 'FALSE';
  let isOwnerExpr = 'FALSE';
  let isFavoritedExpr = 'FALSE';
  if (userId) {
    dataParams.push(userId);
    const up = `$${dataParams.length}`;
    subJoin = `LEFT JOIN subscriptions s ON s.agent_id = a.id AND s.user_id = ${up}
         LEFT JOIN agent_favorites af ON af.agent_id = a.id AND af.user_id = ${up}`;
    isSubscribedExpr = `(s.agent_id IS NOT NULL)`;
    isOwnerExpr = `(a.owner_id = ${up})`;
    isFavoritedExpr = `(af.agent_id IS NOT NULL)`;
  }
  dataParams.push(pageSize);
  const pageSizeParam = `$${dataParams.length}`;
  dataParams.push(offset);
  const offsetParam = `$${dataParams.length}`;

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT
           a.id, a.name, a.persona, a.model, a.tools, a.category_id,
           a.fork_count, a.favorite_count, a.rating_sum, a.rating_count,
           CASE WHEN a.rating_count > 0
                THEN a.rating_sum::float / a.rating_count
                ELSE NULL END AS avg_rating,
           u.display_name AS owner_display_name,
           ${rankExpr} AS rank,
           ${isSubscribedExpr} AS is_subscribed,
           ${isOwnerExpr} AS is_owner,
           ${isFavoritedExpr} AS is_favorited
         FROM agents a
         LEFT JOIN users u ON u.id = a.owner_id
         ${subJoin}
         WHERE ${where}
         ORDER BY ${orderBy}
         LIMIT ${pageSizeParam} OFFSET ${offsetParam}`,
        dataParams
      ),
      db.query(`SELECT COUNT(*) AS total FROM agents a WHERE ${where}`, filterParams),
    ]);

    const total = parseInt(countRows[0].total, 10);
    const items = rows.map((r) => {
      const item = {
        id: r.id,
        name: r.name,
        persona: r.persona,
        model: r.model,
        tools: r.tools ?? [],
        categoryId: r.category_id ?? null,
        ownerDisplayName: r.owner_display_name ?? null,
        avgRating: r.avg_rating != null ? Number(r.avg_rating) : null,
        ratingCount: r.rating_count,
        forkCount: r.fork_count,
        favoriteCount: r.favorite_count,
      };
      if (userId) {
        item.isSubscribed = Boolean(r.is_subscribed);
        item.isFavorited = Boolean(r.is_favorited);
        item.isOwner = Boolean(r.is_owner);
      }
      return item;
    });

    res.json({ items, page, pageSize, total, hasMore: page * pageSize < total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent favorites ----------------------------------------------------------
// GET  /api/agents/favorites       — paginated list of caller's bookmarked agents
// POST /api/agents/:id/favorite    — see below (added by #94)
// DELETE /api/agents/:id/favorite  — see below (added by #94)

// Paginated list of agents the authenticated user has favorited.
// Augments serializeAgent with ownerDisplayName, isFavorited, isOwner,
// and isSubscribed so the Favorites tab can render quick-action cards.
app.get('/api/agents/favorites', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT a.*,
                u.display_name AS owner_display_name,
                (a.owner_id = $1) AS is_owner,
                (s.agent_id IS NOT NULL) AS is_subscribed
         FROM agent_favorites f
         JOIN agents a ON a.id = f.agent_id
         LEFT JOIN users u ON u.id = a.owner_id
         LEFT JOIN subscriptions s ON s.agent_id = a.id AND s.user_id = $1
         WHERE f.user_id = $1
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset]
      ),
      db.query(
        'SELECT COUNT(*) AS total FROM agent_favorites WHERE user_id = $1',
        [userId]
      ),
    ]);
    const total = parseInt(countRows[0].total, 10);
    res.json({
      items: rows.map((r) => ({
        ...serializeAgent(r),
        ownerDisplayName: r.owner_display_name ?? null,
        isFavorited: true,
        isOwner: Boolean(r.is_owner),
        isSubscribed: Boolean(r.is_subscribed),
      })),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, sa.name AS forked_from_name
       FROM agents a
       LEFT JOIN agents sa ON sa.id = a.forked_from
       WHERE a.id = $1`,
      [req.params.id]
    );
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

    if (agent.categoryId) {
      const { rows: catRows } = await db.query('SELECT id FROM categories WHERE id = $1', [agent.categoryId]);
      if (!catRows[0]) return res.status(400).json({ error: 'categoryId does not reference an existing category' });
    }

    const newRow = await withClient(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO agents (id, name, persona, system_prompt, model, tools, positions, skills, instructions, visibility, tags, category_id, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          JSON.stringify(agent.tags),
          agent.categoryId ?? null,
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
    writeAudit({
      actor: { id: owner_id },
      action: 'agent.create',
      entityType: 'agent',
      entityId: newRow.id,
      after: serializeAgent(newRow),
      ip: req.headers['x-forwarded-for'] || req.ip,
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
    if (agent.categoryId) {
      const { rows: catRows } = await db.query('SELECT id FROM categories WHERE id = $1', [agent.categoryId]);
      if (!catRows[0]) return res.status(400).json({ error: 'categoryId does not reference an existing category' });
    }

    const { rows: nameRows } = await db.query(
      'SELECT name FROM agents WHERE owner_id = $1 AND id != $2',
      [req.user.userId, req.params.id]
    );
    const existingNames = nameRows.map((r) => r.name);
    const { warnings } = validateAgentDefinition(agent, { existingNames });

    let preImageForAudit = null;
    const updatedRow = await withClient(async (client) => {
      const { rows: existing } = await client.query(
        'SELECT * FROM agents WHERE id = $1',
        [req.params.id]
      );
      if (!existing[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }
      if (existing[0].owner_id !== req.user.userId) { const e = new Error('Forbidden'); e.statusCode = 403; throw e; }
      preImageForAudit = serializeAgent(existing[0]);

      const { rows } = await client.query(
        `UPDATE agents
         SET name = $1, persona = $2, system_prompt = $3, model = $4,
             tools = $5, positions = $6, skills = $7, instructions = $8,
             tags = $9, visibility = $10, category_id = $11, updated_at = NOW()
         WHERE id = $12
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
          JSON.stringify(agent.tags),
          agent.visibility,
          agent.categoryId ?? null,
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

    writeAudit({
      actor: { id: req.user.userId },
      action: 'agent.update',
      entityType: 'agent',
      entityId: updatedRow.id,
      before: preImageForAudit,
      after: serializeAgent(updatedRow),
      ip: req.headers['x-forwarded-for'] || req.ip,
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
      'SELECT * FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Agent not found' });
    if (existing[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
    const oldVisibility = existing[0].visibility;

    const { rows } = await db.query(
      `UPDATE agents SET visibility = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [visibility, req.params.id]
    );
    const updatedAgent = rows[0];
    writeAudit({
      actor: { id: req.user.userId },
      action: 'agent.visibility_change',
      entityType: 'agent',
      entityId: req.params.id,
      before: { visibility: oldVisibility },
      after: { visibility: updatedAgent.visibility },
      ip: req.headers['x-forwarded-for'] || req.ip,
    });
    res.json(serializeAgent(updatedAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM agents WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (rows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
    const deletedSnapshot = serializeAgent(rows[0]);

    await db.query('DELETE FROM agents WHERE id = $1', [req.params.id]);
    writeAudit({
      actor: { id: req.user.userId },
      action: 'agent.delete',
      entityType: 'agent',
      entityId: req.params.id,
      before: deletedSnapshot,
      ip: req.headers['x-forwarded-for'] || req.ip,
    });
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
    emitEvent(agentId, userId, 'subscribe', null);
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
    emitEvent(agentId, userId, 'unsubscribe', null);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent favorites -------------------------------------------------------
// POST inserts a row and increments favorite_count in the same transaction.
// DELETE removes the row and decrements favorite_count atomically.
// Guard: only public agents or agents owned by the caller may be favorited.

app.post('/api/agents/:id/favorite', requireAuth, rateLimit, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  try {
    await withClient(async (client) => {
      const { rows } = await client.query(
        'SELECT owner_id, visibility FROM agents WHERE id = $1',
        [agentId]
      );
      if (!rows[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }
      const { owner_id, visibility } = rows[0];
      if (visibility !== 'public' && owner_id !== userId) {
        const e = new Error('Cannot favorite a private unowned agent'); e.statusCode = 403; throw e;
      }

      const { rowCount } = await client.query(
        'INSERT INTO agent_favorites (user_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, agentId]
      );
      if (rowCount === 0) { const e = new Error('Already favorited'); e.statusCode = 409; throw e; }

      await client.query(
        'UPDATE agents SET favorite_count = favorite_count + 1 WHERE id = $1',
        [agentId]
      );
    });
    emitEvent(agentId, userId, 'favorite', null);
    res.status(200).json({ userId, agentId });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id/favorite', requireAuth, rateLimit, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  try {
    await withClient(async (client) => {
      const { rows } = await client.query('SELECT id FROM agents WHERE id = $1', [agentId]);
      if (!rows[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }

      const { rowCount } = await client.query(
        'DELETE FROM agent_favorites WHERE user_id = $1 AND agent_id = $2',
        [userId, agentId]
      );
      if (rowCount === 0) { const e = new Error('Not favorited'); e.statusCode = 404; throw e; }

      await client.query(
        'UPDATE agents SET favorite_count = GREATEST(0, favorite_count - 1) WHERE id = $1',
        [agentId]
      );
    });
    emitEvent(agentId, userId, 'unfavorite', null);
    res.status(204).end();
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Agent ratings ---------------------------------------------------------
// PUT upserts the caller's rating and recomputes aggregates in the same transaction.
// DELETE removes it and recomputes in the same transaction.
// Self-rating → 400; rating a private unowned agent → 403.

app.put('/api/agents/:id/rating', requireAuth, async (req, res) => {
  const validation = validateRatingInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const agentId = req.params.id;
  const userId = req.user.userId;
  const { rating } = validation.data;

  try {
    await withClient(async (client) => {
      const { rows } = await client.query(
        'SELECT owner_id, visibility FROM agents WHERE id = $1',
        [agentId]
      );
      if (!rows[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }

      const { owner_id, visibility } = rows[0];
      if (owner_id === userId) {
        const e = new Error('Cannot rate your own agent'); e.statusCode = 400; throw e;
      }
      if (visibility !== 'public') {
        const e = new Error('Forbidden'); e.statusCode = 403; throw e;
      }

      await client.query(
        `INSERT INTO agent_ratings (user_id, agent_id, rating, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, agent_id)
         DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()`,
        [userId, agentId, rating]
      );

      await client.query(
        `UPDATE agents
         SET rating_sum   = (SELECT COALESCE(SUM(rating), 0) FROM agent_ratings WHERE agent_id = $1),
             rating_count = (SELECT COUNT(*) FROM agent_ratings WHERE agent_id = $1)
         WHERE id = $1`,
        [agentId]
      );
    });

    emitEvent(agentId, userId, 'rate', { rating });
    res.json({ agentId, userId, rating });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id/rating', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;

  try {
    await withClient(async (client) => {
      const { rows } = await client.query('SELECT id FROM agents WHERE id = $1', [agentId]);
      if (!rows[0]) { const e = new Error('Agent not found'); e.statusCode = 404; throw e; }

      const { rowCount } = await client.query(
        'DELETE FROM agent_ratings WHERE user_id = $1 AND agent_id = $2',
        [userId, agentId]
      );
      if (rowCount === 0) { const e = new Error('Rating not found'); e.statusCode = 404; throw e; }

      await client.query(
        `UPDATE agents
         SET rating_sum   = (SELECT COALESCE(SUM(rating), 0) FROM agent_ratings WHERE agent_id = $1),
             rating_count = (SELECT COUNT(*) FROM agent_ratings WHERE agent_id = $1)
         WHERE id = $1`,
        [agentId]
      );
    });

    emitEvent(agentId, userId, 'rate', null);
    res.status(204).end();
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Agent fork ------------------------------------------------------------
// Creates an independent private copy of a public (or caller-owned) agent.
// Provenance is recorded via forked_from; source fork_count increments atomically.

app.post('/api/agents/:id/fork', requireAuth, async (req, res) => {
  const sourceId = req.params.id;
  const callerId = req.user.userId;

  try {
    const { newAgent, skillWarnings, sourceName } = await withClient(async (client) => {
      const { rows: sourceRows } = await client.query(
        'SELECT * FROM agents WHERE id = $1',
        [sourceId]
      );
      if (!sourceRows[0]) {
        const e = new Error('Agent not found'); e.statusCode = 404; throw e;
      }
      const source = sourceRows[0];

      if (source.visibility !== 'public' && source.owner_id !== callerId) {
        const e = new Error('Forbidden'); e.statusCode = 403; throw e;
      }

      const skillIds = Array.isArray(source.skills) ? source.skills : [];
      let warnings = [];
      if (skillIds.length > 0) {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const customSkillIds = skillIds.filter((id) => UUID_RE.test(id));
        if (customSkillIds.length > 0) {
          const { rows: accessible } = await client.query(
            `SELECT id FROM custom_skills
             WHERE id = ANY($1::uuid[])
               AND (visibility = 'public' OR owner_id = $2)`,
            [customSkillIds, callerId]
          );
          const accessibleSet = new Set(accessible.map((r) => r.id));
          warnings = customSkillIds.filter((id) => !accessibleSet.has(id));
        }
      }

      const newId = crypto.randomUUID();
      const { rows: inserted } = await client.query(
        `INSERT INTO agents
           (id, name, persona, system_prompt, model, tools, positions, skills, instructions, visibility, owner_id, forked_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'private', $10, $11)
         RETURNING *`,
        [
          newId,
          source.name + ' (fork)',
          source.persona,
          source.system_prompt,
          source.model,
          JSON.stringify(source.tools ?? []),
          JSON.stringify(source.positions ?? {}),
          JSON.stringify(source.skills ?? []),
          JSON.stringify(source.instructions ?? []),
          callerId,
          sourceId,
        ]
      );
      const agent = inserted[0];

      await client.query(
        'UPDATE agents SET fork_count = fork_count + 1 WHERE id = $1',
        [sourceId]
      );

      const canonical = toCanonical(agent);
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
      await client.query(
        `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary, created_by)
         VALUES ($1, 1, $2, $3, $4, $5)`,
        [newId, hash, JSON.stringify(canonical), `Forked from ${sourceId}`, callerId]
      );

      return { newAgent: agent, skillWarnings: warnings, sourceName: source.name };
    });

    emitEvent(sourceId, callerId, 'fork', null);
    res.status(201).json({ ...serializeAgent({ ...newAgent, forked_from_name: sourceName }), skillWarnings });
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Agent duplicate -------------------------------------------------------
// Owner-only one-click copy within the caller's own workspace.
// Distinct from fork: no forked_from provenance, no public-source requirement.

app.post('/api/agents/:id/duplicate', requireAuth, async (req, res) => {
  const sourceId = req.params.id;
  const callerId = req.user.userId;

  try {
    const newAgent = await withClient(async (client) => {
      const { rows: sourceRows } = await client.query(
        'SELECT * FROM agents WHERE id = $1',
        [sourceId]
      );
      if (!sourceRows[0]) {
        const e = new Error('Agent not found'); e.statusCode = 404; throw e;
      }
      const source = sourceRows[0];

      if (source.owner_id !== callerId) {
        const e = new Error('Forbidden'); e.statusCode = 403; throw e;
      }

      const newId = crypto.randomUUID();
      const { rows: inserted } = await client.query(
        `INSERT INTO agents
           (id, name, persona, system_prompt, model, tools, positions, skills, instructions, tags, visibility, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          newId,
          source.name + ' (copy)',
          source.persona,
          source.system_prompt,
          source.model,
          JSON.stringify(source.tools ?? []),
          JSON.stringify(source.positions ?? {}),
          JSON.stringify(source.skills ?? []),
          JSON.stringify(source.instructions ?? []),
          JSON.stringify(source.tags ?? []),
          source.visibility,
          callerId,
        ]
      );
      const agent = inserted[0];

      const canonical = toCanonical(agent);
      const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
      await client.query(
        `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary, created_by)
         VALUES ($1, 1, $2, $3, $4, $5)`,
        [newId, hash, JSON.stringify(canonical), `Duplicated from ${sourceId}`, callerId]
      );

      return agent;
    });

    res.status(201).json(serializeAgent(newAgent));
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    if (err.statusCode === 403) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// --- Export event ---------------------------------------------------------
// Called client-side when a user downloads a Markdown export.
// Increments the export count for the agent; anonymous exports are recorded with actor_id = null.

app.post('/api/agents/:id/export-event', optionalAuth, async (req, res) => {
  const agentId = req.params.id;
  const actorId = req.user?.userId ?? null;
  try {
    const { rows } = await db.query('SELECT id FROM agents WHERE id = $1', [agentId]);
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    emitEvent(agentId, actorId, 'export', { format: 'markdown' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent Analytics (owner-only) -----------------------------------------

// Aggregate summary for a single agent: counts + subscriber list (no PII beyond display name).
app.get('/api/agents/:id/analytics', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  try {
    const { rows } = await db.query(
      `SELECT
         a.owner_id,
         a.favorite_count,
         a.fork_count,
         a.rating_sum,
         a.rating_count,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.agent_id = a.id)::int AS subscriber_count,
         (SELECT COUNT(*) FROM agent_events e WHERE e.agent_id = a.id AND e.type = 'export')::int AS export_count
       FROM agents a
       WHERE a.id = $1`,
      [agentId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (rows[0].owner_id !== userId) return res.status(403).json({ error: 'Forbidden' });

    const { rows: subs } = await db.query(
      `SELECT u.display_name, s.created_at AS subscribed_at
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.agent_id = $1
       ORDER BY s.created_at DESC`,
      [agentId]
    );

    const r = rows[0];
    res.json({
      subscriberCount: r.subscriber_count,
      favoriteCount: r.favorite_count,
      forkCount: r.fork_count,
      exportCount: r.export_count,
      avgRating: r.rating_count > 0 ? r.rating_sum / r.rating_count : null,
      ratingCount: r.rating_count,
      subscribers: subs.map((s) => ({ displayName: s.display_name, subscribedAt: s.subscribed_at })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paginated activity timeline for a single agent, newest first.
app.get('/api/agents/:id/analytics/timeline', requireAuth, async (req, res) => {
  const agentId = req.params.id;
  const userId = req.user.userId;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  try {
    const { rows: agentRows } = await db.query(
      'SELECT owner_id FROM agents WHERE id = $1',
      [agentId]
    );
    if (!agentRows[0]) return res.status(404).json({ error: 'Agent not found' });
    if (agentRows[0].owner_id !== userId) return res.status(403).json({ error: 'Forbidden' });

    const [{ rows: events }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT e.id, e.type, e.meta, e.created_at, u.display_name AS actor_display_name
         FROM agent_events e
         LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.agent_id = $1
         ORDER BY e.created_at DESC
         LIMIT $2 OFFSET $3`,
        [agentId, limit, offset]
      ),
      db.query(
        'SELECT COUNT(*)::int AS total FROM agent_events WHERE agent_id = $1',
        [agentId]
      ),
    ]);

    res.json({
      total: countRows[0].total,
      page,
      limit,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        meta: e.meta,
        createdAt: e.created_at,
        actorDisplayName: e.actor_display_name ?? null,
      })),
    });
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
      'SELECT * FROM custom_skills WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Skill not found' });
    if (rows[0].owner_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
    const deletedSnapshot = serializeSkill(rows[0]);

    await db.query('DELETE FROM custom_skills WHERE id = $1', [req.params.id]);
    writeAudit({
      actor: { id: req.user.userId },
      action: 'skill.delete',
      entityType: 'skill',
      entityId: req.params.id,
      before: deletedSnapshot,
      ip: req.headers['x-forwarded-for'] || req.ip,
    });
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

app.post('/api/templates', requireAuth, async (req, res) => {
  const validation = validateTemplateInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const now = new Date();
  const doc = { id: crypto.randomUUID(), ...validation.data, createdAt: now, updatedAt: now };
  try {
    const result = await getDb().collection('agent_templates').insertOne(doc);
    const inserted = await getDb().collection('agent_templates').findOne({ _id: result.insertedId });
    res.status(201).json(serializeTemplate(inserted));
  } catch (err) {
    res.status(503).json({ error: 'Template service unavailable', detail: err.message });
  }
});

app.put('/api/templates/:id', requireAuth, async (req, res) => {
  const validation = validateTemplateInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  try {
    const updated = await getDb()
      .collection('agent_templates')
      .findOneAndUpdate(
        { id: req.params.id },
        { $set: { ...validation.data, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    if (!updated) return res.status(404).json({ error: 'Template not found' });
    res.json(serializeTemplate(updated));
  } catch (err) {
    res.status(503).json({ error: 'Template service unavailable', detail: err.message });
  }
});

app.delete('/api/templates/:id', requireAuth, async (req, res) => {
  try {
    const { deletedCount } = await getDb()
      .collection('agent_templates')
      .deleteOne({ id: req.params.id });
    if (deletedCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.status(204).end();
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

// --- Categories (PostgreSQL) ----------------------------------------------
// GET is public (no auth) — used for filter dropdowns.
// POST/PUT/DELETE require authentication (admin-managed).

app.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM categories ORDER BY label ASC');
    res.json(rows.map(serializeCategory));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const validation = validateCategoryInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { slug, label, color } = validation.data;
  try {
    const { rows } = await db.query(
      'INSERT INTO categories (slug, label, color) VALUES ($1, $2, $3) RETURNING *',
      [slug, label, color]
    );
    res.status(201).json(serializeCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  const validation = validateCategoryInput(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { slug, label, color } = validation.data;
  try {
    const { rows } = await db.query(
      'UPDATE categories SET slug = $1, label = $2, color = $3 WHERE id = $4 RETURNING *',
      [slug, label, color, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json(serializeCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A category with that slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Audit log query (admin-only) -----------------------------------------
// Supports filtering by actorId, entityType, entityId, action, from/to dates.
// Paginated newest-first; exposes actorEmailSnapshot only to admins.

const UUID_RE_AUDIT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/api/audit', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!userRows[0]?.is_admin) return res.status(403).json({ error: 'Forbidden' });

    const { actorId, entityType, entityId, action, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const filterParams = [];

    if (actorId && UUID_RE_AUDIT.test(actorId)) {
      filterParams.push(actorId);
      conditions.push(`actor_id = $${filterParams.length}`);
    }
    if (entityType && typeof entityType === 'string') {
      filterParams.push(entityType.trim());
      conditions.push(`entity_type = $${filterParams.length}`);
    }
    if (entityId && UUID_RE_AUDIT.test(entityId)) {
      filterParams.push(entityId);
      conditions.push(`entity_id = $${filterParams.length}`);
    }
    if (action && typeof action === 'string') {
      filterParams.push(action.trim());
      conditions.push(`action = $${filterParams.length}`);
    }
    if (from) {
      const d = new Date(from);
      if (!isNaN(d)) { filterParams.push(d.toISOString()); conditions.push(`created_at >= $${filterParams.length}`); }
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d)) { filterParams.push(d.toISOString()); conditions.push(`created_at <= $${filterParams.length}`); }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataParams = [...filterParams];
    dataParams.push(pageSize);
    const pageSizeRef = `$${dataParams.length}`;
    dataParams.push(offset);
    const offsetRef = `$${dataParams.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      db.query(
        `SELECT id, actor_id, actor_email_snapshot, action, entity_type, entity_id, before, after, ip, created_at
         FROM audit_log ${where}
         ORDER BY created_at DESC
         LIMIT ${pageSizeRef} OFFSET ${offsetRef}`,
        dataParams
      ),
      db.query(`SELECT COUNT(*)::int AS total FROM audit_log ${where}`, filterParams),
    ]);

    const total = countRows[0].total;
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        actorId: r.actor_id,
        actorEmailSnapshot: r.actor_email_snapshot,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.created_at,
      })),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    isAdmin: row.is_admin ?? false,
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
    tags: row.tags ?? [],
    categoryId: row.category_id ?? null,
    ownerId: row.owner_id ?? null,
    visibility: row.visibility ?? 'private',
    forkedFrom: row.forked_from ?? null,
    forkedFromName: row.forked_from_name ?? null,
    forkCount: row.fork_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
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

function serializeCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    color: row.color,
    createdAt: row.created_at,
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

  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const normalizedTags = rawTags
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (normalizedTags.some((t) => t.length > 30)) {
    return { error: 'Each tag must be 30 characters or fewer' };
  }
  const uniqueTags = [...new Set(normalizedTags)];
  if (uniqueTags.length > 10) {
    return { error: 'A maximum of 10 tags is allowed' };
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let categoryId = null;
  if (body.categoryId != null) {
    if (typeof body.categoryId !== 'string' || !UUID_RE.test(body.categoryId)) {
      return { error: 'categoryId must be a valid UUID' };
    }
    categoryId = body.categoryId;
  }

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
    tags: uniqueTags,
    categoryId,
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
