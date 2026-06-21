/**
 * Component tests for the save-behind-auth / draft-preservation flow.
 *
 * Covers:
 *   1. Anonymous user clicking Save → AuthModal opens with login tab
 *   2. Anonymous user clicking Save → draft is flushed to server immediately
 *   3. After successful login, agent is auto-submitted (performSave runs)
 *   4. Authenticated user clicking Save → API called directly, no AuthModal
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import App from '../src/App.jsx';
import { useAuth } from '../src/AuthContext.jsx';
import { api } from '../src/api.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../src/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../src/api.js', () => ({
  api: {
    listAgents: vi.fn(),
    listPublicAgents: vi.fn(),
    listMyAgents: vi.fn(),
    listSkills: vi.fn(),
    getUserPreferences: vi.fn(),
    getWorkspaceData: vi.fn(),
    saveWorkspaceData: vi.fn(),
    saveDraftAgent: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    saveUserPreferences: vi.fn(),
  },
  setToken: vi.fn(),
  onUnauthorized: vi.fn(),
}));

// Stub out heavy canvas-layer components so tests stay focused on App logic.
vi.mock('../src/components/Canvas.jsx', () => ({
  default: () => <div data-testid="canvas" />,
}));
vi.mock('../src/components/Sidebar.jsx', () => ({
  default: () => <div data-testid="sidebar" />,
}));
vi.mock('../src/components/PersonaPanel.jsx', () => ({
  default: () => <div data-testid="persona-panel" />,
}));
vi.mock('../src/components/SkillsBar.jsx', () => ({
  default: () => <div data-testid="skills-bar" />,
}));
vi.mock('../src/components/AgentsPage.jsx', () => ({
  default: () => <div data-testid="agents-page" />,
}));
vi.mock('../src/components/SkillsPage.jsx', () => ({
  default: () => <div data-testid="skills-page" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupApiDefaults() {
  api.listAgents.mockResolvedValue([]);
  api.listPublicAgents.mockResolvedValue([]);
  api.listMyAgents.mockResolvedValue([]);
  api.listSkills.mockResolvedValue([]);
  api.getUserPreferences.mockResolvedValue({});
  api.getWorkspaceData.mockResolvedValue({});
  api.saveWorkspaceData.mockResolvedValue({});
  api.saveDraftAgent.mockResolvedValue({ id: 'draft-1' });
  api.createAgent.mockResolvedValue({ id: 'agent-1', name: 'My Agent', tools: [] });
  api.saveUserPreferences.mockResolvedValue({});
}

function authAs(overrides = {}) {
  useAuth.mockReturnValue({
    user: null,
    isAuthenticated: false,
    logout: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Save agent — anonymous redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiDefaults();
    authAs(); // unauthenticated by default
  });

  it('opens AuthModal with login tab when anonymous user clicks Save', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Save agent'));

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeDefined();
  });

  it('stashes draft to server immediately on anonymous Save click', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Save agent'));

    expect(api.saveWorkspaceData).toHaveBeenCalledWith('default', {
      agent: expect.objectContaining({ name: 'My Agent' }),
    });
    expect(api.saveDraftAgent).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ name: 'My Agent' }),
    );
  });

  it('does not call createAgent when gating anonymous user', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Save agent'));

    expect(api.createAgent).not.toHaveBeenCalled();
  });
});

describe('Save agent — post-login restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiDefaults();
  });

  it('auto-submits the agent after successful login', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({ id: '1', email: 'a@b.com' });
    authAs({ login: mockLogin });

    render(<App />);

    // Open auth modal
    await user.click(screen.getByText('Save agent'));
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeDefined();

    // Fill and submit login form
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.submit(document.querySelector('form'));

    // performSave should fire after onSuccess callback
    await waitFor(() => expect(api.createAgent).toHaveBeenCalledTimes(1));
  });

  it('closes AuthModal after successful login and save', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({ id: '1', email: 'a@b.com' });
    authAs({ login: mockLogin });

    render(<App />);

    await user.click(screen.getByText('Save agent'));
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('preserves in-memory agent state through the auth modal', async () => {
    const user = userEvent.setup();
    const mockLogin = vi.fn().mockResolvedValue({ id: '1', email: 'a@b.com' });
    authAs({ login: mockLogin });

    render(<App />);

    await user.click(screen.getByText('Save agent'));
    await user.type(screen.getByLabelText(/email/i), 'a@b.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    fireEvent.submit(document.querySelector('form'));

    await waitFor(() => expect(api.createAgent).toHaveBeenCalled());

    const [payload] = api.createAgent.mock.calls[0];
    // Agent name is the default 'My Agent' — unchanged through auth flow
    expect(payload.name).toBe('My Agent');
  });
});

describe('Save agent — authenticated direct save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiDefaults();
    authAs({
      user: { id: '1', email: 'a@b.com', displayName: 'Alice' },
      isAuthenticated: true,
    });
  });

  it('calls createAgent directly without opening AuthModal', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Save agent'));

    await waitFor(() => expect(api.createAgent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not stash a draft when user is already authenticated', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('Save agent'));

    await waitFor(() => expect(api.createAgent).toHaveBeenCalled());
    expect(api.saveDraftAgent).not.toHaveBeenCalled();
  });
});
