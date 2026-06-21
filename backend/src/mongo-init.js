import { getDb } from './mongo.js';

// Collections used by the frontend for transient/preference data.
// Authoritative agent records live in PostgreSQL; MongoDB stores canvas
// state, drafts, and per-user preferences that don't need relational integrity.
const COLLECTIONS = [
  {
    name: 'user_preferences',
    indexes: [{ key: { userId: 1 }, options: { unique: true, sparse: true } }],
  },
  {
    name: 'workspace_state',
    // Keyed by workspaceId, not userId — a workspace is a canvas session.
    // sparse: true prevents duplicate-null errors from stale dev/test documents.
    indexes: [{ key: { workspaceId: 1 }, options: { unique: true, sparse: true } }],
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
}
