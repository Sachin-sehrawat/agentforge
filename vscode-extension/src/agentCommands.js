const vscode = require('vscode');
const path = require('path');
const api = require('./api');
const { generateMarkdown, fetchExportContext } = require('./markdown');
const { handleUnauthorized } = require('./auth');

function slugify(name) {
  return (name || 'agent').replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function firstWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}

async function requireToken(authStore) {
  const token = await authStore.getToken();
  if (!token) {
    vscode.window.showWarningMessage('AgentForge: sign in first.', 'Sign In').then((choice) => {
      if (choice) vscode.commands.executeCommand('agentforge.signIn');
    });
    return null;
  }
  return token;
}

async function viewAgent(item, authStore, agentsProvider) {
  const token = await authStore.getToken();
  try {
    const agent = await api.getAgent(item.agent.id, token);
    const { allSkills, personaLookup } = await fetchExportContext(token);
    const md = generateMarkdown(agent, allSkills, personaLookup);
    const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(authStore, agentsProvider);
    } else {
      vscode.window.showErrorMessage(`AgentForge: could not load agent (${err.message})`);
    }
  }
}

async function exportMarkdown(item, authStore, agentsProvider) {
  const token = await requireToken(authStore);
  if (!token) return;

  try {
    const agent = await api.getAgent(item.agent.id, token);
    const { allSkills, personaLookup } = await fetchExportContext(token);
    const md = generateMarkdown(agent, allSkills, personaLookup);

    const defaultDir = firstWorkspaceFolder();
    const defaultName = `${slugify(agent.name)}.md`;
    const defaultUri = defaultDir
      ? vscode.Uri.file(path.join(defaultDir, defaultName))
      : vscode.Uri.file(defaultName);

    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ['md'] },
      title: `Export "${agent.name}" as Markdown`,
    });
    if (!target) return;

    await vscode.workspace.fs.writeFile(target, Buffer.from(md, 'utf8'));
    api.recordExportEvent(agent.id, token).catch(() => {});

    const choice = await vscode.window.showInformationMessage(
      `AgentForge: exported "${agent.name}" to ${path.basename(target.fsPath)}`,
      'Open File'
    );
    if (choice) {
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc);
    }
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(authStore, agentsProvider);
    } else {
      vscode.window.showErrorMessage(`AgentForge: Markdown export failed (${err.message})`);
    }
  }
}

async function exportMcp(item, authStore, agentsProvider) {
  const token = await requireToken(authStore);
  if (!token) return;

  try {
    const { buffer, filename } = await api.exportMcp(item.agent.id, token);

    const defaultDir = firstWorkspaceFolder();
    const defaultUri = defaultDir
      ? vscode.Uri.file(path.join(defaultDir, filename))
      : vscode.Uri.file(filename);

    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Zip archive': ['zip'] },
      title: `Export "${item.agent.name}" as MCP server`,
    });
    if (!target) return;

    await vscode.workspace.fs.writeFile(target, buffer);
    vscode.window.showInformationMessage(
      `AgentForge: exported MCP server to ${path.basename(target.fsPath)}`
    );
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(authStore, agentsProvider);
      return;
    }
    const detail = Array.isArray(err.details) && err.details.length ? `: ${err.details.join('; ')}` : '';
    vscode.window.showErrorMessage(`AgentForge: MCP export failed (${err.message})${detail}`);
  }
}

async function deleteAgent(item, authStore, agentsProvider) {
  const token = await requireToken(authStore);
  if (!token) return;

  const confirm = await vscode.window.showWarningMessage(
    `Delete agent "${item.agent.name}"? This cannot be undone.`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') return;

  try {
    await api.deleteAgent(item.agent.id, token);
    agentsProvider.refresh();
    vscode.window.showInformationMessage(`AgentForge: deleted "${item.agent.name}"`);
  } catch (err) {
    if (err.status === 401) {
      handleUnauthorized(authStore, agentsProvider);
    } else {
      vscode.window.showErrorMessage(`AgentForge: delete failed (${err.message})`);
    }
  }
}

module.exports = { viewAgent, exportMarkdown, exportMcp, deleteAgent };
