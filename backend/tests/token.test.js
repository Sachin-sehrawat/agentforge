import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set JWT_SECRET before importing the module
beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

// Dynamic import so the env var is set first
const { signAccessToken, signRefreshToken, verifyToken } = await import('../src/auth/token.js');

describe('signAccessToken', () => {
  it('returns a JWT string (three dot-separated segments)', () => {
    const token = signAccessToken('user-1');
    expect(token.split('.')).toHaveLength(3);
  });

  it('payload contains userId', () => {
    const token = signAccessToken('user-abc');
    const payload = verifyToken(token);
    expect(payload.userId).toBe('user-abc');
  });

  it('payload does not contain sensitive fields beyond userId and timing claims', () => {
    const token = signAccessToken('user-1');
    const payload = verifyToken(token);
    const keys = Object.keys(payload);
    expect(keys.every((k) => ['userId', 'iat', 'exp'].includes(k))).toBe(true);
  });
});

describe('signRefreshToken', () => {
  it('returns a JWT string', () => {
    const token = signRefreshToken('user-1');
    expect(token.split('.')).toHaveLength(3);
  });

  it('refresh token lives longer than access token', () => {
    const access = verifyToken(signAccessToken('u'));
    const refresh = verifyToken(signRefreshToken('u'));
    expect(refresh.exp).toBeGreaterThan(access.exp);
  });
});

describe('verifyToken', () => {
  it('throws on a tampered signature', () => {
    const token = signAccessToken('user-1');
    const parts = token.split('.');
    parts[2] = 'invalidsignature';
    expect(() => verifyToken(parts.join('.'))).toThrow();
  });

  it('throws on an expired token', async () => {
    // Sign with a 1ms expiry then advance time
    const { default: jwt } = await import('jsonwebtoken');
    const expired = jwt.sign(
      { userId: 'u', exp: Math.floor(Date.now() / 1000) - 1 },
      process.env.JWT_SECRET
    );
    expect(() => verifyToken(expired)).toThrow(/expired/i);
  });

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => verifyToken('any.token.here')).toThrow(/JWT_SECRET/);
  });

  it('throws on a completely invalid token string', () => {
    expect(() => verifyToken('not-a-jwt')).toThrow();
  });
});
