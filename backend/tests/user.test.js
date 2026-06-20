import { describe, it, expect } from 'vitest';
import { validateUserInput } from '../src/validation.js';

describe('validateUserInput', () => {
  // ── Invalid body shape ─────────────────────────────────────────────────────

  it('rejects null body', () => {
    expect(validateUserInput(null).error).toBeDefined();
  });

  it('rejects array body', () => {
    expect(validateUserInput([]).error).toBeDefined();
  });

  // ── Email validation ───────────────────────────────────────────────────────

  it('rejects missing email', () => {
    expect(validateUserInput({ password: 'secret123' }).error).toMatch(/email/);
  });

  it('rejects empty email string', () => {
    expect(validateUserInput({ email: '', password: 'secret123' }).error).toMatch(/email/);
  });

  it('rejects email without @ symbol', () => {
    expect(validateUserInput({ email: 'notanemail', password: 'secret123' }).error).toMatch(/email/);
  });

  it('rejects email as non-string', () => {
    expect(validateUserInput({ email: 42, password: 'secret123' }).error).toMatch(/email/);
  });

  // ── Password validation ────────────────────────────────────────────────────

  it('rejects missing password', () => {
    expect(validateUserInput({ email: 'user@example.com' }).error).toMatch(/password/);
  });

  it('rejects empty password', () => {
    expect(validateUserInput({ email: 'user@example.com', password: '' }).error).toMatch(/password/);
  });

  it('rejects password shorter than 8 characters', () => {
    expect(validateUserInput({ email: 'user@example.com', password: 'short' }).error).toMatch(/password/);
  });

  it('rejects password as non-string', () => {
    expect(validateUserInput({ email: 'user@example.com', password: 12345678 }).error).toMatch(/password/);
  });

  // ── Normalization ──────────────────────────────────────────────────────────

  it('normalizes email to lowercase', () => {
    const { data } = validateUserInput({ email: 'User@Example.COM', password: 'password123' });
    expect(data.email).toBe('user@example.com');
  });

  it('trims whitespace from email', () => {
    const { data } = validateUserInput({ email: '  user@example.com  ', password: 'password123' });
    expect(data.email).toBe('user@example.com');
  });

  it('trims and lowercases email together', () => {
    const { data } = validateUserInput({ email: '  ADMIN@EXAMPLE.COM  ', password: 'password123' });
    expect(data.email).toBe('admin@example.com');
  });

  // ── Optional fields ────────────────────────────────────────────────────────

  it('defaults display_name to empty string when omitted', () => {
    const { data } = validateUserInput({ email: 'user@example.com', password: 'password123' });
    expect(data.display_name).toBe('');
  });

  it('trims display_name', () => {
    const { data } = validateUserInput({
      email: 'user@example.com',
      password: 'password123',
      display_name: '  Alice  ',
    });
    expect(data.display_name).toBe('Alice');
  });

  it('defaults auth_provider to "local" when omitted', () => {
    const { data } = validateUserInput({ email: 'user@example.com', password: 'password123' });
    expect(data.auth_provider).toBe('local');
  });

  it('preserves explicit auth_provider', () => {
    const { data } = validateUserInput({
      email: 'user@example.com',
      password: 'password123',
      auth_provider: 'google',
    });
    expect(data.auth_provider).toBe('google');
  });

  // ── Valid full input ───────────────────────────────────────────────────────

  it('returns no error and correct data for valid input', () => {
    const result = validateUserInput({
      email: 'Alice@Example.com',
      password: 'supersecret',
      display_name: 'Alice',
    });
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      email: 'alice@example.com',
      password: 'supersecret',
      display_name: 'Alice',
      auth_provider: 'local',
    });
  });

  it('passes password through unmodified', () => {
    const { data } = validateUserInput({ email: 'user@example.com', password: 'MyP@ssw0rd!' });
    expect(data.password).toBe('MyP@ssw0rd!');
  });
});
