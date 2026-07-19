const vscode = require('vscode');
const api = require('./api');
const { handleUnauthorized } = require('./auth');

class AgentTreeItem extends vscode.TreeItem {
  constructor(agent) {
    super(agent.name || 'Untitled Agent', vscode.TreeItemCollapsibleState.None);
    this.agent = agent;
    this.id = agent.id;
    this.contextValue = 'agentforgeAgent';
    this.description = describeAgent(agent);
    this.tooltip = agent.persona || agent.systemPrompt || agent.name;
    this.iconPath = new vscode.ThemeIcon(agent.visibility === 'public' ? 'globe' : 'lock');
    this.command = {
      command: 'agentforge.viewAgent',
      title: 'View Agent',
      arguments: [this],
    };
  }
}

function describeAgent(agent) {
  const toolCount = (agent.tools || []).length;
  const parts = [`${toolCount} tool${toolCount === 1 ? '' : 's'}`];
  if (!agent.isOwned) parts.push('subscribed');
  return parts.join(' · ');
}

class AgentsProvider {
  constructor(authStore) {
    this.authStore = authStore;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element) return [];

    const token = await this.authStore.getToken();
    if (!token) return [];

    try {
      const agents = await api.listMyAgents(token);
      return agents.map((agent) => new AgentTreeItem(agent));
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized(this.authStore, this);
      } else {
        vscode.window.showErrorMessage(`AgentForge: could not load agents (${err.message})`);
      }
      return [];
    }
  }
}

module.exports = { AgentsProvider, AgentTreeItem };
