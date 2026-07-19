const vscode = require('vscode');
const { AuthStore, signIn, signOut } = require('./auth');
const { AgentsProvider } = require('./agentsProvider');
const { viewAgent, exportMarkdown, exportMcp, deleteAgent } = require('./agentCommands');

async function activate(context) {
  const authStore = new AuthStore(context);
  await authStore.restoreContextKey();

  const agentsProvider = new AgentsProvider(authStore);
  vscode.window.registerTreeDataProvider('agentforgeAgents', agentsProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentforge.signIn', async () => {
      const ok = await signIn(authStore);
      if (ok) agentsProvider.refresh();
    }),

    vscode.commands.registerCommand('agentforge.signOut', async () => {
      await signOut(authStore);
      agentsProvider.refresh();
    }),

    vscode.commands.registerCommand('agentforge.refreshAgents', () => {
      agentsProvider.refresh();
    }),

    vscode.commands.registerCommand('agentforge.viewAgent', (item) =>
      viewAgent(item, authStore, agentsProvider)
    ),

    vscode.commands.registerCommand('agentforge.exportMarkdown', (item) =>
      exportMarkdown(item, authStore, agentsProvider)
    ),

    vscode.commands.registerCommand('agentforge.exportMcp', (item) =>
      exportMcp(item, authStore, agentsProvider)
    ),

    vscode.commands.registerCommand('agentforge.deleteAgent', (item) =>
      deleteAgent(item, authStore, agentsProvider)
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
