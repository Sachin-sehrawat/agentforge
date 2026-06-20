import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import db from './db.js';
import { getDb, healthCheck as mongoHealth } from './mongo.js';
import { TOOL_CATALOG, TOOL_IDS } from './tools/toolDefinitions.js';
import { validatePreferences, validateWorkspaceData, validateDraftInput } from './validation.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- Request/response logging -----------------------------------------------

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
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

// Apply rate limiting to all MongoDB-backed routes.
app.use('/api/preferences', rateLimit);
app.use('/api/workspace', rateLimit);
app.use('/api/drafts', rateLimit);

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

// --- Agent CRUD ------------------------------------------------------------

app.get('/api/agents', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM agents ORDER BY updated_at DESC');
    res.json(rows.map(serializeAgent));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Agent not found' });
    res.json(serializeAgent(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents', async (req, res) => {
  const agent = validateAgentInput(req.body);
  if (agent.error) return res.status(400).json({ error: agent.error });

  const id = crypto.randomUUID();
  try {
    await db.query(
      `INSERT INTO agents (id, name, persona, system_prompt, model, tools, positions, skills, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
      ]
    );
    const { rows } = await db.query('SELECT * FROM agents WHERE id = $1', [id]);
    res.status(201).json(serializeAgent(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const check = await db.query('SELECT id FROM agents WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Agent not found' });

    const agent = validateAgentInput(req.body);
    if (agent.error) return res.status(400).json({ error: agent.error });

    await db.query(
      `UPDATE agents
       SET name = $1, persona = $2, system_prompt = $3, model = $4,
           tools = $5, positions = $6, skills = $7, instructions = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [
        agent.name,
        agent.persona,
        agent.systemPrompt,
        agent.model,
        JSON.stringify(agent.tools),
        JSON.stringify(agent.positions),
        JSON.stringify(agent.skills),
        JSON.stringify(agent.instructions),
        req.params.id,
      ]
    );

    const { rows } = await db.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    res.json(serializeAgent(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM agents WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Agent not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Custom Skills CRUD ---------------------------------------------------

app.get('/api/skills', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM custom_skills ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills', async (req, res) => {
  const skill = validateSkillInput(req.body);
  if (skill.error) return res.status(400).json({ error: skill.error });

  const id = crypto.randomUUID();
  try {
    await db.query(
      'INSERT INTO custom_skills (id, label, color, description, instruction) VALUES ($1, $2, $3, $4, $5)',
      [id, skill.label, skill.color, skill.description, skill.instruction]
    );
    const { rows } = await db.query('SELECT * FROM custom_skills WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/skills/:id', async (req, res) => {
  try {
    const check = await db.query('SELECT id FROM custom_skills WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Skill not found' });

    const skill = validateSkillInput(req.body);
    if (skill.error) return res.status(400).json({ error: skill.error });

    await db.query(
      `UPDATE custom_skills
       SET label = $1, color = $2, description = $3, instruction = $4, updated_at = NOW()
       WHERE id = $5`,
      [skill.label, skill.color, skill.description, skill.instruction, req.params.id]
    );

    const { rows } = await db.query('SELECT * FROM custom_skills WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/skills/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM custom_skills WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Skill not found' });
    res.status(204).end();
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
    await getDb()
      .collection('user_preferences')
      .updateOne(
        { userId },
        {
          $set: { preferences: validation.data, updatedAt: now },
          $setOnInsert: { userId, createdAt: now },
        },
        { upsert: true }
      );
    const doc = await getDb().collection('user_preferences').findOne({ userId });
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
    await getDb()
      .collection('workspace_state')
      .updateOne(
        { workspaceId },
        {
          $set: { data: validation.data, updatedAt: now },
          $setOnInsert: { workspaceId, createdAt: now },
        },
        { upsert: true }
      );
    const doc = await getDb().collection('workspace_state').findOne({ workspaceId });
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

// --- Helpers -------------------------------------------------------------

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export function validateAgentInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Agent name is required' };

  const tools = Array.isArray(body.tools) ? body.tools.filter((t) => TOOL_CATALOG[t]) : [];

  return {
    name,
    persona: typeof body.persona === 'string' ? body.persona : '',
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : '',
    model: typeof body.model === 'string' && body.model ? body.model : '',
    tools,
    positions: typeof body.positions === 'object' && body.positions ? body.positions : {},
    skills: Array.isArray(body.skills) ? body.skills.filter((s) => typeof s === 'string') : [],
    instructions: Array.isArray(body.instructions) ? body.instructions.filter((s) => typeof s === 'string') : [],
  };
}

export function validateSkillInput(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'Skill label is required' };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) return { error: 'Skill instruction is required' };
  return {
    label,
    color: typeof body.color === 'string' && body.color ? body.color : '#6366f1',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    instruction,
  };
}

export { app };
