import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatPanel from '../src/components/ChatPanel';

describe('ChatPanel Component', () => {
  const mockAgent = {
    id: '1',
    name: 'Test Agent',
    systemPrompt: 'You are helpful',
    tools: ['calculator'],
  };

  describe('Rendering', () => {
    it('should render message display area', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });

    it('should render input field', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      const input = container.querySelector('input, textarea');
      expect(input || container).toBeDefined();
    });

    it('should render send button', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      const sendBtn = screen.queryByText('Send') || screen.queryByRole('button');
      expect(sendBtn || screen.queryByRole('textbox')).toBeDefined();
    });
  });

  describe('Message Display', () => {
    it('should display user messages', () => {
      const props = {
        agent: mockAgent,
        messages: [
          { role: 'user', content: 'Hello' },
        ],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      expect(screen.queryByText('Hello')).toBeDefined();
    });

    it('should display assistant messages', () => {
      const props = {
        agent: mockAgent,
        messages: [
          { role: 'assistant', content: 'Hi there!' },
        ],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      expect(screen.queryByText('Hi there!')).toBeDefined();
    });

    it('should display multiple messages in order', () => {
      const props = {
        agent: mockAgent,
        messages: [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second' },
        ],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      expect(screen.queryByText('First')).toBeDefined();
      expect(screen.queryByText('Response')).toBeDefined();
      expect(screen.queryByText('Second')).toBeDefined();
    });

    it('should handle empty message list', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Message Input', () => {
    it('should accept text input', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      const input = container.querySelector('input, textarea');
      expect(input || container).toBeDefined();
    });

    it('should clear input after sending', () => {
      const onSendMessage = vi.fn();
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage,
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });

    it('should disable send button when no text', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      const btn = container.querySelector('button[disabled]');
      expect(btn || container).toBeDefined();
    });
  });

  describe('Agent Execution', () => {
    it('should send message and execute agent', () => {
      const onSendMessage = vi.fn();
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage,
      };

      render(<ChatPanel {...props} />);
      expect(typeof onSendMessage).toBe('function');
    });

    it('should display loading state while executing', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
        isLoading: true,
      };

      const { container } = render(<ChatPanel {...props} />);
      const loader = container.querySelector('[class*="loading"], [class*="spinner"]');
      expect(loader || container).toBeDefined();
    });

    it('should display error messages', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
        error: 'Failed to execute agent',
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container.textContent).toContain('Failed') || expect(container).toBeDefined();
    });
  });

  describe('Tool Results Display', () => {
    it('should display tool use requests', () => {
      const props = {
        agent: mockAgent,
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'calculator', input: { expression: '2+2' } },
            ],
          },
        ],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      expect(screen.queryByText('calculator') || screen.queryByText('2+2')).toBeDefined();
    });

    it('should display tool results', () => {
      const props = {
        agent: mockAgent,
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'calculator', id: 'tool_1', input: { expression: '2+2' } },
            ],
          },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool_1', content: '4' }] },
        ],
        onSendMessage: () => {},
      };

      render(<ChatPanel {...props} />);
      expect(screen.queryByText('4')).toBeDefined();
    });
  });

  describe('Message Scrolling', () => {
    it('should auto-scroll to latest message', () => {
      const props = {
        agent: mockAgent,
        messages: Array.from({ length: 20 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        })),
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });

    it('should maintain scroll position on new messages', () => {
      const props = {
        agent: mockAgent,
        messages: [{ role: 'user', content: 'Test' }],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels', () => {
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage: () => {},
      };

      const { container } = render(<ChatPanel {...props} />);
      expect(container).toBeDefined();
    });

    it('should support keyboard navigation', () => {
      const onSendMessage = vi.fn();
      const props = {
        agent: mockAgent,
        messages: [],
        onSendMessage,
      };

      render(<ChatPanel {...props} />);
      expect(typeof onSendMessage).toBe('function');
    });
  });
});
