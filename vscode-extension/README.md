# AgentForge for VS Code

Browse, manage, and export your [AgentForge](../README.md) agents without leaving VS Code.

## Features

- **My Agents** view in the activity bar — lists agents you own or have subscribed to.
- **View Agent** — click an agent to open its generated Markdown spec in a preview tab.
- **Export as Markdown** — write the agent's `.md` spec to a file in your workspace.
- **Export as MCP Server** — download the agent as a ready-to-run MCP server `.zip`.
- **Delete Agent** — remove an agent you own, with confirmation.

Creating and editing agents still happens in the AgentForge web app's visual builder;
this extension is for browsing and exporting agents you've already built there.

## Requirements

- An AgentForge backend reachable from this machine (defaults to `http://localhost:4000`,
  e.g. via `docker compose up` in the repo root).
- An AgentForge account (sign up in the web app first).

## Setup

1. Set `agentforge.apiUrl` in your VS Code settings if your backend isn't on `localhost:4000`.
2. Open the AgentForge view in the activity bar and click **Sign In**.
3. Your agents appear in the **My Agents** list.

## Running from source

```
cd vscode-extension
npm install   # none currently required, but keeps the door open for deps
```

Press `F5` in this folder to launch an Extension Development Host with the extension loaded.

Your JWT is stored in VS Code's encrypted `SecretStorage` — never written to settings or disk in plaintext.
