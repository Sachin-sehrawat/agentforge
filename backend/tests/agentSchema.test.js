import { describe, it, expect } from 'vitest';
import { AGENT_SCHEMA_VERSION, toCanonical } from '../src/serialization/agentSchema.js';

const FULL_ROW = {
  id: 'db-uuid-1',
  owner_id: 'user-uuid-2',
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-06-01T00:00:00Z'),
  visibility: 'private',
  name: 'Research Agent',
  persona: 'You are a researcher.',
  system_prompt: 'Be thorough.',
  model: 'claude-sonnet-4-6',
  tools: [{ name: 'calculator' }],
  skills: [{ id: 'web-search' }],
  instructions: ['Step 1', 'Step 2'],
  positions: { 'node-1': { x: 100, y: 200 } },
};

const CANONICAL_KEYS = [
  'schemaVersion', 'name', 'persona', 'systemPrompt', 'model',
  'tools', 'skills', 'instructions', 'positions',
];

describe('AGENT_SCHEMA_VERSION', () => {
  it('is 1', () => {
    expect(AGENT_SCHEMA_VERSION).toBe(1);
  });
});

describe('toCanonical()', () => {
  it('includes schemaVersion', () => {
    const result = toCanonical(FULL_ROW);
    expect(result.schemaVersion).toBe(AGENT_SCHEMA_VERSION);
  });

  it('maps snake_case system_prompt to systemPrompt', () => {
    const result = toCanonical(FULL_ROW);
    expect(result.systemPrompt).toBe('Be thorough.');
  });

  it('excludes DB-internal fields', () => {
    const result = toCanonical(FULL_ROW);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('owner_id');
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('updated_at');
    expect(result).not.toHaveProperty('visibility');
  });

  it('output keys are in canonical order', () => {
    const result = toCanonical(FULL_ROW);
    expect(Object.keys(result)).toEqual(CANONICAL_KEYS);
  });

  it('round-trips through JSON.parse(JSON.stringify()) without loss', () => {
    const result = toCanonical(FULL_ROW);
    const roundTripped = JSON.parse(JSON.stringify(result));
    expect(roundTripped).toEqual(result);
  });

  it('is deterministic — two calls produce identical JSON strings', () => {
    const a = JSON.stringify(toCanonical(FULL_ROW));
    const b = JSON.stringify(toCanonical(FULL_ROW));
    expect(a).toBe(b);
  });

  it('defaults missing JSONB fields to empty collections', () => {
    const result = toCanonical({ name: 'Min', persona: '', system_prompt: '', model: 'x' });
    expect(result.tools).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.instructions).toEqual([]);
    expect(result.positions).toEqual({});
  });

  it('preserves array contents for tools, skills, instructions', () => {
    const result = toCanonical(FULL_ROW);
    expect(result.tools).toEqual([{ name: 'calculator' }]);
    expect(result.skills).toEqual([{ id: 'web-search' }]);
    expect(result.instructions).toEqual(['Step 1', 'Step 2']);
  });

  it('preserves positions map', () => {
    const result = toCanonical(FULL_ROW);
    expect(result.positions).toEqual({ 'node-1': { x: 100, y: 200 } });
  });
});
