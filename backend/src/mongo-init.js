import { getDb } from './mongo.js';

const DRAFT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function setup() {
  const db = getDb();

  const prefs = db.collection('user_preferences');
  await prefs.createIndex({ userId: 1 }, { unique: true });

  const ws = db.collection('workspace_state');
  await ws.createIndex({ workspaceId: 1 }, { unique: true });

  const drafts = db.collection('draft_agents');
  await drafts.createIndex({ workspaceId: 1 });
  await drafts.createIndex({ createdAt: 1 }, { expireAfterSeconds: DRAFT_TTL_SECONDS });
}
