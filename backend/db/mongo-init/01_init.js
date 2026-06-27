// MongoDB initialization script — runs once on first container start
// Executed as the root user inside the agentbuilder database

db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'agentbuilder');

// user_preferences — one document per userId
db.createCollection('user_preferences');
db.user_preferences.createIndex({ userId: 1 }, { unique: true });
db.user_preferences.createIndex({ updatedAt: -1 });

// workspace_state — one document per workspaceId
db.createCollection('workspace_state');
db.workspace_state.createIndex({ workspaceId: 1 }, { unique: true });
db.workspace_state.createIndex({ updatedAt: -1 });

// draft_agents — many per workspaceId, ordered by creation time
db.createCollection('draft_agents');
// Compound index covers the primary query: find({workspaceId}).sort({createdAt:-1})
// Single compound index replaces the two separate indexes and avoids a sort step
db.draft_agents.createIndex({ workspaceId: 1, createdAt: -1 });
// TTL index: auto-delete drafts older than 30 days to keep collection bounded
db.draft_agents.createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// agent_templates — starter templates seeded by 02_seed_templates.js
db.createCollection('agent_templates');
db.agent_templates.createIndex({ id: 1 }, { unique: true });
db.agent_templates.createIndex({ category: 1 });

print('[mongo-init] Collections and indexes created in database: ' + db.getName());
