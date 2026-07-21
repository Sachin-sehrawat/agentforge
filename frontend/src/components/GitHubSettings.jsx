import React, { useState } from 'react';
import GitHubConnectPanel from './GitHubConnectPanel.jsx';
import McpConnectPanel from './McpConnectPanel.jsx';

export default function GitHubSettings({ isAuthenticated, onOpenAuth }) {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'integrations';
  });

  if (!isAuthenticated) {
    return (
      <div className="settings-page">
        <div className="settings-page-header">
          <h1 className="settings-page-title">Settings</h1>
        </div>
        <div className="settings-auth-gate">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p>Sign in to access settings.</p>
          <button className="btn primary" onClick={() => onOpenAuth?.('login')}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h1 className="settings-page-title">Settings</h1>
      </div>

      <div className="settings-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'integrations'}
          className={`settings-tab${activeTab === 'integrations' ? ' active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          Integrations
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'mcp'}
          className={`settings-tab${activeTab === 'mcp' ? ' active' : ''}`}
          onClick={() => setActiveTab('mcp')}
        >
          Claude (MCP)
        </button>
      </div>

      {activeTab === 'integrations' && (
        <div className="settings-content">
          <section className="settings-section">
            <div className="settings-section-intro">
              <div className="settings-section-icon">
                <svg viewBox="0 0 98 96" width="20" height="20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="settings-section-title">GitHub</h2>
                <p className="settings-section-desc">
                  Connect your GitHub account to sync agent definitions to any repository you own.
                  AgentForge writes Markdown or JSON files — never reads your code for any other
                  purpose. You choose exactly which repository, branch, and path per agent after
                  connecting.
                </p>
                <div className="settings-scope-callout">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>
                    Requests the <code>repo</code> scope so it can commit to both public and private
                    repositories. If you only want to sync to public repos, you can grant{' '}
                    <code>public_repo</code> instead — change this in GitHub's authorized apps settings
                    after connecting.
                  </span>
                </div>
              </div>
            </div>
            <GitHubConnectPanel />
          </section>
        </div>
      )}

      {activeTab === 'mcp' && (
        <div className="settings-content">
          <section className="settings-section">
            <div className="settings-section-intro">
              <div className="settings-section-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 8V4H8" />
                  <rect x="4" y="8" width="16" height="12" rx="2" />
                  <path d="M2 14h2M20 14h2M9 12v2M15 12v2" />
                </svg>
              </div>
              <div>
                <h2 className="settings-section-title">Claude (MCP)</h2>
                <p className="settings-section-desc">
                  AgentForge speaks the Model Context Protocol, so Claude can list, create, edit,
                  fork, and version your agents, skills, personas, and templates directly from a
                  conversation — no copy-pasting JSON back and forth. Set it up once, locally or
                  behind your own HTTPS endpoint.
                </p>
                <div className="settings-scope-callout">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>
                    The connector authenticates as your AgentForge account, so it can only see and
                    change agents you already have access to.
                  </span>
                </div>
              </div>
            </div>
            <McpConnectPanel />
          </section>
        </div>
      )}
    </div>
  );
}
