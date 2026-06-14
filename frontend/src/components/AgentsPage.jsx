import React, { useState } from 'react';
import { TOOL_META } from '../toolMeta.jsx';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatPill({ count, label, color }) {
  if (!count) return null;
  return (
    <span className="agent-card-stat" style={{ '--stat-color': color }}>
      {count} {label}{count !== 1 ? 's' : ''}
    </span>
  );
}

function AgentCard({ agent, onOpen, onDownload, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (confirmDelete) {
      onDelete(agent.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  }

  const toolCount = (agent.tools || []).length;
  const skillCount = (agent.skills || []).length;
  const instrCount = (agent.instructions || []).length;
  const hasStats = toolCount + skillCount + instrCount > 0;

  return (
    <div className="agent-card">
      <div className="agent-card-body">
        <div className="agent-card-name">{agent.name || 'Untitled'}</div>
        {agent.persona && (
          <div className="agent-card-persona">{agent.persona}</div>
        )}
        {agent.systemPrompt && (
          <div className="agent-card-prompt">{agent.systemPrompt}</div>
        )}
        {hasStats && (
          <div className="agent-card-stats">
            <StatPill count={toolCount} label="tool" color="#6366f1" />
            <StatPill count={skillCount} label="skill" color="#8b5cf6" />
            <StatPill count={instrCount} label="instruction" color="#10b981" />
          </div>
        )}
        {toolCount > 0 && (
          <div className="agent-card-tools">
            {agent.tools.slice(0, 5).map((id) => {
              const meta = TOOL_META[id];
              return (
                <span
                  key={id}
                  className="agent-card-tool-chip"
                  style={{ '--tool-color': meta ? meta.color : '#999' }}
                  title={meta ? meta.blurb : id}
                >
                  {meta ? meta.label : id}
                </span>
              );
            })}
            {agent.tools.length > 5 && (
              <span className="agent-card-tool-chip more">+{agent.tools.length - 5}</span>
            )}
          </div>
        )}
      </div>
      <div className="agent-card-footer">
        <span className="agent-card-time">
          Updated {timeAgo(agent.updatedAt)}
        </span>
        <div className="agent-card-actions">
          <button className="btn subtle" onClick={() => onDownload(agent)} title="Download as Markdown">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            MD
          </button>
          <button
            className={`btn${confirmDelete ? ' danger' : ' subtle'}`}
            onClick={handleDelete}
            title={confirmDelete ? 'Click again to confirm' : 'Delete agent'}
          >
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
          <button className="btn primary" onClick={() => onOpen(agent.id)}>
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage({ savedAgents, onOpen, onDownload, onDelete, onNew }) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q
    ? savedAgents.filter((a) =>
        a.name.toLowerCase().includes(q) || (a.persona || '').toLowerCase().includes(q)
      )
    : savedAgents;

  return (
    <div className="agents-page">
      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Saved Agents</h1>
          <p className="agents-page-sub">
            {savedAgents.length === 0
              ? 'No agents yet. Build one in the editor.'
              : `${savedAgents.length} agent${savedAgents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="agents-page-header-actions">
          <div className="filter-wrap" style={{ width: 240 }}>
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="filter-input"
              type="text"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="filter-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <button className="btn primary" onClick={onNew}>
            + New Agent
          </button>
        </div>
      </div>

      {savedAgents.length === 0 ? (
        <div className="agents-empty">
          <div className="agents-empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="8" y="8" width="32" height="32" rx="4" />
              <line x1="24" y1="8" x2="24" y2="8" />
              <line x1="24" y1="16" x2="24" y2="24" />
              <line x1="16" y1="32" x2="32" y2="32" />
              <circle cx="18" cy="24" r="2" fill="currentColor" stroke="none" />
              <circle cx="30" cy="24" r="2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="agents-empty-text">No saved agents yet.</p>
          <button className="btn primary" onClick={onNew}>Build your first agent</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="filter-empty">No agents match "{search}"</p>
      ) : (
        <div className="agents-grid">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onOpen={onOpen}
              onDownload={onDownload}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
