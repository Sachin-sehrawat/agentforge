import { getDb } from './mongo.js';

// Collections used by the frontend for transient/preference data.
// Authoritative agent records live in PostgreSQL; MongoDB stores canvas
// state, drafts, and per-user preferences that don't need relational integrity.
const COLLECTIONS = [
  {
    name: 'user_preferences',
    indexes: [{ key: { userId: 1 }, options: { unique: true } }],
  },
  {
    name: 'workspace_state',
    indexes: [{ key: { workspaceId: 1 }, options: { unique: true } }],
  },
  {
    name: 'draft_agents',
    indexes: [{ key: { workspaceId: 1, createdAt: -1 }, options: {} }],
  },
  {
    name: 'builtin_skills',
    indexes: [{ key: { id: 1 }, options: { unique: true } }],
  },
  {
    name: 'persona_categories',
    indexes: [{ key: { id: 1 }, options: { unique: true } }],
  },
  {
    name: 'agent_templates',
    indexes: [
      { key: { id: 1 }, options: { unique: true } },
      { key: { category: 1 }, options: {} },
    ],
  },
];

const SEED_TEMPLATES = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Searches the web, cites sources, and shows step-by-step reasoning.',
    category: 'productivity',
    icon: '🔍',
    definition: {
      schemaVersion: 1,
      name: 'Researcher',
      persona: 'A thorough researcher who backs every claim with sources and explains reasoning clearly.',
      systemPrompt: 'You are a research assistant. Search the web for up-to-date information, cite your sources, and walk through your reasoning before drawing conclusions.',
      model: '',
      tools: ['web_search'],
      skills: ['cite_sources', 'show_reasoning'],
      instructions: [],
      positions: {},
    },
  },
  {
    id: 'customer-service',
    name: 'Customer Service',
    description: 'Handles support queries with formal, concise replies and live API lookups.',
    category: 'support',
    icon: '🎧',
    definition: {
      schemaVersion: 1,
      name: 'Customer Service',
      persona: 'A professional support agent who is always courteous, concise, and solution-focused.',
      systemPrompt: 'You are a customer support agent. Respond formally and concisely. Use the http_request tool to look up order or account data when needed. Always greet the user and offer a clear next step.',
      model: '',
      tools: ['http_request'],
      skills: ['formal_mode', 'concise'],
      instructions: [],
      positions: {},
    },
  },
  {
    id: 'code-assistant',
    name: 'Code Assistant',
    description: 'Writes, runs, and debugs code with visible step-by-step reasoning.',
    category: 'engineering',
    icon: '💻',
    definition: {
      schemaVersion: 1,
      name: 'Code Assistant',
      persona: 'An expert software engineer who thinks carefully through problems before writing code.',
      systemPrompt: 'You are a coding assistant. Write clean, well-reasoned code. Use the code_runner tool to verify snippets. Walk through your reasoning step by step before presenting a solution.',
      model: '',
      tools: ['code_runner'],
      skills: ['show_reasoning'],
      instructions: [],
      positions: {},
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Crunches numbers and runs code to turn raw data into clear insights.',
    category: 'analytics',
    icon: '📊',
    definition: {
      schemaVersion: 1,
      name: 'Data Analyst',
      persona: 'A rigorous data analyst who validates every calculation and explains findings in plain language.',
      systemPrompt: 'You are a data analyst. Use the calculator tool for arithmetic and the code_runner tool for data transformations or statistical work. Explain your methodology and present findings clearly.',
      model: '',
      tools: ['calculator', 'code_runner'],
      skills: [],
      instructions: [],
      positions: {},
    },
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty agent — add your own tools, skills, and prompt from scratch.',
    category: 'general',
    icon: '⬜',
    definition: {
      schemaVersion: 1,
      name: 'My Agent',
      persona: '',
      systemPrompt: '',
      model: '',
      tools: [],
      skills: [],
      instructions: [],
      positions: {},
    },
  },
];

export async function setup() {
  const database = getDb();
  const existing = await database.listCollections().toArray();
  const existingNames = new Set(existing.map((c) => c.name));

  for (const { name, indexes } of COLLECTIONS) {
    if (!existingNames.has(name)) {
      await database.createCollection(name);
    }
    const col = database.collection(name);
    for (const { key, options } of indexes) {
      try {
        await col.createIndex(key, options);
      } catch (err) {
        // IndexOptionsConflict: a previous run created the index without the right options.
        // Drop by key so we can recreate with the correct definition.
        if (err.code === 85) {
          await col.dropIndex(key);
          await col.createIndex(key, options);
        } else {
          throw err;
        }
      }
    }
  }

  // Seed starter templates if the collection is empty (idempotent).
  const templatesCol = database.collection('agent_templates');
  const count = await templatesCol.countDocuments({});
  if (count === 0) {
    const now = new Date();
    await templatesCol.insertMany(
      SEED_TEMPLATES.map((t) => ({ ...t, createdAt: now, updatedAt: now }))
    );
    console.log(`[mongo-init] Seeded ${SEED_TEMPLATES.length} agent templates`);
  }
}
