import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Topbar from '../src/components/Topbar';

const BASE_PROPS = {
  agent: {
    id: null,
    name: 'My Agent',
    persona: '',
    systemPrompt: '',
    tools: [],
    skills: [],
    instructions: [],
  },
  onChangeName: vi.fn(),
  onNew: vi.fn(),
  onSave: vi.fn(),
  saving: false,
  savedAgents: [],
  onLoad: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  view: 'builder',
  onSetView: vi.fn(),
  customSkillsCount: 0,
  user: null,
  onOpenAuth: vi.fn(),
  onLogout: vi.fn(),
};

describe('Topbar — Download button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Export MD button in builder view', () => {
    render(<Topbar {...BASE_PROPS} />);
    expect(screen.getByText('Export MD')).toBeTruthy();
  });

  it('is disabled when agent has no meaningful content', () => {
    render(<Topbar {...BASE_PROPS} />);
    const btn = screen.getByText('Export MD').closest('button');
    expect(btn.disabled).toBe(true);
  });

  it('is enabled when agent has a persona', () => {
    const props = { ...BASE_PROPS, agent: { ...BASE_PROPS.agent, persona: 'Helpful assistant' } };
    render(<Topbar {...props} />);
    expect(screen.getByText('Export MD').closest('button').disabled).toBe(false);
  });

  it('is enabled when agent has a system prompt', () => {
    const props = { ...BASE_PROPS, agent: { ...BASE_PROPS.agent, systemPrompt: 'You are helpful.' } };
    render(<Topbar {...props} />);
    expect(screen.getByText('Export MD').closest('button').disabled).toBe(false);
  });

  it('is enabled when agent has tools', () => {
    const props = { ...BASE_PROPS, agent: { ...BASE_PROPS.agent, tools: ['calculator'] } };
    render(<Topbar {...props} />);
    expect(screen.getByText('Export MD').closest('button').disabled).toBe(false);
  });

  it('is enabled when agent has skills', () => {
    const props = { ...BASE_PROPS, agent: { ...BASE_PROPS.agent, skills: ['skill-1'] } };
    render(<Topbar {...props} />);
    expect(screen.getByText('Export MD').closest('button').disabled).toBe(false);
  });

  it('is enabled for unsaved agent (no id) with content', () => {
    const props = {
      ...BASE_PROPS,
      agent: { ...BASE_PROPS.agent, id: null, systemPrompt: 'Do things.' },
    };
    render(<Topbar {...props} />);
    expect(screen.getByText('Export MD').closest('button').disabled).toBe(false);
  });

  it('calls onDownload with the agent when clicked', () => {
    const onDownload = vi.fn();
    const agent = { ...BASE_PROPS.agent, systemPrompt: 'Do things.' };
    render(<Topbar {...BASE_PROPS} agent={agent} onDownload={onDownload} />);
    fireEvent.click(screen.getByText('Export MD'));
    expect(onDownload).toHaveBeenCalledWith(agent);
  });

  it('does not call onDownload when disabled', () => {
    const onDownload = vi.fn();
    render(<Topbar {...BASE_PROPS} onDownload={onDownload} />);
    const btn = screen.getByText('Export MD').closest('button');
    fireEvent.click(btn);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('is hidden when view is not builder', () => {
    render(<Topbar {...BASE_PROPS} view="agents" />);
    expect(screen.queryByText('Export MD')).toBeNull();
  });
});

describe('Topbar — Save button does not trigger download', () => {
  it('calls onSave without triggering onDownload', () => {
    const onSave = vi.fn();
    const onDownload = vi.fn();
    const agent = { ...BASE_PROPS.agent, systemPrompt: 'Do things.' };
    render(<Topbar {...BASE_PROPS} agent={agent} onSave={onSave} onDownload={onDownload} />);

    fireEvent.click(screen.getByText('Save agent'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDownload).not.toHaveBeenCalled();
  });
});
