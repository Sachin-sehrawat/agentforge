// MongoDB initialization script — runs once on first container start
// Executed as the root user inside the agentforge database

db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'agentforge');

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
db.draft_agents.createIndex({ workspaceId: 1 });
db.draft_agents.createIndex({ createdAt: -1 });

print('[mongo-init] Collections and indexes created in database: ' + db.getName());
