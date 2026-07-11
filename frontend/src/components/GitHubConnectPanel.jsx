import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function GitHubConnectPanel() {
  const [status, setStatus] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const s = await api.getGitHubStatus();
      setStatus(s);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    load();
    // Pick up ?github=connected / ?github=error from the OAuth callback redirect
    const params = new URLSearchParams(window.location.search);
    const result = params.get('github');
    if (result === 'connected') {
      load();
      // Clean up query string without a page reload
      const clean = new URL(window.location.href);
      clean.searchParams.delete('github');
      clean.searchParams.delete('msg');
      window.history.replaceState({}, '', clean.toString());
    } else if (result === 'error') {
      const msg = params.get('msg') || 'GitHub connection failed.';
      setError(msg);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('github');
      clean.searchParams.delete('msg');
      window.history.replaceState({}, '', clean.toString());
    }
  }, [load]);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.startGitHubConnect();
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Failed to start GitHub connection.');
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect your GitHub account? This will revoke the OAuth token.')) return;
    setError(null);
    setBusy(true);
    try {
      await api.disconnectGitHub();
      setStatus({ connected: false });
    } catch (err) {
      setError(err.message || 'Failed to disconnect GitHub.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gh-panel">
      <div className="gh-panel-header">
        <svg className="gh-logo" viewBox="0 0 98 96" width="22" height="22" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
          />
        </svg>
        <div>
          <h3 className="gh-panel-title">GitHub</h3>
          <p className="gh-panel-subtitle">Connect your GitHub account to enable repository access.</p>
        </div>
      </div>

      {error && (
        <div className="gh-error" role="alert">
          {error}
        </div>
      )}

      {status === null ? (
        <p className="gh-loading">Checking connection…</p>
      ) : status.connected ? (
        <div className="gh-connected">
          <div className="gh-status-row">
            <span className="gh-badge connected">Connected</span>
            <span className="gh-login">
              <strong>{status.githubLogin}</strong>
            </span>
          </div>
          {status.scopes && (
            <p className="gh-scopes">Scopes: <code>{status.scopes}</code></p>
          )}
          <button
            type="button"
            className="btn danger gh-btn"
            onClick={handleDisconnect}
            disabled={busy}
          >
            {busy ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div className="gh-disconnected">
          <span className="gh-badge disconnected">Not connected</span>
          <button
            type="button"
            className="btn primary gh-btn"
            onClick={handleConnect}
            disabled={busy}
          >
            {busy ? 'Redirecting to GitHub…' : 'Connect GitHub'}
          </button>
        </div>
      )}
    </div>
  );
}
