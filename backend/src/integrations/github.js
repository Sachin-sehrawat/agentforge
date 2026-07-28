import crypto from 'node:crypto';

// --- Encryption helpers (AES-256-GCM) --------------------------------------
// Stored format in DB: iv (12 B) | authTag (16 B) | ciphertext

function getEncryptionKey() {
  const raw = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY env var is not set');
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(raw, 'hex');
}

export function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptToken(buf) {
  const key = getEncryptionKey();
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const iv = b.subarray(0, 12);
  const authTag = b.subarray(12, 28);
  const ciphertext = b.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// --- GitHub API helpers -----------------------------------------------------

export async function exchangeCodeForToken(code) {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'AgentForge',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!resp.ok) throw new Error(`GitHub token exchange HTTP error: ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data; // { access_token, token_type, scope }
}

export async function fetchGitHubUser(accessToken) {
  const resp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AgentForge',
    },
  });
  if (!resp.ok) throw new Error(`GitHub user fetch HTTP error: ${resp.status}`);
  return resp.json(); // { login, id, ... }
}

export async function fetchGitHubRepos(accessToken) {
  const results = [];
  let url = 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member';
  while (url) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AgentForge',
      },
    });
    if (!resp.ok) throw new Error(`GitHub repos fetch HTTP error: ${resp.status}`);
    const page = await resp.json();
    for (const r of page) {
      results.push({ fullName: r.full_name, defaultBranch: r.default_branch, private: r.private });
    }
    const link = resp.headers.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}

export async function fetchGitHubBranches(accessToken, owner, repo) {
  const results = [];
  let url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`;
  while (url) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AgentForge',
      },
    });
    if (resp.status === 404) throw Object.assign(new Error('Repository not found'), { statusCode: 404 });
    if (!resp.ok) throw new Error(`GitHub branches fetch HTTP error: ${resp.status}`);
    const page = await resp.json();
    for (const b of page) results.push(b.name);
    const link = resp.headers.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return results;
}

// Path segments must be encoded individually — encoding the whole path would
// turn the "/" separators into "%2F".
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

// Fetches a file's current contents + blob sha from a repo, or null if it
// doesn't exist yet (so callers can distinguish create vs. update).
export async function getFileContents(accessToken, owner, repo, path, ref) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AgentForge',
    },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub file fetch HTTP error: ${resp.status}`);
  const data = await resp.json();
  return {
    sha: data.sha,
    content: Buffer.from(data.content, data.encoding || 'base64').toString('utf8'),
  };
}

// Creates or updates a file via the Contents API. Pass the existing file's
// `sha` (from getFileContents) to update it; omit it to create a new file.
export async function putFileContents(accessToken, owner, repo, path, content, message, sha, branch) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AgentForge',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`GitHub file write HTTP error: ${resp.status}${detail ? ` — ${detail}` : ''}`);
  }
  const data = await resp.json();
  return { commitSha: data.commit?.sha, contentSha: data.content?.sha };
}

// Ensures a push-event webhook exists on the repo pointed at callbackUrl.
// Idempotent — lists existing hooks first and reuses one whose config.url
// already matches, so saving sync config for multiple agents on the same
// repo doesn't create duplicate hooks.
export async function ensureRepoWebhook(accessToken, owner, repo, secret, callbackUrl) {
  const listResp = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AgentForge',
      },
    }
  );
  if (!listResp.ok) throw new Error(`GitHub hooks list HTTP error: ${listResp.status}`);
  const existing = await listResp.json();
  const match = existing.find((h) => h.config?.url === callbackUrl);
  if (match) return match.id;

  const createResp = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AgentForge',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: { url: callbackUrl, content_type: 'json', secret, insecure_ssl: '0' },
      }),
    }
  );
  if (!createResp.ok) {
    const detail = await createResp.text().catch(() => '');
    throw new Error(`GitHub hook create HTTP error: ${createResp.status}${detail ? ` — ${detail}` : ''}`);
  }
  const created = await createResp.json();
  return created.id;
}

// Verifies GitHub's X-Hub-Signature-256 header (HMAC-SHA256 over the raw
// request body) using a timing-safe comparison.
export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function revokeGitHubToken(accessToken) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;

  const resp = await fetch(
    `https://api.github.com/applications/${clientId}/token`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AgentForge',
      },
      body: JSON.stringify({ access_token: accessToken }),
    }
  );
  // 204 = revoked, 422 = already invalid — both are acceptable
  if (resp.status !== 204 && resp.status !== 422) {
    console.error(`[github] Token revocation returned unexpected status: ${resp.status}`);
  }
}
