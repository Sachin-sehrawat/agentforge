import { TOOL_CATALOG } from '../tools/toolDefinitions.js';

// Anthropic API tool definitions keyed by tool ID.
// Each value is the exact shape to include in the Messages API `tools` array.
export const TOOL_SCHEMAS = Object.fromEntries(
  Object.entries(TOOL_CATALOG).map(([id, def]) => [id, def.anthropicTool])
);
