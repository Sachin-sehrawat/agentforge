import { SKILLS } from '../data/skills.js';

const SKILL_INSTRUCTIONS = Object.fromEntries(SKILLS.map((s) => [s.id, s.instruction]));

// OpenAI Chat Completions tool schemas — keep in sync with
// backend/src/tools/toolDefinitions.js and backend/src/export/toolSchemas.js.
const OPENAI_TOOL_SCHEMAS = {
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information. ' +
        'NOTE: This is a stub — "web_search" is an Anthropic built-in with no direct OpenAI native equivalent. ' +
        'You must implement this function and connect it to a search API (e.g. Tavily, SerpAPI, or Bing Search).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  calculator: {
    type: 'function',
    function: {
      name: 'calculator',
      description:
        'Evaluate a mathematical expression and return the numeric result. ' +
        'Supports arithmetic, powers, roots, trig functions, and unit conversions.',
      parameters: {
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
  },
  code_runner: {
    type: 'function',
    function: {
      name: 'code_runner',
      description:
        'Run a short JavaScript snippet in a sandbox and return console output and the ' +
        'final return value. Useful for quick computations, data transforms, or logic checks. ' +
        'No network or filesystem access is available inside the sandbox.',
      parameters: {
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
  },
  http_request: {
    type: 'function',
    function: {
      name: 'http_request',
      description:
        'Make an HTTP request to a public API or website and return the response status ' +
        'and body text. Requests to local/private network addresses are blocked.',
      parameters: {
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
  },
};

const STUB_TOOL_IDS = new Set(['web_search']);

/**
 * Converts a canonical agent spec to an OpenAI Chat Completions request body.
 * Pure client-side version — no round-trip required.
 *
 * Provider gaps are surfaced as warnings rather than silently dropped or guessed:
 * - Model: uses modelOverride if provided; otherwise emits __MODEL_REQUIRED__ + warning.
 * - Server tools (e.g. web_search): emitted as function stubs + warning.
 *
 * System prompt composition order (deterministic):
 *   1. persona
 *   2. systemPrompt
 *   3. skill instruction texts (resolved from the builtin skills catalog)
 *
 * @param {object} canonicalAgent - Output of serializeAgent()
 * @param {object} [opts]
 * @param {string} [opts.modelOverride] - OpenAI model name (e.g. 'gpt-4o')
 * @returns {{ payload: object, warnings: string[] }}
 */
export function toOpenAIPayload(canonicalAgent, { modelOverride } = {}) {
  const warnings = [];

  let model;
  if (modelOverride) {
    model = modelOverride;
  } else {
    warnings.push(
      'No OpenAI model specified. Set modelOverride to an OpenAI model name (e.g. "gpt-4o"). ' +
      'The canonical agent model field contains a Claude model ID and cannot be forwarded to OpenAI.'
    );
    model = '__MODEL_REQUIRED__';
  }

  const parts = [];
  if (canonicalAgent.persona?.trim()) parts.push(canonicalAgent.persona.trim());
  if (canonicalAgent.systemPrompt?.trim()) parts.push(canonicalAgent.systemPrompt.trim());
  for (const skillId of (canonicalAgent.skills ?? [])) {
    const id = typeof skillId === 'string' ? skillId : skillId?.id;
    const instruction = SKILL_INSTRUCTIONS[id];
    if (instruction) parts.push(instruction);
  }
  const systemContent = parts.join('\n\n');

  const tools = [];
  for (const toolId of (canonicalAgent.tools ?? [])) {
    const schema = OPENAI_TOOL_SCHEMAS[toolId];
    if (!schema) continue;
    tools.push(schema);
    if (STUB_TOOL_IDS.has(toolId)) {
      warnings.push(
        `Tool "${toolId}" is an Anthropic built-in with no OpenAI native equivalent. ` +
        `It has been emitted as a function stub — you must implement the function handler ` +
        `and connect it to an appropriate API.`
      );
    }
  }

  const payload = {
    model,
    messages: [{ role: 'system', content: systemContent }],
    tools,
  };

  return { payload, warnings };
}
