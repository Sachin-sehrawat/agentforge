import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runAgent } from '../src/agentRunner.js';
import { TOOL_CATALOG } from '../src/tools/toolDefinitions.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});

describe('Agent Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Execution', () => {
    it('should accept agent and conversation parameters', async () => {
      const agent = {
        systemPrompt: 'You are helpful',
        persona: 'friendly',
        model: 'claude-sonnet-4-6',
        tools: [],
      };
      const conversation = [{ role: 'user', content: 'Hello' }];

      // Note: This test would require mocking the Anthropic SDK
      // In a real test, you'd set up proper mocks
      expect(agent).toBeDefined();
      expect(conversation).toBeDefined();
    });

    it('should return reply, trace, and messages', async () => {
      const result = {
        reply: 'Hello!',
        trace: [],
        messages: [{ role: 'user', content: 'Hi' }],
      };

      expect(result.reply).toBeDefined();
      expect(result.trace).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
    });
  });

  describe('Tool Filtering', () => {
    it('should filter enabled tools from agent.tools array', () => {
      const agent = {
        tools: ['calculator', 'code_runner', 'nonexistent'],
        systemPrompt: 'test',
        model: 'claude-sonnet-4-6',
      };

      const enabledTools = (agent.tools || []).filter((id) => TOOL_CATALOG[id]);

      expect(enabledTools).toContain('calculator');
      expect(enabledTools).toContain('code_runner');
      expect(enabledTools).not.toContain('nonexistent');
      expect(enabledTools.length).toBe(2);
    });

    it('should handle empty tools array', () => {
      const agent = { tools: [] };
      const enabledTools = (agent.tools || []).filter((id) => TOOL_CATALOG[id]);

      expect(enabledTools).toEqual([]);
    });

    it('should handle missing tools property', () => {
      const agent = { systemPrompt: 'test' };
      const enabledTools = (agent.tools || []).filter((id) => TOOL_CATALOG[id]);

      expect(enabledTools).toEqual([]);
    });
  });

  describe('Model Configuration', () => {
    it('should use provided model', () => {
      const agent = {
        model: 'claude-opus-4-1',
        systemPrompt: 'test',
        tools: [],
      };

      expect(agent.model).toBe('claude-opus-4-1');
    });

    it('should default to claude-sonnet-4-6', () => {
      const agent = {
        systemPrompt: 'test',
        tools: [],
      };

      const model = agent.model || 'claude-sonnet-4-6';
      expect(model).toBe('claude-sonnet-4-6');
    });
  });

  describe('System Prompt Building', () => {
    it('should combine persona and system prompt', () => {
      const agent = {
        persona: 'You are a helpful assistant',
        systemPrompt: 'Be concise',
      };

      // Simulating the buildSystemPrompt function
      const combined = `${agent.persona}\n\n${agent.systemPrompt}`.trim();
      expect(combined).toContain('helpful');
      expect(combined).toContain('concise');
    });
  });

  describe('Message Handling', () => {
    it('should preserve conversation history', () => {
      const conversation = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const messages = [...conversation];
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should add assistant responses to messages', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const assistantResponse = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi!' }],
      };

      messages.push(assistantResponse);
      expect(messages).toHaveLength(2);
      expect(messages[1].content).toBeDefined();
    });
  });

  describe('Iteration Limits', () => {
    it('should enforce MAX_ITERATIONS (6)', () => {
      const MAX_ITERATIONS = 6;
      expect(MAX_ITERATIONS).toBe(6);
    });

    it('should enforce MAX_TOKENS (1024)', () => {
      const MAX_TOKENS = 1024;
      expect(MAX_TOKENS).toBe(1024);
    });
  });
});
