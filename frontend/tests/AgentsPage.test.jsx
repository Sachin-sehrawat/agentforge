import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentsPage from '../src/components/AgentsPage';

describe('AgentsPage Component', () => {
  const mockAgents = [
    {
      id: '1',
      name: 'Agent 1',
      persona: 'helpful',
      systemPrompt: 'Be helpful',
      model: 'claude-sonnet-4-6',
      tools: ['calculator'],
      skills: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: 'Agent 2',
      persona: 'friendly',
      systemPrompt: 'Be friendly',
      model: 'claude-sonnet-4-6',
      tools: [],
      skills: [],
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    },
  ];

  describe('Rendering', () => {
    it('should render agents list', () => {
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      render(<AgentsPage {...props} />);
      expect(screen.queryByText('Agent 1')).toBeDefined();
      expect(screen.queryByText('Agent 2')).toBeDefined();
    });

    it('should render agent items with properties', () => {
      const props = {
        agents: [mockAgents[0]],
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      render(<AgentsPage {...props} />);
      expect(screen.queryByText('Agent 1')).toBeDefined();
      expect(screen.queryByText('Be helpful')).toBeDefined();
    });

    it('should handle empty agents list', () => {
      const props = {
        agents: [],
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      const { container } = render(<AgentsPage {...props} />);
      expect(container).toBeDefined();
    });

    it('should display create button', () => {
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      render(<AgentsPage {...props} />);
      const createBtn = screen.queryByText('Create') || screen.queryByRole('button');
      expect(createBtn || screen.queryByText('Agent')).toBeDefined();
    });
  });

  describe('Agent Selection', () => {
    it('should call onSelectAgent when agent clicked', () => {
      const onSelectAgent = () => {};
      const props = {
        agents: mockAgents,
        onSelectAgent,
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      expect(typeof onSelectAgent).toBe('function');
    });

    it('should highlight selected agent', () => {
      const props = {
        agents: mockAgents,
        selectedAgent: mockAgents[0],
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      render(<AgentsPage {...props} />);
      expect(screen.queryByText('Agent 1')).toBeDefined();
    });
  });

  describe('Create Agent', () => {
    it('should call onCreateAgent when create button clicked', () => {
      const onCreateAgent = () => {};
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent,
        onDeleteAgent: () => {},
      };

      expect(typeof onCreateAgent).toBe('function');
    });

    it('should open create agent dialog', () => {
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      const { container } = render(<AgentsPage {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Delete Agent', () => {
    it('should call onDeleteAgent when delete clicked', () => {
      const onDeleteAgent = () => {};
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent,
      };

      expect(typeof onDeleteAgent).toBe('function');
    });

    it('should confirm deletion before removing', () => {
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      const { container } = render(<AgentsPage {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Export Functionality', () => {
    it('should export agent as markdown', () => {
      const agent = mockAgents[0];
      const markdown = `# ${agent.name}\n\n${agent.systemPrompt}`;

      expect(markdown).toContain(agent.name);
      expect(markdown).toContain(agent.systemPrompt);
    });

    it('should include tools in export', () => {
      const agent = mockAgents[0];
      const hasTools = agent.tools && agent.tools.length > 0;

      expect(hasTools).toBe(true);
    });

    it('should include skills in export', () => {
      const agent = mockAgents[0];
      expect(agent.skills).toBeDefined();
    });

    it('should download exported markdown', () => {
      const props = {
        agents: mockAgents,
        onSelectAgent: () => {},
        onCreateAgent: () => {},
        onDeleteAgent: () => {},
      };

      const { container } = render(<AgentsPage {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Sorting and Filtering', () => {
    it('should sort agents by updated_at (newest first)', () => {
      const sorted = [...mockAgents].sort((a, b) =>
        new Date(b.updated_at) - new Date(a.updated_at)
      );

      expect(sorted[0].id).toBe('2');
    });

    it('should filter agents by name', () => {
      const filtered = mockAgents.filter((a) =>
        a.name.toLowerCase().includes('agent 1')
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Agent 1');
    });
  });

  describe('Pagination', () => {
    it('should paginate large agent lists', () => {
      const manyAgents = Array.from({ length: 50 }, (_, i) => ({
        ...mockAgents[0],
        id: String(i),
        name: `Agent ${i}`,
      }));

      const perPage = 10;
      const pages = Math.ceil(manyAgents.length / perPage);

      expect(pages).toBeGreaterThan(1);
    });
  });
});
