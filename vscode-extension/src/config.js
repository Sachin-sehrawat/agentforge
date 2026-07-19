const vscode = require('vscode');

function getApiUrl() {
  const url = vscode.workspace.getConfiguration('agentforge').get('apiUrl', 'http://localhost:4000');
  return url.replace(/\/+$/, '');
}

module.exports = { getApiUrl };
