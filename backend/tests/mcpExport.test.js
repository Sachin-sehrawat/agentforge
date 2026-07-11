/**
 * Unit tests for the MCP server code generator (mcpExport.js).
 * No network or DB calls — pure function tests.
 */
import { describe, it, expect } from 'vitest';
import { generateMcpBundle } from '../src/serialization/mcpExport.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOOL_CATALOG = {
  web_search: {
    kind: 'server',
    label: 'Web Search',
    anthropicTool: { type: 'web_search_20250305', name: 'web_search', description: 'Search the web for information.' },
  },
  calculator: {
    kind: 'client',
    label: 'Calculator',
    anthropicTool: {
      name: 'calculator',
      description: 'Evaluate a mathematical expression.',
      input_schema: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Math expression' },
        },
        required: ['expression'],
      },
    },
  },
  http_request: {
    kind: 'client',
    label: 'API Request',
    anthropicTool: {
      name: 'http_request',
      description: 'Make an HTTP request.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL' },
          method: { type: 'string', enum: ['GET', 'POST'] },
        },
        required: ['url'],
      },
    },
  },
};

const BASE_AGENT = {
  id: 'test-id',
  name: 'Research Agent',
  persona: 'You are a research assistant.',
  systemPrompt: 'Be thorough and cite your sources.',
  model: 'claude-sonnet-4-6',
  tools: ['web_search', 'calculator'],
  skills: [],
  instructions: [],
  tags: [],
};

// ---------------------------------------------------------------------------
// generateMcpBundle — top-level
// ---------------------------------------------------------------------------

describe('generateMcpBundle', () => {
  it('returns all expected files', () => {
    const files = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(Object.keys(files).sort()).toEqual([
      'Dockerfile',
      'README.md',
      'package.json',
      'server.js',
      'server.json',
      'server.py',
    ]);
  });

  it('every file value is a non-empty string', () => {
    const files = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    for (const [name, content] of Object.entries(files)) {
      expect(typeof content, name).toBe('string');
      expect(content.trim().length, name).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// server.js (Node.js MCP server)
// ---------------------------------------------------------------------------

describe('server.js generation', () => {
  it('includes the agent name', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('Research Agent');
  });

  it('includes the system prompt', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('Be thorough and cite your sources.');
  });

  it('imports @modelcontextprotocol/sdk', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('@modelcontextprotocol/sdk');
  });

  it('includes tool names as case entries', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain("case 'web_search'");
    expect(js).toContain("case 'calculator'");
  });

  it('includes tool descriptions in ListTools', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('Search the web for information.');
    expect(js).toContain('Evaluate a mathematical expression.');
  });

  it('handles a tool with an unknown id gracefully', () => {
    const agent = { ...BASE_AGENT, tools: ['mystery_tool'] };
    const { 'server.js': js } = generateMcpBundle(agent, TOOL_CATALOG);
    expect(js).toContain("case 'mystery_tool'");
  });

  it('uses TODO stubs for tool implementations', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('// TODO: implement');
  });

  it('renders the tool input schema in the ListTools handler', () => {
    const { 'server.js': js } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(js).toContain('"expression"');
  });

  it('does not crash on empty tools array', () => {
    const agent = { ...BASE_AGENT, tools: [] };
    expect(() => generateMcpBundle(agent, TOOL_CATALOG)).not.toThrow();
  });

  it('escapes backticks in system prompt', () => {
    const agent = { ...BASE_AGENT, systemPrompt: 'Use `code` blocks.' };
    const { 'server.js': js } = generateMcpBundle(agent, TOOL_CATALOG);
    expect(js).not.toMatch(/[^\\]`code`/);
  });
});

// ---------------------------------------------------------------------------
// server.py (Python MCP server)
// ---------------------------------------------------------------------------

