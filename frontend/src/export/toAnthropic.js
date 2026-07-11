import { SKILLS } from '../data/skills.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

const SKILL_INSTRUCTIONS = Object.fromEntries(SKILLS.map((s) => [s.id, s.instruction]));

// Tool schemas derived from the backend TOOL_CATALOG — keep in sync with
// backend/src/tools/toolDefinitions.js and backend/src/export/toolSchemas.js.
const TOOL_SCHEMAS = {
  web_search: { type: 'web_search_20250305', name: 'web_search' },
  calculator: {
    name: 'calculator',
    description:
      'Evaluate a mathematical expression and return the numeric result. ' +
      'Supports arithmetic, powers, roots, trig functions, and unit conversions.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'A mathematical expression, e.g. "(3 + 5) * 2" or "sqrt(144)"',
        },
      },
      required: ['expression'],
    },
  },
  code_runner: {
    name: 'code_runner',
    description:
      'Run a short JavaScript snippet in a sandbox and return console output and the ' +
      'final return value. Useful for quick computations, data transforms, or logic checks. ' +
      'No network or filesystem access is available inside the sandbox.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Use console.log() to output values.',
        },
      },
      required: ['code'],
    },
  },
  http_request: {
    name: 'http_request',
    description:
      'Make an HTTP request to a public API or website and return the response status ' +
      'and body text. Requests to local/private network addresses are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to request, including https://' },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method, defaults to GET',
        },
        headers: { type: 'object', description: 'Optional request headers' },
        body: { type: 'object', description: 'Optional JSON request body' },
      },
      required: ['url'],
    },
  },
};

/**
 * Converts a canonical agent spec to a ready-to-run Anthropic Messages API request body.
 * Pure client-side version — no round-trip required.
 *
 * System prompt composition order (deterministic):
 *   1. persona
 *   2. systemPrompt
 *   3. skill instruction texts (resolved from the builtin skills catalog)
 *
 * @param {object} canonicalAgent - Output of serializeAgent()
 * @param {object} [opts]
 * @param {number} [opts.maxTokens=4096]
 * @returns {{ model, system, messages, max_tokens, tools }}
 */
export function toAnthropicPayload(canonicalAgent, { maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const parts = [];

  if (canonicalAgent.persona?.trim()) {
    parts.push(canonicalAgent.persona.trim());
  }

  if (canonicalAgent.systemPrompt?.trim()) {
    parts.push(canonicalAgent.systemPrompt.trim());
  }

  for (const skillId of (canonicalAgent.skills ?? [])) {
    const id = typeof skillId === 'string' ? skillId : skillId?.id;
    const instruction = SKILL_INSTRUCTIONS[id];
    if (instruction) parts.push(instruction);
  }

  const tools = (canonicalAgent.tools ?? [])
    .map((id) => TOOL_SCHEMAS[id])
    .filter(Boolean);

  return {
    model: canonicalAgent.model || DEFAULT_MODEL,
    system: parts.join('\n\n'),
    messages: [{ role: 'user', content: '' }],
    max_tokens: maxTokens,
    tools,
  };
}
