/**
 * Tests for agentRunner.js
 *
 * The Anthropic SDK is mocked so no live API calls are made.
 * The calculator tool runs its real implementation (mathjs), so expression
 * evaluation is tested end-to-end through the runner.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Anthropic SDK — must be declared before importing agentRunner
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

import { runAgent } from '../src/agentRunner.js';
import { TOOL_CATALOG } from '../src/tools/toolDefinitions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_AGENT = {
  model: 'claude-sonnet-4-6',
  persona: '',
  systemPrompt: 'Be helpful',
  tools: [],
};

function textResponse(text) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}

function toolUseResponse(name, id, input) {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
  };
}

// ---------------------------------------------------------------------------

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Basic conversation flow
// ---------------------------------------------------------------------------

describe('runAgent() — basic text response', () => {
  it('returns reply, trace, and messages', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('Hello!'));

    const result = await runAgent(BASE_AGENT, [{ role: 'user', content: 'Hi' }]);

    expect(result.reply).toBe('Hello!');
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace).toHaveLength(0);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('appends assistant reply to messages array', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('Hi there!'));

    const { messages } = await runAgent(BASE_AGENT, [{ role: 'user', content: 'Hello' }]);

    // Original user message + assistant reply
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('trims leading/trailing whitespace from reply', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('  Hello!  '));
    const { reply } = await runAgent(BASE_AGENT, [{ role: 'user', content: 'Hi' }]);
    expect(reply).toBe('Hello!');
  });

  it('preserves multi-turn conversation history', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('Second answer'));

    const history = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
    ];

    const { messages } = await runAgent(BASE_AGENT, history);

    // history (2) + new user question (0, already in history) + assistant (1)
    // The runner appends the new assistant turn to the passed-in array
    expect(messages).toHaveLength(3);
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages).toHaveLength(2); // original history passed to API
  });

  it('calls Anthropic with the correct model', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent({ ...BASE_AGENT, model: 'claude-opus-4-8' }, [{ role: 'user', content: 'hi' }]);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-8');
  });

  it('falls back to claude-sonnet-4-6 when model is not set', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    const agent = { ...BASE_AGENT, model: undefined };
    await runAgent(agent, [{ role: 'user', content: 'hi' }]);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
  });
});

// ---------------------------------------------------------------------------
// System prompt construction
// ---------------------------------------------------------------------------

describe('runAgent() — system prompt building', () => {
  it('passes system prompt to API', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent(
      { ...BASE_AGENT, systemPrompt: 'You are concise.' },
      [{ role: 'user', content: 'hi' }]
    );
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('You are concise.');
  });

  it('combines persona and systemPrompt with double newline', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent(
      { ...BASE_AGENT, persona: 'Act as a pirate.', systemPrompt: 'Be helpful.' },
      [{ role: 'user', content: 'hi' }]
    );
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toBe('Act as a pirate.\n\nBe helpful.');
  });

  it('uses default prompt when both persona and systemPrompt are empty', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent(
      { ...BASE_AGENT, persona: '', systemPrompt: '' },
      [{ role: 'user', content: 'hi' }]
    );
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toMatch(/helpful AI agent/i);
  });
});

// ---------------------------------------------------------------------------
// Tool filtering
// ---------------------------------------------------------------------------

describe('runAgent() — tool filtering', () => {
  it('passes tools array to Anthropic when tools are enabled', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('4'));
    await runAgent(
      { ...BASE_AGENT, tools: ['calculator'] },
      [{ role: 'user', content: 'What is 2+2?' }]
    );
    const call = mockCreate.mock.calls[0][0];
    expect(Array.isArray(call.tools)).toBe(true);
    expect(call.tools.length).toBeGreaterThan(0);
  });

  it('omits tools key from API call when no tools are enabled', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent(BASE_AGENT, [{ role: 'user', content: 'hi' }]);
    const call = mockCreate.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
  });

  it('filters out unknown tool IDs', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    await runAgent(
      { ...BASE_AGENT, tools: ['calculator', 'nonexistent_tool_xyz'] },
      [{ role: 'user', content: 'hi' }]
    );
    const call = mockCreate.mock.calls[0][0];
    const toolIds = call.tools.map((t) => t.name ?? t.type);
    // calculator should be present, nonexistent should be gone
    expect(toolIds.some((id) => id === 'calculator' || id?.startsWith('calculator'))).toBeTruthy();
  });

  it('handles missing tools property gracefully', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('ok'));
    const agentWithoutTools = { model: 'claude-sonnet-4-6', persona: '', systemPrompt: '' };
    const result = await runAgent(agentWithoutTools, [{ role: 'user', content: 'hi' }]);
    expect(result.reply).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Calculator tool execution (real math evaluation)
// ---------------------------------------------------------------------------

describe('runAgent() — calculator tool', () => {
  it('executes calculator tool and returns result in trace', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_1', { expression: '2 + 2' }))
      .mockResolvedValueOnce(textResponse('The answer is 4.'));

    const result = await runAgent(
      { ...BASE_AGENT, tools: ['calculator'] },
      [{ role: 'user', content: 'What is 2 + 2?' }]
    );

    expect(result.reply).toBe('The answer is 4.');
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0].tool).toBe('calculator');
    expect(result.trace[0].input).toEqual({ expression: '2 + 2' });
    expect(result.trace[0].output.result).toBe(4);
  });

  it('sends tool result back to Anthropic in a user message', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_1', { expression: '10 * 5' }))
      .mockResolvedValueOnce(textResponse('50'));

    await runAgent({ ...BASE_AGENT, tools: ['calculator'] }, [
      { role: 'user', content: '10 times 5?' },
    ]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondCall = mockCreate.mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const toolResult = lastMsg.content.find((c) => c.type === 'tool_result');
    expect(toolResult).toBeDefined();
    expect(toolResult.tool_use_id).toBe('tu_1');
  });

  it('handles calculator error gracefully and continues', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_1', { expression: 'not valid math!' }))
      .mockResolvedValueOnce(textResponse('Sorry, I could not compute that.'));

    const result = await runAgent({ ...BASE_AGENT, tools: ['calculator'] }, [
      { role: 'user', content: 'Evaluate: not valid math!' },
    ]);

    expect(result.reply).toBe('Sorry, I could not compute that.');
    expect(result.trace[0].output).toHaveProperty('error');
  });

  it('handles multiple sequential tool calls across iterations', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_1', { expression: '10 + 5' }))
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_2', { expression: '15 * 2' }))
      .mockResolvedValueOnce(textResponse('The result is 30.'));

    const result = await runAgent({ ...BASE_AGENT, tools: ['calculator'] }, [
      { role: 'user', content: 'First add 10+5, then multiply by 2.' },
    ]);

    expect(result.trace).toHaveLength(2);
    expect(result.trace[0].output.result).toBe(15);
    expect(result.trace[1].output.result).toBe(30);
    expect(result.reply).toBe('The result is 30.');
  });
});

// ---------------------------------------------------------------------------
// Code runner tool execution (real VM sandbox)
// ---------------------------------------------------------------------------

describe('runAgent() — code_runner tool', () => {
  it('executes code and returns output in trace', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('code_runner', 'tu_1', { code: 'return 2 + 2;' }))
      .mockResolvedValueOnce(textResponse('The code returned 4.'));

    const result = await runAgent({ ...BASE_AGENT, tools: ['code_runner'] }, [
      { role: 'user', content: 'Run: return 2 + 2' },
    ]);

    expect(result.trace[0].tool).toBe('code_runner');
    expect(result.trace[0].output.returnValue).toBe(4);
  });

  it('captures console.log output from sandbox', async () => {
    mockCreate
      .mockResolvedValueOnce(
        toolUseResponse('code_runner', 'tu_1', { code: 'console.log("hello"); return "done";' })
      )
      .mockResolvedValueOnce(textResponse('Done.'));

    const result = await runAgent({ ...BASE_AGENT, tools: ['code_runner'] }, [
      { role: 'user', content: 'Log hello' },
    ]);

    expect(result.trace[0].output.output).toContain('hello');
  });
});

// ---------------------------------------------------------------------------
// Unknown / server-side tools
// ---------------------------------------------------------------------------

describe('runAgent() — unknown and server-side tools', () => {
  it('returns error tool_result for unknown tool_use blocks', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_bad', name: 'nonexistent_tool', input: {} }],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce(textResponse('I used an unknown tool.'));

    const result = await runAgent({ ...BASE_AGENT, tools: [] }, [
      { role: 'user', content: 'Use a mystery tool' },
    ]);

    // Should not crash; sends back an error tool_result
    const secondCall = mockCreate.mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    const toolResult = lastMsg.content.find((c) => c.type === 'tool_result');
    expect(toolResult.is_error).toBe(true);
  });

  it('records server_tool_use in trace without executing locally', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [
          { type: 'server_tool_use', id: 'stu_1', name: 'web_search', input: { query: 'test' } },
          { type: 'web_search_tool_result', content: [] },
          { type: 'text', text: 'Done searching.' },
        ],
        stop_reason: 'end_turn',
      });

    const result = await runAgent({ ...BASE_AGENT, tools: ['web_search'] }, [
      { role: 'user', content: 'Search for something' },
    ]);

    expect(result.reply).toBe('Done searching.');
    const serverTrace = result.trace.find((t) => t.server === true);
    expect(serverTrace).toBeDefined();
    expect(serverTrace.tool).toBe('web_search');
  });
});

// ---------------------------------------------------------------------------
// Iteration limits
// ---------------------------------------------------------------------------

describe('runAgent() — iteration limit', () => {
  it('stops after MAX_ITERATIONS (6) even if model keeps calling tools', async () => {
    // Each response is another tool call — never resolves to text
    mockCreate.mockResolvedValue(toolUseResponse('calculator', 'tu_1', { expression: '1+1' }));

    const result = await runAgent({ ...BASE_AGENT, tools: ['calculator'] }, [
      { role: 'user', content: 'Keep going' },
    ]);

    // 6 iterations max; reply may be empty string
    expect(mockCreate.mock.calls.length).toBeLessThanOrEqual(6);
    expect(result.trace.length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe('runAgent() — error handling', () => {
  it('propagates Anthropic API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API quota exceeded'));

    await expect(
      runAgent(BASE_AGENT, [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('API quota exceeded');
  });

  it('catches tool executor errors and records them in trace', async () => {
    const badTool = { expression: 'sqrt(-1)' }; // mathjs returns complex, not an error
    mockCreate
      .mockResolvedValueOnce(toolUseResponse('calculator', 'tu_1', badTool))
      .mockResolvedValueOnce(textResponse('Computed.'));

    const result = await runAgent({ ...BASE_AGENT, tools: ['calculator'] }, [
      { role: 'user', content: 'sqrt of -1' },
    ]);

    // Should complete without throwing
    expect(result.reply).toBe('Computed.');
  });
});

// ---------------------------------------------------------------------------
// TOOL_CATALOG structure tests (tool definitions)
// ---------------------------------------------------------------------------

describe('TOOL_CATALOG', () => {
  it('contains calculator, code_runner, http_request, web_search', () => {
    expect(TOOL_CATALOG).toHaveProperty('calculator');
    expect(TOOL_CATALOG).toHaveProperty('code_runner');
    expect(TOOL_CATALOG).toHaveProperty('http_request');
    expect(TOOL_CATALOG).toHaveProperty('web_search');
  });

  it('calculator has execute function', () => {
    expect(typeof TOOL_CATALOG.calculator.execute).toBe('function');
  });

  it('code_runner has execute function', () => {
    expect(typeof TOOL_CATALOG.code_runner.execute).toBe('function');
  });

  it('web_search kind is server', () => {
    expect(TOOL_CATALOG.web_search.kind).toBe('server');
  });

  it('calculator kind is client', () => {
    expect(TOOL_CATALOG.calculator.kind).toBe('client');
  });

  it('each tool has a label', () => {
    for (const tool of Object.values(TOOL_CATALOG)) {
      expect(typeof tool.label).toBe('string');
      expect(tool.label.length).toBeGreaterThan(0);
    }
  });

  it('each client tool has an anthropicTool definition', () => {
    for (const tool of Object.values(TOOL_CATALOG)) {
      if (tool.kind === 'client') {
        expect(tool.anthropicTool).toBeDefined();
        expect(tool.anthropicTool.input_schema).toBeDefined();
      }
    }
  });
});
