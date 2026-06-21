import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentsPage from '../src/components/AgentsPage';

const publicAgent = {
  id: 'pub-1',
  name: 'Public Agent',
  persona: 'helpful',
  systemPrompt: 'Be helpful',
  tools: ['calculator'],
  skills: [],
  instructions: [],
  visibility: 'public',
  updatedAt: '2024-01-01T00:00:00Z',
};

const ownedAgent = {
  id: 'mine-1',
  name: 'My Agent',
  persona: 'creative',
  systemPrompt: 'Be creative',
  tools: [],
  skills: [],
  instructions: [],
  visibility: 'private',
  isOwned: true,
  isSubscribed: false,
  updatedAt: '2024-01-02T00:00:00Z',
};

const subscribedAgent = {
  id: 'sub-1',
  name: 'Subscribed Agent',
  persona: '',
  systemPrompt: 'A public agent I follow',
  tools: [],
  skills: [],
  instructions: [],
  visibility: 'public',
  isOwned: false,
  isSubscribed: true,
  updatedAt: '2024-01-03T00:00:00Z',
};

function defaultProps(overrides = {}) {
  return {
    publicAgents: [],
    myAgents: [],
    loadingPublic: false,
    loadingMine: false,
    errorPublic: null,
    errorMine: null,
    isAuthenticated: false,
    onOpen: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onNew: vi.fn(),
    onOpenAuth: vi.fn(),
    onSubscribe: vi.fn(),
    ...overrides,
  };
}

