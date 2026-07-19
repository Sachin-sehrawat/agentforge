# AgentForge MCP Connector

Exposes AgentForge features as MCP tools so you can manage agents, skills, personas, and templates directly from Claude.

## Available Tools (20)

| Tool | Description |
|------|-------------|
| `agentforge_list_my_agents` | List your own agents + subscribed public agents |
| `agentforge_search_marketplace` | Full-text search the public marketplace (q, category, model, tools, rating, sort) |
| `agentforge_get_agent` | Get full agent details by UUID |
| `agentforge_create_agent` | Create a new agent |
| `agentforge_update_agent` | Update an existing agent |
| `agentforge_delete_agent` | Delete an agent |
| `agentforge_fork_agent` | Fork a public agent into your workspace |
| `agentforge_get_agent_versions` | Get version history of an agent |
| `agentforge_restore_agent_version` | Restore an agent to a previous version |
| `agentforge_list_builtin_skills` | List all built-in platform skills |
| `agentforge_list_my_skills` | List your custom skills |
| `agentforge_create_skill` | Create a custom skill |
| `agentforge_update_skill` | Update a custom skill |
| `agentforge_delete_skill` | Delete a custom skill |
| `agentforge_list_personas` | List all persona categories and their personas |
| `agentforge_create_persona` | Add a persona to an existing category |
| `agentforge_list_templates` | List all agent starter templates |
| `agentforge_create_agent_from_template` | Create an agent pre-configured from a template |
| `agentforge_list_categories` | List agent taxonomy categories |
| `agentforge_list_tools` | List the built-in tool catalog |

## Setup

### 1. Install dependencies

```bash
cd mcp-connector
npm install
```

### 2. Configure Claude Desktop

Add this to your `claude_desktop_config.json`
(Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentforge": {
      "command": "node",
      "args": ["C:/Users/sachi/Documents/Projects/agent-builder/mcp-connector/src/index.js"],
      "env": {
        "AGENTFORGE_BASE_URL": "http://localhost:4000",
        "AGENTFORGE_EMAIL": "your@email.com",
        "AGENTFORGE_PASSWORD": "yourpassword"
      }
    }
  }
}
```

Alternatively, use a pre-obtained JWT token instead of email/password:

```json
"env": {
  "AGENTFORGE_BASE_URL": "http://localhost:4000",
  "AGENTFORGE_JWT_TOKEN": "eyJ..."
}
```

### 3. Restart Claude Desktop

The AgentForge tools will appear in Claude's tool list.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTFORGE_BASE_URL` | No | Backend URL (default: `http://localhost:4000`) |
| `AGENTFORGE_EMAIL` | One of these | Login email |
| `AGENTFORGE_PASSWORD` | One of these | Login password |
| `AGENTFORGE_JWT_TOKEN` | One of these | Pre-obtained JWT (skips login step) |

## Example Prompts

Once connected, you can say things like:

- *"Show me all my agents"*
- *"Search the marketplace for customer support agents"*
- *"Create an agent called 'Code Reviewer' with a system prompt that reviews pull requests..."*
- *"Fork the top-rated research agent into my workspace"*
- *"List all built-in skills and create a custom skill that makes responses more concise"*
- *"Create an agent from the researcher template"*
- *"What personas are available in the Technology category?"*
