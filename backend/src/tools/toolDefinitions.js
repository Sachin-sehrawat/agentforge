import { runCalculator } from './calculator.js';
import { runCode } from './codeRunner.js';
import { runHttpRequest } from './httpRequest.js';

/**
 * Central catalog of tools that agents can be wired up to.
 *
 * - "server" tools are executed by Anthropic itself (e.g. web_search) -
 *   we just need to include their definition in the `tools` array.
 * - "client" tools are executed here in our backend, then the result
 *   is sent back to the model as a tool_result message.
 */
export const TOOL_CATALOG = {
  web_search: {
    kind: 'server',
    label: 'Web Search',
    anthropicTool: { type: 'web_search_20250305', name: 'web_search' },
  },

  calculator: {
    kind: 'client',
    label: 'Calculator',
    anthropicTool: {
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
    execute: runCalculator,
  },

  code_runner: {
    kind: 'client',
    label: 'Code Runner',
    anthropicTool: {
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
    execute: runCode,
  },

  http_request: {
    kind: 'client',
    label: 'API Request',
    anthropicTool: {
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
    execute: runHttpRequest,
  },
};

export const TOOL_IDS = Object.keys(TOOL_CATALOG);