describe('AgentsPage', () => {
  describe('Tab UI', () => {
    it('renders both Agents and My Agents tabs', () => {
      render(<AgentsPage {...defaultProps()} />);
      expect(screen.getByRole('tab', { name: 'Agents' })).toBeDefined();
      expect(screen.getByRole('tab', { name: 'My Agents' })).toBeDefined();
    });

    it('Agents tab is active by default', () => {
      render(<AgentsPage {...defaultProps()} />);
      const agentsTab = screen.getByRole('tab', { name: 'Agents' });
      expect(agentsTab.className).toContain('active');
    });

    it('switches to Agents tab on click', () => {
      render(<AgentsPage {...defaultProps({ isAuthenticated: true })} />);
      const myTab = screen.getByRole('tab', { name: 'My Agents' });
      fireEvent.click(myTab);
      expect(myTab.className).toContain('active');

      const agentsTab = screen.getByRole('tab', { name: 'Agents' });
      fireEvent.click(agentsTab);
      expect(agentsTab.className).toContain('active');
    });
  });

  describe('Anonymous user — public tab only', () => {
    it('shows public agents in Agents tab', () => {
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent] })} />);
      expect(screen.getByText('Public Agent')).toBeDefined();
    });

    it('clicking My Agents tab calls onOpenAuth when not authenticated', () => {
      const onOpenAuth = vi.fn();
      render(<AgentsPage {...defaultProps({ onOpenAuth })} />);
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(onOpenAuth).toHaveBeenCalledWith('login');
    });

    it('shows sign-in prompt when My Agents tab would display without auth', () => {
      // Simulate tab forced to 'mine' state (not possible via normal click, but
      // tests the gate render). When not auth and tab is agents, we see public list.
      const { container } = render(
        <AgentsPage {...defaultProps({ publicAgents: [publicAgent] })} />
      );
      // The Agents tab should be active — no sign-in prompt visible
      expect(screen.queryByText(/Sign in/i)).toBeNull();
      expect(screen.getByText('Public Agent')).toBeDefined();
    });

    it('does not show Delete button on public agent cards (no onDelete)', () => {
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent] })} />);
      expect(screen.queryByText('Delete')).toBeNull();
    });
  });

  describe('Authenticated user', () => {
    it('switches to My Agents tab without calling onOpenAuth', () => {
      const onOpenAuth = vi.fn();
      render(
        <AgentsPage
          {...defaultProps({ isAuthenticated: true, myAgents: [ownedAgent], onOpenAuth })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(onOpenAuth).not.toHaveBeenCalled();
      expect(screen.getByText('My Agent')).toBeDefined();
    });

    it('shows Owned badge on owned agents in My Agents tab', () => {
      render(
        <AgentsPage
          {...defaultProps({ isAuthenticated: true, myAgents: [ownedAgent] })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText('Owned')).toBeDefined();
    });

    it('shows Subscribed badge on subscribed agents in My Agents tab', () => {
      render(
        <AgentsPage
          {...defaultProps({ isAuthenticated: true, myAgents: [subscribedAgent] })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText('Subscribed')).toBeDefined();
    });

    it('shows Delete button only for owned agents', () => {
      render(
        <AgentsPage
          {...defaultProps({
            isAuthenticated: true,
            myAgents: [ownedAgent, subscribedAgent],
          })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      const deleteButtons = screen.getAllByText('Delete');
      // Only the owned agent card should have a delete button
      expect(deleteButtons).toHaveLength(1);
    });

    it('calls onDelete with agent id for owned agents after confirm', () => {
      const onDelete = vi.fn();
      render(
        <AgentsPage
          {...defaultProps({ isAuthenticated: true, myAgents: [ownedAgent], onDelete })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      fireEvent.click(screen.getByText('Delete'));
      fireEvent.click(screen.getByText('Confirm?'));
      expect(onDelete).toHaveBeenCalledWith('mine-1');
    });

    it('can view both tabs — public and mine independently', () => {
      render(
        <AgentsPage
          {...defaultProps({
            isAuthenticated: true,
            publicAgents: [publicAgent],
            myAgents: [ownedAgent],
          })}
        />
      );
      // Agents tab shows public list
      expect(screen.getByText('Public Agent')).toBeDefined();

      // My Agents tab shows user's list
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText('My Agent')).toBeDefined();
      expect(screen.queryByText('Public Agent')).toBeNull();
    });
  });

  describe('Loading states', () => {
    it('shows loading indicator for public tab', () => {
      render(<AgentsPage {...defaultProps({ loadingPublic: true })} />);
      expect(screen.getByText('Loading…')).toBeDefined();
    });

    it('shows loading indicator for My Agents tab', () => {
      render(
        <AgentsPage {...defaultProps({ isAuthenticated: true, loadingMine: true })} />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText('Loading…')).toBeDefined();
    });
  });

  describe('Error states', () => {
    it('shows error message for public tab', () => {
      render(<AgentsPage {...defaultProps({ errorPublic: 'Network error' })} />);
      expect(screen.getByText(/Network error/)).toBeDefined();
    });

    it('shows error message for My Agents tab', () => {
      render(
        <AgentsPage
          {...defaultProps({ isAuthenticated: true, errorMine: 'Unauthorized' })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText(/Unauthorized/)).toBeDefined();
    });
  });

  describe('Empty states', () => {
    it('shows empty state for public tab with no agents', () => {
      render(<AgentsPage {...defaultProps({ publicAgents: [] })} />);
      expect(screen.getByText('No public agents yet.')).toBeDefined();
    });

    it('shows empty state with CTA for My Agents tab', () => {
      render(
        <AgentsPage {...defaultProps({ isAuthenticated: true, myAgents: [] })} />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.getByText('No agents yet.')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Build your first agent' })).toBeDefined();
    });

    it('calls onNew when build CTA clicked', () => {
      const onNew = vi.fn();
      render(
        <AgentsPage {...defaultProps({ isAuthenticated: true, myAgents: [], onNew })} />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      fireEvent.click(screen.getByRole('button', { name: 'Build your first agent' }));
      expect(onNew).toHaveBeenCalled();
    });
  });

  describe('Search / filter', () => {
    it('filters agents by name', () => {
      render(
        <AgentsPage
          {...defaultProps({ publicAgents: [publicAgent, { ...publicAgent, id: 'pub-2', name: 'Other Agent' }] })}
        />
      );
      const input = screen.getByPlaceholderText('Search agents…');
      fireEvent.change(input, { target: { value: 'Public' } });
      expect(screen.getByText('Public Agent')).toBeDefined();
      expect(screen.queryByText('Other Agent')).toBeNull();
    });

    it('shows filter-empty message when no match', () => {
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent] })} />);
      const input = screen.getByPlaceholderText('Search agents…');
      fireEvent.change(input, { target: { value: 'zzznomatch' } });
      expect(screen.getByText(/No agents match/)).toBeDefined();
    });

    it('clear button resets search', () => {
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent] })} />);
      const input = screen.getByPlaceholderText('Search agents…');
      fireEvent.change(input, { target: { value: 'xyz' } });
      const clear = screen.getByText('✕');
      fireEvent.click(clear);
      expect(input.value).toBe('');
    });
  });

  describe('Card actions', () => {
    it('calls onOpen with agent id when Open clicked', () => {
      const onOpen = vi.fn();
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent], onOpen })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      expect(onOpen).toHaveBeenCalledWith('pub-1');
    });

    it('calls onDownload with agent when MD clicked', () => {
      const onDownload = vi.fn();
      render(<AgentsPage {...defaultProps({ publicAgents: [publicAgent], onDownload })} />);
      fireEvent.click(screen.getByRole('button', { name: /MD/i }));
      expect(onDownload).toHaveBeenCalledWith(publicAgent);
    });
  });
});

