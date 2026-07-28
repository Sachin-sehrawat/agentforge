import crypto from 'node:crypto';
import db, { withClient } from './db.js';
import { toCanonical } from './serialization/agentSchema.js';
import { parseJson } from './serialization/importAgent.js';
import { decryptToken, getFileContents } from './integrations/github.js';
import { registerHandler } from './worker.js';
import { renderPath } from './githubSync.js';

function hashCanonical(canonical) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function canonicalFromParsed(agent) {
  return {
    schemaVersion: agent.schemaVersion,
    name: agent.name,
    persona: agent.persona,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    tools: agent.tools,
    skills: agent.skills,
    instructions: agent.instructions,
    tags: agent.tags,
    positions: agent.positions,
  };
}

async function markSyncStatus(agentId, fields) {
  const sets = [];
  const params = [];
  for (const [col, val] of Object.entries(fields)) {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  params.push(agentId);
  await db.query(
    `UPDATE agent_github_sync SET ${sets.join(', ')} WHERE agent_id = $${params.length}`,
    params
  ).catch((err) => {
    console.error(`[githubReconcile] Failed to update sync status for agent ${agentId}:`, err.message);
  });
}

async function handleGithubReconcile(payload, { attemptNo, maxAttempts } = {}) {
  const { agentId, commitSha, pusherLogin } = payload;

  const { rows: syncRows } = await db.query(
    `SELECT repo_full_name, branch, path_template, last_synced_commit_sha, last_synced_version_no
     FROM agent_github_sync WHERE agent_id = $1`,
    [agentId]
  );
  const syncConfig = syncRows[0];
  if (!syncConfig) return; // config removed since this job was enqueued

  // Loop-prevention: this commit is the one AgentForge itself just pushed.
  if (commitSha && commitSha === syncConfig.last_synced_commit_sha) return;

  const { rows: agentRows } = await db.query('SELECT * FROM agents WHERE id = $1', [agentId]);
  const agent = agentRows[0];
  if (!agent) return;

  const { rows: connRows } = await db.query(
    'SELECT access_token_encrypted FROM github_connections WHERE user_id = $1',
    [agent.owner_id]
  );
  if (!connRows[0]) {
    if (attemptNo >= maxAttempts) {
      await markSyncStatus(agentId, { last_sync_status: 'error', last_sync_error: "GitHub is not connected for this agent's owner" });
    }
    throw new Error("GitHub is not connected for this agent's owner");
  }
  const accessToken = decryptToken(connRows[0].access_token_encrypted);

  const [owner, repo] = syncConfig.repo_full_name.split('/');
  const path = renderPath(syncConfig.path_template, agent);

  let file;
  try {
    file = await getFileContents(accessToken, owner, repo, path, commitSha);
  } catch (err) {
    if (attemptNo >= maxAttempts) {
      await markSyncStatus(agentId, { last_sync_status: 'error', last_sync_error: err.message });
    }
    throw err;
  }
  if (!file) {
    console.warn(`[githubReconcile] File ${path} not found at commit ${commitSha} for agent ${agentId} — skipping`);
    return;
  }

  const parsed = parseJson(file.content);
  if (parsed.error) {
    await markSyncStatus(agentId, { last_sync_status: 'error', last_sync_error: `Could not parse synced file: ${parsed.error}` });
    return;
  }

  const currentCanonical = toCanonical(agent);
  const currentHash = hashCanonical(currentCanonical);
  const incomingCanonical = canonicalFromParsed(parsed.agent);
  const incomingHash = hashCanonical(incomingCanonical);

  if (incomingHash === currentHash) {
    // Nothing to reconcile — just record that we've seen this commit.
    await markSyncStatus(agentId, {
      last_synced_commit_sha: commitSha,
      last_sync_status: 'ok',
      last_sync_error: null,
      last_synced_at: new Date(),
    });
    return;
  }

  const { rows: latestVersionRows } = await db.query(
    `SELECT version_no FROM agent_versions WHERE agent_id = $1 ORDER BY version_no DESC LIMIT 1`,
    [agentId]
  );
  const latestVersionNo = latestVersionRows[0]?.version_no ?? 0;
  const localDiverged = latestVersionNo !== (syncConfig.last_synced_version_no ?? 0);

  let resolvedUserId = null;
  if (pusherLogin) {
    const { rows: userRows } = await db.query(
      'SELECT user_id FROM github_connections WHERE github_login = $1',
      [pusherLogin]
    );
    resolvedUserId = userRows[0]?.user_id ?? null;
  }

  if (localDiverged) {
    // Conflict: AgentForge and GitHub have each moved since the last clean sync.
    // Record the incoming content as a version for manual review rather than
    // silently overwriting either side.
    const nextNo = latestVersionNo + 1;
    await db.query(
      `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agentId, nextNo, incomingHash, JSON.stringify(incomingCanonical), 'GitHub conflict — review required', resolvedUserId]
    );
    await markSyncStatus(agentId, {
      last_synced_commit_sha: commitSha,
      last_sync_status: 'conflict',
      last_sync_error: null,
      last_synced_at: new Date(),
    });
    return;
  }

  // Clean update: no local divergence, safe to apply the incoming change.
  const nextNo = latestVersionNo + 1;
  await withClient(async (client) => {
    await client.query(
      `UPDATE agents
       SET name = $1, persona = $2, system_prompt = $3, model = $4,
           tools = $5, positions = $6, skills = $7, instructions = $8, tags = $9,
           updated_at = NOW()
       WHERE id = $10`,
      [
        incomingCanonical.name,
        incomingCanonical.persona,
        incomingCanonical.systemPrompt,
        incomingCanonical.model,
        JSON.stringify(incomingCanonical.tools),
        JSON.stringify(incomingCanonical.positions),
        JSON.stringify(incomingCanonical.skills),
        JSON.stringify(incomingCanonical.instructions),
        JSON.stringify(incomingCanonical.tags),
        agentId,
      ]
    );
    await client.query(
      `INSERT INTO agent_versions (agent_id, version_no, canonical_hash, snapshot, change_summary, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agentId, nextNo, incomingHash, JSON.stringify(incomingCanonical), `Synced from GitHub commit ${commitSha.slice(0, 7)}${pusherLogin ? ` by ${pusherLogin}` : ''}`, resolvedUserId]
    );
  });

  await markSyncStatus(agentId, {
    last_synced_commit_sha: commitSha,
    last_synced_version_no: nextNo,
    last_sync_status: 'ok',
    last_sync_error: null,
    last_synced_at: new Date(),
  });
}

export function registerGitHubReconcileHandler() {
  registerHandler('github_reconcile', handleGithubReconcile);
}

export { handleGithubReconcile };
