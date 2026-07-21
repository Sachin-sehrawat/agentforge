import React, { useState } from 'react';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — ignore
    }
  }
  return (
    <button className="efm-copy-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CodeBlock({ content }) {
  return (
    <div className="efm-code-wrap">
      <CopyButton text={content} />
      <pre className="efm-code-pre"><code>{content}</code></pre>
    </div>
  );
}

const HTTP_URL_SNIPPET = 'https://agentforge.ddns.net/mcp?token=7032a74eb42d4e5cfef5eec9e740cd63b122515633f8adecd1eeef7d30cbe137';

export default function McpConnectPanel() {
  return (
    <div className="settings-mcp-panel">
      <ol className="settings-mcp-steps">
        <li>
          <strong>Get the connector.</strong> AgentForge exposes a Model Context Protocol server
          that gives Claude tools to list, create, update, fork, and version your agents, skills,
          personas, and templates — all callable directly from a conversation.
        </li>
        <li>
          <strong>Add it in Claude.</strong> Go to{' '}
          <strong>Settings → Connectors → Add custom connector</strong> and paste this URL:
          <CodeBlock content={HTTP_URL_SNIPPET} />
          <span className="settings-mcp-note">
            Claude's custom connector form only supports OAuth for built-in auth, so the token is
            passed as a <code>?token=</code> query parameter instead — leave the OAuth Client
            ID/Secret fields blank.
          </span>
        </li>
        <li>
          <strong>Restart Claude</strong> and start a new conversation. Enable the AgentForge
          connector from the tools picker, then ask things like &ldquo;list my AgentForge
          agents&rdquo; or &ldquo;create a customer-support agent from the template
          gallery.&rdquo;
        </li>
      </ol>
    </div>
  );
}
