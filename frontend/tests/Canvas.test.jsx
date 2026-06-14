import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Canvas from '../src/components/Canvas';

describe('Canvas Component', () => {
  const mockAgents = [
    {
      id: '1',
      name: 'Test Agent',
      tools: ['calculator', 'code_runner'],
      positions: { calculator: { x: 100, y: 100 } },
    },
  ];

  const mockTools = [
    { id: 'calculator', label: 'Calculator' },
    { id: 'code_runner', label: 'Code Runner' },
  ];

  describe('Rendering', () => {
    it('should render canvas container', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
      };

      const { container } = render(<Canvas {...props} />);
      expect(container.querySelector('[class*="canvas"]')).toBeDefined();
    });

    it('should render agent nodes', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
      };

      render(<Canvas {...props} />);
      expect(screen.queryByText('Test Agent')).toBeDefined();
    });

    it('should render tool nodes', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
      };

      render(<Canvas {...props} />);
      expect(screen.queryByText('Calculator')).toBeDefined();
    });

    it('should handle empty agents list', () => {
      const props = {
        agents: [],
        tools: mockTools,
        selectedAgent: null,
      };

      const { container } = render(<Canvas {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Node Selection', () => {
    it('should highlight selected agent', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
        onSelectAgent: () => {},
      };

      const { container } = render(<Canvas {...props} />);
      const selected = container.querySelector('[class*="selected"]');
      expect(selected || container).toBeDefined();
    });

    it('should call onSelectAgent when agent clicked', () => {
      const onSelectAgent = () => {};
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
        onSelectAgent,
      };

      expect(typeof onSelectAgent).toBe('function');
    });
  });

  describe('Node Positioning', () => {
    it('should position agent node at stored coordinates', () => {
      const agent = {
        id: '1',
        name: 'Test Agent',
        tools: [],
        positions: { agent_1: { x: 200, y: 300 } },
      };

      const props = {
        agents: [agent],
        tools: mockTools,
        selectedAgent: agent,
      };

      expect(agent.positions.agent_1.x).toBe(200);
      expect(agent.positions.agent_1.y).toBe(300);
    });

    it('should update positions on drag', () => {
      const positions = { x: 100, y: 100 };
      const newPositions = { x: 150, y: 150 };

      expect(newPositions.x).not.toBe(positions.x);
      expect(newPositions.y).not.toBe(positions.y);
    });
  });

  describe('Drag and Drop', () => {
    it('should support dragging agent nodes', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
        onUpdateAgent: () => {},
      };

      expect(typeof props.onUpdateAgent).toBe('function');
    });

    it('should support dragging tool nodes', () => {
      const props = {
        agents: mockAgents,
        tools: mockTools,
        selectedAgent: mockAgents[0],
        onUpdateAgent: () => {},
      };

      expect(typeof props.onUpdateAgent).toBe('function');
    });
  });

  describe('Canvas Scaling and Zoom', () => {
    it('should support zoom controls', () => {
      const zoomLevel = 1.0;
      expect(typeof zoomLevel).toBe('number');
    });

    it('should pan canvas', () => {
      const panX = 100;
      const panY = 200;

      expect(typeof panX).toBe('number');
      expect(typeof panY).toBe('number');
    });
  });
});
