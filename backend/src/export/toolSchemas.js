import { TOOL_CATALOG } from '../tools/toolDefinitions.js';

// Anthropic API tool definitions keyed by tool ID.
// Each value is the exact shape to include in the Messages API `tools` array.
export const TOOL_SCHEMAS = Object.fromEntries(
  Object.entries(TOOL_CATALOG).map(([id, def]) => [id, def.anthropicTool])
);

// OpenAI Chat Completions tool definitions keyed by tool ID.
// Server tools (e.g. web_search) become function stubs — callers must implement the handler.
function toOpenAIFunction(id, def) {
  if (def.kind === 'server') {
    return {
      type: 'function',
      function: {
        name: id,
        description:
          `Search the web for current information. ` +
          `NOTE: This is a stub — "${id}" is an Anthropic built-in with no direct OpenAI native equivalent. ` +
          `You must implement this function and connect it to a search API (e.g. Tavily, SerpAPI, or Bing Search).`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query' },
          },
          required: ['query'],
        },
      },
    };
  }
  return {
    type: 'function',
    function: {
      name: def.anthropicTool.name,
      description: def.anthropicTool.description,
      parameters: def.anthropicTool.input_schema,
    },
  };
}

export const OPENAI_TOOL_SCHEMAS = Object.fromEntries(
  Object.entries(TOOL_CATALOG).map(([id, def]) => [id, toOpenAIFunction(id, def)])
);

// Set of tool IDs that are emitted as stubs (no OpenAI native equivalent).
export const OPENAI_STUB_TOOL_IDS = new Set(
  Object.entries(TOOL_CATALOG)
    .filter(([, def]) => def.kind === 'server')
    .map(([id]) => id)
);
