import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const TABS = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
];

const API_KEY_NOTE = 'You supply your own API key at runtime — this payload contains none.';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback: select all in a textarea
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

function CodeBlock({ content, loading, error }) {
  if (loading) return <div className="efm-code-loading">Loading…</div>;
  if (error) return <div className="efm-code-error">{error}</div>;
  if (!content) return null;
  return (
    <div className="efm-code-wrap">
      <CopyButton text={content} />
      <pre className="efm-code-pre"><code>{content}</code></pre>
    </div>
  );
}

function WarningList({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <ul className="efm-warnings">
      {warnings.map((w, i) => (
        <li key={i} className="efm-warning-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {w}
        </li>
      ))}
    </ul>
  );
}

export default function ExportFormatModal({ agent, getMarkdown, onClose }) {
  const [activeTab, setActiveTab] = useState('markdown');
  const [modelOverride, setModelOverride] = useState('');

  // Per-tab state: { content, warnings, loading, error }
  const [tabState, setTabState] = useState({
    markdown: { content: null, warnings: [], loading: false, error: null },
    json: { content: null, warnings: [], loading: false, error: null },
    anthropic: { content: null, warnings: [], loading: false, error: null },
    openai: { content: null, warnings: [], loading: false, error: null },
  });

  const backdropRef = useRef(null);

  // Fetch or generate content when a tab is first activated
  useEffect(() => {
    if (activeTab === 'markdown' && !tabState.markdown.content) {
      const md = getMarkdown(agent);
      setTabState((s) => ({ ...s, markdown: { ...s.markdown, content: md } }));
    }
    if (activeTab === 'json' && !tabState.json.content) {
      const canonical = {
        id: agent.id,
        name: agent.name,
        persona: agent.persona,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        tools: agent.tools,
        skills: agent.skills,
        instructions: agent.instructions,
        tags: agent.tags,
      };
      setTabState((s) => ({ ...s, json: { ...s.json, content: JSON.stringify(canonical, null, 2) } }));
    }
    if (activeTab === 'anthropic' && !tabState.anthropic.content && !tabState.anthropic.loading) {
      fetchFormat('anthropic');
    }
    // OpenAI is triggered by the fetch button, not on tab activate
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchFormat(format, override) {
    setTabState((s) => ({ ...s, [format]: { content: null, warnings: [], loading: true, error: null } }));
    try {
      const result = await api.exportAgentFormat(agent.id, format, override || undefined);
      setTabState((s) => ({
        ...s,
        [format]: { content: JSON.stringify(result.payload, null, 2), warnings: result.warnings ?? [], loading: false, error: null },
      }));
    } catch (err) {
      setTabState((s) => ({ ...s, [format]: { content: null, warnings: [], loading: false, error: err.message } }));
    }
  }

  function handleBackdropClick(e) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  const ts = tabState[activeTab];

  return (
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={`Export ${agent.name || 'agent'}`}
      tabIndex={-1}
    >
      <div className="modal efm-modal">
        <div className="modal-header">
          <h2 className="modal-title">Export — {agent.name || 'Untitled Agent'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="efm-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`efm-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body efm-body">
          <p className="efm-api-key-note">{API_KEY_NOTE}</p>

          {activeTab === 'openai' && (
            <div className="efm-model-row">
              <label className="efm-model-label" htmlFor="efm-model-override">
                OpenAI model name
              </label>
              <div className="efm-model-input-wrap">
                <input
                  id="efm-model-override"
                  className="efm-model-input"
                  type="text"
                  placeholder="e.g. gpt-4o"
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="btn primary small"
                  onClick={() => fetchFormat('openai', modelOverride)}
                  disabled={tabState.openai.loading}
                >
                  {tabState.openai.loading ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          )}

          <WarningList warnings={ts.warnings} />
          <CodeBlock content={ts.content} loading={ts.loading} error={ts.error} />
        </div>
      </div>
    </div>
  );
}