describe('server.py generation', () => {
  it('uses FastMCP', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('FastMCP');
  });

  it('includes the agent name', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('Research Agent');
  });

  it('defines tools with @mcp.tool() decorator', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('@mcp.tool()');
  });

  it('maps JSON types to Python type hints', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('expression: str');
  });

  it('includes tool docstrings from descriptions', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('Evaluate a mathematical expression.');
  });

  it('runs the server in __main__', () => {
    const { 'server.py': py } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(py).toContain('if __name__ == "__main__"');
    expect(py).toContain('mcp.run()');
  });
});

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

describe('package.json generation', () => {
  it('is valid JSON', () => {
    const { 'package.json': pkg } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(() => JSON.parse(pkg)).not.toThrow();
  });

  it('includes the MCP SDK as a dependency', () => {
    const { 'package.json': pkg } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    const parsed = JSON.parse(pkg);
    expect(parsed.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
  });

  it('has type: module', () => {
    const { 'package.json': pkg } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    const parsed = JSON.parse(pkg);
    expect(parsed.type).toBe('module');
  });

  it('slugifies the agent name for the package name', () => {
    const agent = { ...BASE_AGENT, name: 'My Research Agent!' };
    const { 'package.json': pkg } = generateMcpBundle(agent, TOOL_CATALOG);
    const parsed = JSON.parse(pkg);
    expect(parsed.name).toBe('my-research-agent-');
  });
});

// ---------------------------------------------------------------------------
// server.json (manifest)
// ---------------------------------------------------------------------------

describe('server.json generation', () => {
  it('is valid JSON', () => {
    const { 'server.json': manifest } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(() => JSON.parse(manifest)).not.toThrow();
  });

  it('includes agent name and tools', () => {
    const { 'server.json': manifest } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    const parsed = JSON.parse(manifest);
    expect(parsed.name).toBe('Research Agent');
    expect(parsed.tools).toHaveLength(2);
    expect(parsed.tools[0].name).toBe('web_search');
    expect(parsed.tools[1].name).toBe('calculator');
  });

  it('includes the system prompt', () => {
    const { 'server.json': manifest } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    const parsed = JSON.parse(manifest);
    expect(parsed.systemPrompt).toBe('Be thorough and cite your sources.');
  });

  it('has schemaVersion: 1', () => {
    const { 'server.json': manifest } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    const parsed = JSON.parse(manifest);
    expect(parsed.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dockerfile
// ---------------------------------------------------------------------------

describe('Dockerfile generation', () => {
  it('uses a node base image', () => {
    const { Dockerfile } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(Dockerfile).toMatch(/FROM node:/);
  });

  it('copies package.json and runs npm install', () => {
    const { Dockerfile } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(Dockerfile).toContain('COPY package.json');
    expect(Dockerfile).toContain('npm install');
  });

  it('starts the server with CMD node server.js', () => {
    const { Dockerfile } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(Dockerfile).toContain('CMD ["node", "server.js"]');
  });
});

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

describe('README.md generation', () => {
  it('includes the agent name as the title', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).toContain('# Research Agent');
  });

  it('includes both Node.js and Python setup sections', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).toContain('Node.js setup');
    expect(readme).toContain('Python setup');
  });

  it('includes a Claude Desktop config snippet', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).toContain('claude_desktop_config.json');
    expect(readme).toContain('mcpServers');
  });

  it('includes the system prompt in the About section', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).toContain('Be thorough and cite your sources.');
  });

  it('lists the tools', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).toContain('web_search');
    expect(readme).toContain('calculator');
  });

  it('includes env var section when http_request tool is present', () => {
    const agent = { ...BASE_AGENT, tools: ['http_request'] };
    const { 'README.md': readme } = generateMcpBundle(agent, TOOL_CATALOG);
    expect(readme).toContain('Environment Variables');
  });

  it('omits env var section when http_request tool is absent', () => {
    const { 'README.md': readme } = generateMcpBundle(BASE_AGENT, TOOL_CATALOG);
    expect(readme).not.toContain('Environment Variables');
  });
});
