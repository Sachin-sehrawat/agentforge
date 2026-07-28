import db from './db.js';
import { toCanonical } from './serialization/agentSchema.js';
import { decryptToken, getFileContents, putFileContents } from './integrations/github.js';
import { registerHandler } from './worker.js';

function renderPath(pathTemplate, agent) {
  const slug = agent.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || agent.id;
  return pathTemplate.replace('{slug}', slug);
}

async function handleGithubSync(payload, { attemptNo, maxAttempts } = {}) {
  const { agentId } = payload;

  const { rows: syncRows } = await db.query(
    `SELECT agent_id, repo_full_name, branch, path_template, auto_sync, format
     FROM agent_github_sync WHERE agent_id = $1`,
    [agentId]
  );
  const syncConfig = syncRows[0];
  // Config removed since this job was enqueued — nothing to do.
  if (!syncConfig) return;

  const { rows: agentRows } = await db.query('SELECT * FROM agents WHERE id = $1', [agentId]);
  const agent = agentRows[0];
  if (!agent) return;

  const { rows: connRows } = await db.query(
    'SELECT access_token_encrypted FROM github_connections WHERE user_id = $1',
    [agent.owner_id]
  );
  if (!connRows[0]) {
    await markSyncError(agentId, 'GitHub is not connected for this agent\'s owner');
    return;
  }
  const accessToken = decryptToken(connRows[0].access_token_encrypted);

  const [owner, repo] = syncConfig.repo_full_name.split('/');
  const path = renderPath(syncConfig.path_template, agent);
  const canonical = toCanonical(agent);
  const content = JSON.stringify(canonical, null, 2);

  const { rows: versionRows } = await db.query(
    `SELECT version_no, change_summary FROM agent_versions
     WHERE agent_id = $1 ORDER BY version_no DESC LIMIT 1`,
    [agentId]
  );
  const versionNo = versionRows[0]?.version_no ?? null;
  const message = `AgentForge sync: ${agent.name}${versionNo ? ` v${versionNo}` : ''}`;

  try {
    const existing = await getFileContents(accessToken, owner, repo, path, syncConfig.branch);
    const result = await putFileContents(
      accessToken,
      owner,
      repo,
      path,
      content,
      message,
      existing?.sha,
      syncConfig.branch
    );

    await db.query(
      `UPDATE agent_github_sync
       SET last_synced_commit_sha = $1, last_synced_version_no = $2,
           last_sync_status = 'ok', last_sync_error = NULL, last_synced_at = NOW()
       WHERE agent_id = $3`,
      [result.commitSha ?? null, versionNo, agentId]
    );
  } catch (err) {
    const isFinalAttempt = attemptNo >= maxAttempts;
    if (isFinalAttempt) await markSyncError(agentId, err.message);
    throw err;
  }
}

async function markSyncError(agentId, message) {
  await db.query(
    `UPDATE agent_github_sync
     SET last_sync_status = 'error', last_sync_error = $1
     WHERE agent_id = $2`,
    [message, agentId]
  ).catch((err) => {
    console.error(`[githubSync] Failed to record sync error for agent ${agentId}:`, err.message);
  });
}

export function registerGitHubSyncHandler() {
  registerHandler('github_sync', handleGithubSync);
}

export { handleGithubSync, renderPath };
