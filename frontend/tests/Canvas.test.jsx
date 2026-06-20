import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Canvas from '../src/components/Canvas';

const DEFAULT_AGENT = {
  id: null,
  name: 'Test Agent',
  persona: '',
  systemPrompt: '',
  tools: [],
  positions: {},
  skills: [],
  instructions: [],
};

const DEFAULT_PROPS = {
  agent: DEFAULT_AGENT,
  onChangeAgentField: vi.fn(),
  onMoveTool: vi.fn(),
  onAddTool: vi.fn(),
  onRemoveTool: vi.fn(),
  onToggleSkill: vi.fn(),
  onToggleInstruction: vi.fn(),
  allSkills: [],
};

describe('Canvas', () => {
  describe('Rendering', () => {
    it('renders the canvas container', () => {
      const { container } = render(<Canvas {...DEFAULT_PROPS} />);
      expect(container.querySelector('.canvas-wrap')).toBeTruthy();
      expect(container.querySelector('.canvas')).toBeTruthy();
    });

    it('renders an SVG element for wires', () => {
      const { container } = render(<Canvas {...DEFAULT_PROPS} />);
      expect(container.querySelector('svg.wires-svg')).toBeTruthy();
    });

    it('renders AgentNode with the agent name', () => {
      render(<Canvas {...DEFAULT_PROPS} />);
      expect(screen.getByDisplayValue('Test Agent')).toBeTruthy();
    });

    it('shows empty hint when no tools are added', () => {
      render(<Canvas {...DEFAULT_PROPS} />);
      expect(screen.getByText(/Drag a tool/i)).toBeTruthy();
    });

    it('does not show empty hint when tools are present', () => {
      const agent = { ...DEFAULT_AGENT, tools: ['calculator'], positions: { calculator: { x: 400, y: 40 } } };
      render(<Canvas {...DEFAULT_PROPS} agent={agent} />);
      expect(screen.queryByText(/Drag a tool/i)).toBeNull();
    });
  });

  describe('Zoom and Pan', () => {
    it('applies CSS transform from zoom and pan props', () => {
      const { container } = render(
        <Canvas {...DEFAULT_PROPS} zoom={1.5} pan={{ x: 20, y: 30 }} />
      );
      const canvas = container.querySelector('.canvas');
      expect(canvas.style.transform).toBe('translate(20px, 30px) scale(1.5)');
      expect(canvas.style.transformOrigin).toBe('0 0');
    });

    it('defaults to zoom=1 and pan={x:0,y:0}', () => {
      const { container } = render(<Canvas {...DEFAULT_PROPS} />);
      const canvas = container.querySelector('.canvas');
      expect(canvas.style.transform).toBe('translate(0px, 0px) scale(1)');
    });
  });

  describe('Drag and Drop', () => {
    it('calls onAddTool when a valid toolId is dropped', () => {
      const onAddTool = vi.fn();
      const { container } = render(<Canvas {...DEFAULT_PROPS} onAddTool={onAddTool} />);
      const wrap = container.querySelector('.canvas-wrap');

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.dataTransfer = { getData: () => 'calculator' };
      dropEvent.clientX = 300;
      dropEvent.clientY = 200;
      // Provide a minimal getBoundingClientRect so position math works
      container.querySelector('.canvas').getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600,
      });

      wrap.dispatchEvent(dropEvent);
      expect(onAddTool).toHaveBeenCalledWith('calculator', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    });

    it('ignores drops with unknown toolId', () => {
      const onAddTool = vi.fn();
      const { container } = render(<Canvas {...DEFAULT_PROPS} onAddTool={onAddTool} />);
      const wrap = container.querySelector('.canvas-wrap');

      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.dataTransfer = { getData: () => 'unknown-tool-xyz' };
      dropEvent.clientX = 300;
      dropEvent.clientY = 200;
      wrap.dispatchEvent(dropEvent);

      expect(onAddTool).not.toHaveBeenCalled();
    });
  });

  describe('Tool nodes', () => {
    it('renders a ToolNode for each tool in agent.tools', () => {
      const agent = {
        ...DEFAULT_AGENT,
        tools: ['calculator', 'code_runner'],
        positions: {
          calculator: { x: 400, y: 40 },
          code_runner: { x: 400, y: 200 },
        },
      };
      const { container } = render(<Canvas {...DEFAULT_PROPS} agent={agent} />);
      expect(container.querySelectorAll('.tool-node').length).toBe(2);
    });
  });
});
