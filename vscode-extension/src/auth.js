const vscode = require('vscode');
const { login: apiLogin } = require('./api');

const TOKEN_KEY = 'agentforge.token';
const USER_KEY = 'agentforge.user';

// Wraps VS Code's encrypted SecretStorage so the JWT never touches settings.json
// or a plaintext file on disk.
class AuthStore {
  constructor(context) {
    this.context = context;
  }

  async getToken() {
    return this.context.secrets.get(TOKEN_KEY);
  }

  async getUser() {
    const raw = await this.context.secrets.get(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async setSession(token, user) {
    await this.context.secrets.store(TOKEN_KEY, token);
    await this.context.secrets.store(USER_KEY, JSON.stringify(user));
    await vscode.commands.executeCommand('setContext', 'agentforge.authenticated', true);
  }

  async clearSession() {
    await this.context.secrets.delete(TOKEN_KEY);
    await this.context.secrets.delete(USER_KEY);
    await vscode.commands.executeCommand('setContext', 'agentforge.authenticated', false);
  }

  async restoreContextKey() {
    const token = await this.getToken();
    await vscode.commands.executeCommand('setContext', 'agentforge.authenticated', !!token);
  }
}

// Prompts for email/password, calls the backend, and persists the session on success.
async function signIn(authStore) {
  const email = await vscode.window.showInputBox({
    prompt: 'AgentForge account email',
    placeHolder: 'you@example.com',
    ignoreFocusOut: true,
    validateInput: (v) => (v.includes('@') ? null : 'Enter a valid email address'),
  });
  if (!email) return false;

  const password = await vscode.window.showInputBox({
    prompt: 'AgentForge account password',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v ? null : 'Password is required'),
  });
  if (!password) return false;

  try {
    const { token, user } = await apiLogin(email, password);
    await authStore.setSession(token, user);
    vscode.window.showInformationMessage(`AgentForge: signed in as ${user.email}`);
    return true;
  } catch (err) {
    vscode.window.showErrorMessage(`AgentForge sign-in failed: ${err.message}`);
    return false;
  }
}

async function signOut(authStore) {
  await authStore.clearSession();
  vscode.window.showInformationMessage('AgentForge: signed out');
}

// The backend issues 15-minute access tokens with no refresh flow by design
// (see docs/auth.md) — a token stored in SecretStorage WILL go stale mid-session.
// Call this from any catch block that sees err.status === 401 instead of
// surfacing a raw "Request failed (401)" message.
async function handleUnauthorized(authStore, agentsProvider) {
  await authStore.clearSession();
  if (agentsProvider) agentsProvider.refresh();

  const choice = await vscode.window.showWarningMessage(
    'AgentForge: your session expired. Sign in again?',
    'Sign In'
  );
  if (!choice) return false;

  const ok = await signIn(authStore);
  if (ok && agentsProvider) agentsProvider.refresh();
  return ok;
}

module.exports = { AuthStore, signIn, signOut, handleUnauthorized };
