import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { ensureRepoWebhook, verifyWebhookSignature } from '../src/integrations/github.js';

describe('ensureRepoWebhook', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses an existing hook whose config.url matches (idempotent)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 111, config: { url: 'https://app.example.com/api/integrations/github/webhook' } }],
    });
    const hookId = await ensureRepoWebhook('token', 'acme', 'repo', 'secret', 'https://app.example.com/api/integrations/github/webhook');
    expect(hookId).toBe(111);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no create call made
  });

  it('creates a new hook when none matches', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // list — empty
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 222 }) }); // create
    const hookId = await ensureRepoWebhook('token', 'acme', 'repo', 'my-secret', 'https://app.example.com/webhook');
    expect(hookId).toBe(222);

    const [createUrl, createOpts] = fetchMock.mock.calls[1];
    expect(createUrl).toBe('https://api.github.com/repos/acme/repo/hooks');
    expect(createOpts.method).toBe('POST');
    const body = JSON.parse(createOpts.body);
    expect(body.events).toEqual(['push']);
    expect(body.config).toEqual({
      url: 'https://app.example.com/webhook',
      content_type: 'json',
      secret: 'my-secret',
      insecure_ssl: '0',
    });
  });

  it('throws when listing hooks fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      ensureRepoWebhook('token', 'acme', 'repo', 'secret', 'https://x/webhook')
    ).rejects.toThrow('GitHub hooks list HTTP error: 403');
  });

  it('throws with detail when creating a hook fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'Hook already exists' });
    await expect(
      ensureRepoWebhook('token', 'acme', 'repo', 'secret', 'https://x/webhook')
    ).rejects.toThrow('GitHub hook create HTTP error: 422 — Hook already exists');
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'shh-its-a-secret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));

  function sign(buf, key) {
    return `sha256=${crypto.createHmac('sha256', key).update(buf).digest('hex')}`;
  }

  it('returns true for a correctly signed payload', () => {
    expect(verifyWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('returns false when the signature does not match', () => {
    expect(verifyWebhookSignature(body, sign(body, 'wrong-secret'), secret)).toBe(false);
  });

  it('returns false when the signature header is missing', () => {
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it('returns false when the signature header has the wrong prefix', () => {
    expect(verifyWebhookSignature(body, 'sha1=deadbeef', secret)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const tampered = Buffer.from(JSON.stringify({ hello: 'mallory' }));
    expect(verifyWebhookSignature(tampered, sign(body, secret), secret)).toBe(false);
  });
});