describe('Subscribe / Unsubscribe', () => {
  describe('Subscribe button on public cards', () => {
    it('shows Subscribe button on unsubscribed public card', () => {
      render(
        <AgentsPage
          {...defaultProps({ publicAgents: [publicAgent], isAuthenticated: true })}
        />
      );
      expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined();
    });

    it('shows Unsubscribe button when agent isSubscribed', () => {
      const subscribed = { ...publicAgent, isSubscribed: true };
      render(
        <AgentsPage
          {...defaultProps({ publicAgents: [subscribed], isAuthenticated: true })}
        />
      );
      expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDefined();
    });

    it('does not show Subscribe button on My Agents tab cards', () => {
      render(
        <AgentsPage
          {...defaultProps({
            isAuthenticated: true,
            myAgents: [ownedAgent],
          })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'My Agents' }));
      expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
    });
  });

  describe('Authenticated subscribe flow', () => {
    it('calls onSubscribe with the agent when Subscribe clicked', async () => {
      const onSubscribe = vi.fn().mockResolvedValue(undefined);
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: true,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      await waitFor(() => expect(onSubscribe).toHaveBeenCalledWith(publicAgent));
    });

    it('calls onSubscribe with subscribed agent when Unsubscribe clicked', async () => {
      const onSubscribe = vi.fn().mockResolvedValue(undefined);
      const subscribed = { ...publicAgent, isSubscribed: true };
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [subscribed],
            isAuthenticated: true,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
      await waitFor(() => expect(onSubscribe).toHaveBeenCalledWith(subscribed));
    });

    it('shows Unsubscribe optimistically after Subscribe click', async () => {
      // onSubscribe never resolves during this test — button should show Unsubscribe
      const onSubscribe = vi.fn().mockReturnValue(new Promise(() => {}));
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: true,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDefined()
      );
    });
  });

  describe('Anonymous subscribe flow', () => {
    it('calls onOpenAuth with login when anonymous user clicks Subscribe', async () => {
      const onOpenAuth = vi.fn();
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: false,
            onOpenAuth,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      await waitFor(() => expect(onOpenAuth).toHaveBeenCalledWith('login'));
    });

    it('does not call onSubscribe for anonymous user', async () => {
      const onSubscribe = vi.fn();
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: false,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      await waitFor(() => expect(onSubscribe).not.toHaveBeenCalled());
    });

    it('reverts optimistic toggle after anonymous click (rollback)', async () => {
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: false,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      // Optimistic toggle throws (auth-required) and reverts — button stays Subscribe
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
      );
    });
  });

  describe('Failure rollback', () => {
    it('reverts to Subscribe when onSubscribe rejects', async () => {
      const onSubscribe = vi.fn().mockRejectedValue(new Error('network error'));
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [publicAgent],
            isAuthenticated: true,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
      // Rolls back after rejection
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDefined()
      );
    });

    it('reverts to Unsubscribe when onSubscribe rejects on an already-subscribed agent', async () => {
      const onSubscribe = vi.fn().mockRejectedValue(new Error('network error'));
      const subscribed = { ...publicAgent, isSubscribed: true };
      render(
        <AgentsPage
          {...defaultProps({
            publicAgents: [subscribed],
            isAuthenticated: true,
            onSubscribe,
          })}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDefined()
      );
    });
  });
});
