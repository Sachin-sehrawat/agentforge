import { getDb } from './mongo.js';

// Collections used by the frontend for transient/preference data.
// Authoritative agent records live in PostgreSQL; MongoDB stores canvas
// state, drafts, and per-user preferences that don't need relational integrity.
const COLLECTIONS = [
  {
    name: 'workspace_state',
    // sparse: true — documents without userId are excluded from the index,
    // preventing duplicate-null errors from stale dev/test documents.
    indexes: [{ key: { userId: 1 }, options: { unique: true, sparse: true } }],
  },
  {
    name: 'draft_agents',
    indexes: [{ key: { userId: 1, updatedAt: -1 }, options: {} }],
  },
  {
    name: 'user_preferences',
    indexes: [{ key: { userId: 1 }, options: { unique: true, sparse: true } }],
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
        // IndexOptionsConflict: a previous run created the index without sparse.
        // Drop it so we can recreate with the correct options.
        if (err.code === 85) {
          await col.dropIndex(key);
          await col.createIndex(key, options);
        } else {
          throw err;
        }
      }
    }
  }
}
