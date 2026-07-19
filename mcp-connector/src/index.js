#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { AgentForgeClient } from './client.js';

const BASE_URL = process.env.AGENTFORGE_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.AGENTFORGE_EMAIL;
const PASSWORD = process.env.AGENTFORGE_PASSWORD;
const TOKEN = process.env.AGENTFORGE_JWT_TOKEN;

const client = new AgentForgeClient(BASE_URL, TOKEN || null);

const TOOLS = [
  // ── Agents ──────────────────────────────────────────────────────────────
  {
    name: 'agentforge_list_my_agents',
    description: 'List the current user\'s own agents plus any subscribed public agents.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_search_marketplace',
    description: 'Search the public AgentForge marketplace. Returns paginated results with optional full-text search, model filter, tool filter, category filter, minimum rating, and sort order.',
    inputSchema: {
      type: 'object',
      properties: {
        q:          { type: 'string',  description: 'Full-text search query' },
        categoryId: { type: 'string',  description: 'Filter by category UUID' },
        model:      { type: 'string',  description: 'Filter by model name (e.g. claude-sonnet-4-6)' },
        tools:      { type: 'string',  description: 'Comma-separated list of tool IDs to filter by' },
        minRating:  { type: 'number',  description: 'Minimum average star rating (1-5)' },
        sort:       { type: 'string',  enum: ['recent', 'popular', 'top_rated', 'most_forked'], description: 'Sort order (default: recent)' },
        page:       { type: 'integer', description: 'Page number (default: 1)' },
        pageSize:   { type: 'integer', description: 'Items per page, max 50 (default: 20)' },
      },
    },
  },
  {
    name: 'agentforge_get_agent',
    description: 'Get full details of a single agent by its UUID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Agent UUID' },
      },
    },
  },
  {
    name: 'agentforge_create_agent',
    description: 'Create a new agent. Returns the created agent object.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:         { type: 'string', description: 'Agent name' },
        persona:      { type: 'string', description: 'Short persona descriptor (e.g. "Friendly customer support rep")' },
        systemPrompt: { type: 'string', description: 'Detailed system prompt / instructions for the agent' },
        model:        { type: 'string', description: 'Claude model ID (default: claude-sonnet-4-6)' },
        tools:        { type: 'array',  items: { type: 'string' }, description: 'Array of tool IDs to enable' },
        skills:       { type: 'array',  items: { type: 'string' }, description: 'Array of skill IDs to attach' },
        instructions: { type: 'array',  items: { type: 'object' }, description: 'Structured instruction steps' },
        visibility:   { type: 'string', enum: ['public', 'private'], description: 'Visibility (default: private)' },
        tags:         { type: 'array',  items: { type: 'string' }, description: 'Freeform tags' },
        categoryId:   { type: 'string', description: 'Category UUID to classify the agent' },
      },
    },
  },
  {
    name: 'agentforge_update_agent',
    description: 'Update an existing agent by UUID. Only include fields you want to change.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id:           { type: 'string', description: 'Agent UUID' },
        name:         { type: 'string' },
        persona:      { type: 'string' },
        systemPrompt: { type: 'string' },
        model:        { type: 'string' },
        tools:        { type: 'array', items: { type: 'string' } },
        skills:       { type: 'array', items: { type: 'string' } },
        instructions: { type: 'array', items: { type: 'object' } },
        visibility:   { type: 'string', enum: ['public', 'private'] },
        tags:         { type: 'array', items: { type: 'string' } },
        categoryId:   { type: 'string' },
      },
    },
  },
  {
    name: 'agentforge_delete_agent',
    description: 'Permanently delete an agent by UUID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Agent UUID' },
      },
    },
  },
  {
    name: 'agentforge_fork_agent',
    description: 'Fork a public agent into your own workspace. Returns the new forked agent.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'UUID of the agent to fork' },
      },
    },
  },
  {
    name: 'agentforge_get_agent_versions',
    description: 'Get the full version history of an agent (immutable snapshots).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Agent UUID' },
      },
    },
  },
  {
    name: 'agentforge_restore_agent_version',
    description: 'Restore an agent to a previous version snapshot.',
    inputSchema: {
      type: 'object',
      required: ['id', 'versionNo'],
      properties: {
        id:        { type: 'string',  description: 'Agent UUID' },
        versionNo: { type: 'integer', description: 'Version number to restore' },
      },
    },
  },

  // ── Skills ───────────────────────────────────────────────────────────────
  {
    name: 'agentforge_list_builtin_skills',
    description: 'List all built-in skills (personality, reasoning, output-format, utility behaviors). These are read-only platform skills.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_list_my_skills',
    description: 'List the current user\'s custom skills.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_create_skill',
    description: 'Create a custom skill that can be attached to agents.',
    inputSchema: {
      type: 'object',
      required: ['label', 'instruction'],
      properties: {
        label:       { type: 'string', description: 'Display name for the skill' },
        description: { type: 'string', description: 'Short description of what this skill does' },
        instruction: { type: 'string', description: 'Detailed system-prompt text injected when the skill is active' },
        color:       { type: 'string', description: 'Hex color for UI display (default: #6366f1)' },
        visibility:  { type: 'string', enum: ['public', 'private'], description: 'Visibility (default: private)' },
      },
    },
  },
  {
    name: 'agentforge_update_skill',
    description: 'Update an existing custom skill by UUID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id:          { type: 'string', description: 'Skill UUID' },
        label:       { type: 'string' },
        description: { type: 'string' },
        instruction: { type: 'string' },
        color:       { type: 'string' },
        visibility:  { type: 'string', enum: ['public', 'private'] },
      },
    },
  },
  {
    name: 'agentforge_delete_skill',
    description: 'Delete a custom skill by UUID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Skill UUID' },
      },
    },
  },

  // ── Personas ─────────────────────────────────────────────────────────────
  {
    name: 'agentforge_list_personas',
    description: 'List all persona categories and their individual personas (e.g. Technology → Software Engineer, Data Scientist, DevOps Engineer).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_create_persona',
    description: 'Add a new persona to an existing persona category.',
    inputSchema: {
      type: 'object',
      required: ['categoryId', 'name', 'persona', 'systemPrompt'],
      properties: {
        categoryId:   { type: 'string', description: 'UUID of the persona category to add this persona to' },
        name:         { type: 'string', description: 'Persona display name (e.g. "DevOps Engineer")' },
        tagline:      { type: 'string', description: 'Short tagline shown in the UI' },
        persona:      { type: 'string', description: 'Short descriptor string (e.g. "systems reliability expert")' },
        systemPrompt: { type: 'string', description: 'Full system prompt for this persona' },
      },
    },
  },

  // ── Templates ────────────────────────────────────────────────────────────
  {
    name: 'agentforge_list_templates',
    description: 'List all agent templates (starter configurations for common use-cases like researcher, customer-service, code-assistant, etc.).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_create_agent_from_template',
    description: 'Create a new agent pre-configured from an existing template. Optionally override the name.',
    inputSchema: {
      type: 'object',
      required: ['templateId'],
      properties: {
        templateId: { type: 'string', description: 'Template ID (e.g. "researcher", "customer-service", "code-assistant")' },
        name:       { type: 'string', description: 'Optional override name for the new agent' },
      },
    },
  },

  // ── Discovery ────────────────────────────────────────────────────────────
  {
    name: 'agentforge_list_categories',
    description: 'List all agent taxonomy categories (e.g. marketing, support, research, productivity, education, developer-tools).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agentforge_list_tools',
    description: 'List the built-in tool catalog — all tools that can be enabled on an agent (e.g. web-search, calculator, code-interpreter).',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(name, args) {
  switch (name) {
    // ── Agents ──────────────────────────────────────────────────────────
    case 'agentforge_list_my_agents':
      return client.get('/api/agents/mine');

    case 'agentforge_search_marketplace': {
      const params = new URLSearchParams();
      if (args.q)          params.set('q', args.q);
      if (args.categoryId) params.set('categoryId', args.categoryId);
      if (args.model)      params.set('model', args.model);
      if (args.tools)      params.set('tools', args.tools);
      if (args.minRating)  params.set('minRating', String(args.minRating));
      if (args.sort)       params.set('sort', args.sort);
      if (args.page)       params.set('page', String(args.page));
      if (args.pageSize)   params.set('pageSize', String(args.pageSize));
      const qs = params.toString();
      return client.get(`/api/agents/marketplace${qs ? `?${qs}` : ''}`);
    }

    case 'agentforge_get_agent':
      return client.get(`/api/agents/${args.id}`);

    case 'agentforge_create_agent': {
      const { id: _id, ...body } = args;
      return client.post('/api/agents', body);
    }

    case 'agentforge_update_agent': {
      const { id, ...body } = args;
      return client.put(`/api/agents/${id}`, body);
    }

    case 'agentforge_delete_agent':
      return client.del(`/api/agents/${args.id}`);

    case 'agentforge_fork_agent':
      return client.post(`/api/agents/${args.id}/fork`, {});

    case 'agentforge_get_agent_versions':
      return client.get(`/api/agents/${args.id}/versions`);

    case 'agentforge_restore_agent_version':
      return client.post(`/api/agents/${args.id}/versions/${args.versionNo}/restore`, {});

    // ── Skills ──────────────────────────────────────────────────────────
    case 'agentforge_list_builtin_skills':
      return client.get('/api/builtin-skills');

    case 'agentforge_list_my_skills':
      return client.get('/api/skills/mine');

    case 'agentforge_create_skill': {
      const { id: _id, ...body } = args;
      return client.post('/api/skills', body);
    }

    case 'agentforge_update_skill': {
      const { id, ...body } = args;
      return client.put(`/api/skills/${id}`, body);
    }

    case 'agentforge_delete_skill':
      return client.del(`/api/skills/${args.id}`);

    // ── Personas ────────────────────────────────────────────────────────
    case 'agentforge_list_personas':
      return client.get('/api/personas');

    case 'agentforge_create_persona': {
      const { categoryId, ...persona } = args;
      return client.post(`/api/personas/${categoryId}/personas`, persona);
    }

    // ── Templates ────────────────────────────────────────────────────────
    case 'agentforge_list_templates':
      return client.get('/api/templates');

    case 'agentforge_create_agent_from_template': {
      const template = await client.get(`/api/templates/${args.templateId}`);
      if (!template || !template.definition) {
        throw new Error(`Template "${args.templateId}" not found or has no definition.`);
      }
      const agentBody = { ...template.definition };
      if (args.name) agentBody.name = args.name;
      return client.post('/api/agents', agentBody);
    }

    // ── Discovery ────────────────────────────────────────────────────────
    case 'agentforge_list_categories':
      return client.get('/api/categories');

    case 'agentforge_list_tools':
      return client.get('/api/tools');

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function createServer() {
  const server = new Server(
    { name: 'agentforge', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await callTool(name, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function authenticate() {
  if (!TOKEN && EMAIL && PASSWORD) {
    try {
      await client.login(EMAIL, PASSWORD);
      console.error(`[AgentForge MCP] Authenticated as ${EMAIL}`);
    } catch (e) {
      console.error(`[AgentForge MCP] Login failed: ${e.message}`);
      console.error('[AgentForge MCP] Continuing without auth — only public endpoints will work.');
    }
  } else if (TOKEN) {
    console.error('[AgentForge MCP] Using AGENTFORGE_JWT_TOKEN');
  } else {
    console.error('[AgentForge MCP] No auth credentials set. Set AGENTFORGE_EMAIL + AGENTFORGE_PASSWORD or AGENTFORGE_JWT_TOKEN.');
  }
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentForge MCP] Server running on stdio');
}

async function runHttp() {
  const { default: express } = await import('express');
  const PORT = Number(process.env.PORT || 3939);
  const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

  if (!AUTH_TOKEN) {
    console.error('[AgentForge MCP] WARNING: MCP_AUTH_TOKEN is not set — the endpoint will accept unauthenticated requests. Set MCP_AUTH_TOKEN before exposing this on a public VM.');
  }

  const app = express();
  app.use(express.json());

  const transports = {};

  app.use('/mcp', (req, res, next) => {
    if (!AUTH_TOKEN) return next();
    const header = req.headers['authorization'] || '';
    if (header === `Bearer ${AUTH_TOKEN}`) return next();
    if (req.query.token === AUTH_TOKEN) return next();
    res.status(401).json({ error: 'Unauthorized' });
  });

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => { transports[sid] = transport; },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: no valid session ID provided' },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId && transports[sessionId];
    if (!transport) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  app.listen(PORT, () => {
    console.error(`[AgentForge MCP] Server running on http://0.0.0.0:${PORT}/mcp`);
  });
}

async function main() {
  await authenticate();
  if (process.env.MCP_TRANSPORT === 'http') {
    await runHttp();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error('[AgentForge MCP] Fatal:', err);
  process.exit(1);
});
