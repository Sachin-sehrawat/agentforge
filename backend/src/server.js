import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import db from './db.js';
import { TOOL_CATALOG, TOOL_IDS } from './tools/toolDefinitions.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

app.get('/api/agents', (req, res) => {
  const rows = db.prepare('SELECT * FROM agents ORDER BY updated_at DESC').all();
  res.json(rows.map(serializeAgent));
});

app.get('/api/agents/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agent not found' });
  res.json(serializeAgent(row));
});

app.post('/api/agents', (req, res) => {
  const agent = validateAgentInput(req.body);
  if (agent.error) return res.status(400).json({ error: agent.error });

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO agents (id, name, persona, system_prompt, model, tools, positions)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, agent.name, agent.persona, agent.systemPrompt, agent.model, JSON.stringify(agent.tools), JSON.stringify(agent.positions));

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  res.status(201).json(serializeAgent(row));
});

app.put('/api/agents/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });

  const agent = validateAgentInput(req.body);
  if (agent.error) return res.status(400).json({ error: agent.error });

  db.prepare(
    `UPDATE agents SET name = ?, persona = ?, system_prompt = ?, model = ?, tools = ?, positions = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(agent.name, agent.persona, agent.systemPrompt, agent.model, JSON.stringify(agent.tools), JSON.stringify(agent.positions), req.params.id);

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  res.json(serializeAgent(row));
});

app.delete('/api/agents/:id', (req, res) => {
  const result = db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Agent not found' });
  res.status(204).end();
});

// --- Health check --------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function serializeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    systemPrompt: row.system_prompt,
    model: row.model,
    tools: JSON.parse(row.tools || '[]'),
    positions: JSON.parse(row.positions || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateAgentInput(body) {
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
  };
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AgentForge backend running at http://localhost:${PORT}`);
});
