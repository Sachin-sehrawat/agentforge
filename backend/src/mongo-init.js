import { db } from './mongo.js';

// Collections used by the frontend for transient/preference data.
// Authoritative agent records live in PostgreSQL; MongoDB stores canvas
// state, drafts, and per-user preferences that don't need relational integrity.
const COLLECTIONS = [
  {
    name: 'workspace_state',
    indexes: [{ key: { userId: 1 }, options: { unique: true } }],
  },
  {
    name: 'draft_agents',
    indexes: [{ key: { userId: 1, updatedAt: -1 }, options: {} }],
  },
  {
    name: 'user_preferences',
    indexes: [{ key: { userId: 1 }, options: { unique: true } }],
  },
];

export async function setup() {
  const database = db();
  const existing = await database.listCollections().toArray();
  const existingNames = new Set(existing.map((c) => c.name));

  for (const { name, indexes } of COLLECTIONS) {
    if (!existingNames.has(name)) {
      await database.createCollection(name);
    }
    const col = database.collection(name);
    for (const { key, options } of indexes) {
      await col.createIndex(key, options);
    }
  }
}
