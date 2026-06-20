import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/crypto.js';

describe('hashPassword', () => {
  it('returns a string', async () => {
    const hash = await hashPassword('secret123');
    expect(typeof hash).toBe('string');
  });

  it('produces unique hashes for the same plaintext', async () => {
    const h1 = await hashPassword('secret123');
    const h2 = await hashPassword('secret123');
    expect(h1).not.toBe(h2);
  });

  it('hash is not equal to the plaintext', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
  });

  it('respects a custom cost factor', async () => {
    // cost=4 is the lowest bcrypt allows and keeps tests fast
    const hash = await hashPassword('secret123', 4);
    expect(hash).toMatch(/^\$2[ab]\$04\$/);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('correct', 4);
    expect(await verifyPassword('correct', hash)).toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await hashPassword('correct', 4);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('returns false for an empty string against a real hash', async () => {
    const hash = await hashPassword('notempty', 4);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('is case-sensitive', async () => {
    const hash = await hashPassword('Password', 4);
    expect(await verifyPassword('password', hash)).toBe(false);
  });
});
