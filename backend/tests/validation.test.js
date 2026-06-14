import { describe, it, expect } from 'vitest';
import { validatePreferences, validateWorkspaceData, validateDraftInput } from '../src/validation.js';

// ---------------------------------------------------------------------------
// validatePreferences
// ---------------------------------------------------------------------------

describe('validatePreferences', () => {
  it('rejects null body', () => {
    expect(validatePreferences(null).error).toBeDefined();
  });

  it('rejects array body', () => {
    expect(validatePreferences([]).error).toBeDefined();
  });

  it('rejects empty object', () => {
    expect(validatePreferences({}).error).toMatch(/at least one/i);
  });

  it('accepts valid theme values', () => {
    for (const theme of ['light', 'dark', 'system']) {
      expect(validatePreferences({ theme }).error).toBeUndefined();
    }
  });

  it('rejects invalid theme', () => {
    expect(validatePreferences({ theme: 'blue' }).error).toMatch(/theme/);
  });

  it('accepts canvas_zoom within range', () => {
    expect(validatePreferences({ canvas_zoom: 1.5 }).error).toBeUndefined();
    expect(validatePreferences({ canvas_zoom: 0.1 }).error).toBeUndefined();
    expect(validatePreferences({ canvas_zoom: 5 }).error).toBeUndefined();
  });

  it('rejects canvas_zoom out of range', () => {
    expect(validatePreferences({ canvas_zoom: 0 }).error).toMatch(/canvas_zoom/);
    expect(validatePreferences({ canvas_zoom: 6 }).error).toMatch(/canvas_zoom/);
  });

  it('rejects canvas_zoom non-numeric string', () => {
    expect(validatePreferences({ canvas_zoom: 'big' }).error).toMatch(/canvas_zoom/);
  });

  it('accepts valid canvas_pan', () => {
    expect(validatePreferences({ canvas_pan: { x: 0, y: -50 } }).error).toBeUndefined();
  });

  it('rejects canvas_pan missing x or y', () => {
    expect(validatePreferences({ canvas_pan: { x: 0 } }).error).toMatch(/canvas_pan/);
    expect(validatePreferences({ canvas_pan: { y: 0 } }).error).toMatch(/canvas_pan/);
  });

  it('rejects canvas_pan as array', () => {
    expect(validatePreferences({ canvas_pan: [0, 0] }).error).toMatch(/canvas_pan/);
  });

  it('accepts sidebar_width within range', () => {
    expect(validatePreferences({ sidebar_width: 280 }).error).toBeUndefined();
    expect(validatePreferences({ sidebar_width: 0 }).error).toBeUndefined();
    expect(validatePreferences({ sidebar_width: 2000 }).error).toBeUndefined();
  });

  it('rejects sidebar_width out of range', () => {
    expect(validatePreferences({ sidebar_width: -1 }).error).toMatch(/sidebar_width/);
    expect(validatePreferences({ sidebar_width: 2001 }).error).toMatch(/sidebar_width/);
  });

  it('accepts all fields together', () => {
    const result = validatePreferences({
      theme: 'dark',
      canvas_zoom: 1.2,
      canvas_pan: { x: 10, y: -20 },
      sidebar_width: 300,
    });
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
  });

  it('returns body as data when valid', () => {
    const body = { theme: 'light' };
    const { data } = validatePreferences(body);
    expect(data).toEqual(body);
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceData
// ---------------------------------------------------------------------------

describe('validateWorkspaceData', () => {
  it('rejects null body', () => {
    expect(validateWorkspaceData(null).error).toBeDefined();
  });

  it('rejects empty object', () => {
    expect(validateWorkspaceData({}).error).toMatch(/at least one/i);
  });

  it('accepts valid selected_agent string', () => {
    expect(validateWorkspaceData({ selected_agent: 'agent-123' }).error).toBeUndefined();
  });

  it('accepts selected_agent null', () => {
    expect(validateWorkspaceData({ selected_agent: null }).error).toBeUndefined();
  });

  it('rejects selected_agent as number', () => {
    expect(validateWorkspaceData({ selected_agent: 42 }).error).toMatch(/selected_agent/);
  });

  it('accepts agent_positions as object', () => {
    const pos = { 'agent-1': { x: 100, y: 200 } };
    expect(validateWorkspaceData({ agent_positions: pos }).error).toBeUndefined();
  });

  it('rejects agent_positions as array', () => {
    expect(validateWorkspaceData({ agent_positions: [] }).error).toMatch(/agent_positions/);
  });

  it('rejects agent_positions as null', () => {
    expect(validateWorkspaceData({ agent_positions: null }).error).toMatch(/agent_positions/);
  });

  it('accepts active_tab as string', () => {
    expect(validateWorkspaceData({ active_tab: 'canvas' }).error).toBeUndefined();
  });

  it('rejects active_tab as number', () => {
    expect(validateWorkspaceData({ active_tab: 1 }).error).toMatch(/active_tab/);
  });

  it('accepts all fields together', () => {
    const result = validateWorkspaceData({
      selected_agent: 'agent-abc',
      agent_positions: { 'agent-abc': { x: 0, y: 0 } },
      active_tab: 'canvas',
    });
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateDraftInput
// ---------------------------------------------------------------------------

describe('validateDraftInput', () => {
  it('rejects null body', () => {
    expect(validateDraftInput(null).error).toBeDefined();
  });

  it('rejects missing agentData', () => {
    expect(validateDraftInput({}).error).toMatch(/agentData/);
  });

  it('rejects agentData as string', () => {
    expect(validateDraftInput({ agentData: 'not-an-object' }).error).toMatch(/agentData/);
  });

  it('rejects agentData as array', () => {
    expect(validateDraftInput({ agentData: [] }).error).toMatch(/agentData/);
  });

  it('accepts valid agentData object', () => {
    const result = validateDraftInput({ agentData: { name: 'Draft', tools: [] } });
    expect(result.error).toBeUndefined();
    expect(result.data.agentData).toEqual({ name: 'Draft', tools: [] });
  });

  it('strips keys other than agentData', () => {
    const result = validateDraftInput({ agentData: { name: 'x' }, extra: 'ignored' });
    expect(result.data).not.toHaveProperty('extra');
  });
});
