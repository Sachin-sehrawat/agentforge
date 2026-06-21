import React, { useEffect, useState } from 'react';
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

function Badge({ label, color }) {
  return (
    <span className="agent-card-stat" style={{ '--stat-color': color }}>
      {label}
    </span>
  );
}

function AgentCard({ agent, onOpen, onDownload, onDelete, onSubscribe }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subscribed, setSubscribed] = useState(Boolean(agent.isSubscribed));

  // Keep local state in sync when parent refreshes the agent list
  useEffect(() => {
    setSubscribed(Boolean(agent.isSubscribed));
  }, [agent.isSubscribed]);

  async function handleSubscribe() {
    const wasSubscribed = subscribed;
    setSubscribed(!wasSubscribed);
    try {
      await onSubscribe(agent);
    } catch {
      setSubscribed(wasSubscribed);
    }
  }

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
        <div className="agent-card-stats">
          {agent.isOwned && <Badge label="Owned" color="#6366f1" />}
          {agent.isSubscribed && !agent.isOwned && <Badge label="Subscribed" color="#8b5cf6" />}
          {hasStats && (
            <>
              <StatPill count={toolCount} label="tool" color="#6366f1" />
              <StatPill count={skillCount} label="skill" color="#8b5cf6" />
              <StatPill count={instrCount} label="instruction" color="#10b981" />
            </>
          )}
        </div>
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
          {onDelete && (
            <button
              className={`btn${confirmDelete ? ' danger' : ' subtle'}`}
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm' : 'Delete agent'}
            >
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
          )}
          {onSubscribe && (
            <button
              className="btn subtle"
              onClick={handleSubscribe}
              title={subscribed ? 'Remove from My Agents' : 'Add to My Agents'}
            >
              {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </button>
          )}
          <button className="btn primary" onClick={() => onOpen(agent.id)}>
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentsList({ agents, search, onOpen, onDownload, onDelete, canDelete, onSubscribe, emptyNode }) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? agents.filter((a) =>
        (a.name || '').toLowerCase().includes(q) || (a.persona || '').toLowerCase().includes(q)
      )
    : agents;

  if (agents.length === 0) return emptyNode;
  if (filtered.length === 0) return <p className="filter-empty">No agents match &ldquo;{search}&rdquo;</p>;

  return (
    <div className="agents-grid">
      {filtered.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={canDelete && canDelete(agent) ? onDelete : null}
          onSubscribe={onSubscribe || null}
        />
      ))}
    </div>
  );
}

function TabContent({ agents, loading, error, search, onOpen, onDownload, onDelete, canDelete, onSubscribe, emptyNode }) {
  if (loading) {
    return <div className="agents-loading">Loading…</div>;
  }
  if (error) {
    return <p className="agents-error">Failed to load agents: {error}</p>;
  }
  return (
    <AgentsList
      agents={agents}
      search={search}
      onOpen={onOpen}
      onDownload={onDownload}
      onDelete={onDelete}
      canDelete={canDelete}
      onSubscribe={onSubscribe}
      emptyNode={emptyNode}
    />
  );
}

export default function AgentsPage({
  publicAgents = [],
  myAgents = [],
  loadingPublic = false,
  loadingMine = false,
  errorPublic = null,
  errorMine = null,
  isAuthenticated = false,
  onOpen,
  onDownload,
  onDelete,
  onNew,
  onOpenAuth,
  onSubscribe,
}) {
  const [activeTab, setActiveTab] = useState('agents');
  const [search, setSearch] = useState('');

  const isMyTab = activeTab === 'mine';

  function handleMyAgentsTabClick() {
    if (!isAuthenticated) {
      onOpenAuth?.('login');
    } else {
      setActiveTab('mine');
    }
  }

  const totalShown = isMyTab ? myAgents.length : publicAgents.length;

  // Wraps onSubscribe with an auth gate — anonymous clicks open the login modal
  // and throw to roll back the AgentCard optimistic toggle.
  function handlePublicSubscribe(agent) {
    if (!isAuthenticated) {
      onOpenAuth?.('login');
      throw new Error('auth-required');
    }
    return onSubscribe?.(agent);
  }

  return (
    <div className="agents-page">
      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Agents</h1>
          <p className="agents-page-sub">
            {isMyTab
              ? myAgents.length === 0
                ? 'Your saved and subscribed agents.'
                : `${myAgents.length} agent${myAgents.length !== 1 ? 's' : ''}`
              : publicAgents.length === 0
              ? 'Publicly shared agents.'
              : `${publicAgents.length} public agent${publicAgents.length !== 1 ? 's' : ''}`}
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

      <div className="agents-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={!isMyTab}
          className={`agents-tab${!isMyTab ? ' active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          Agents
        </button>
        <button
          role="tab"
          aria-selected={isMyTab}
          className={`agents-tab${isMyTab ? ' active' : ''}`}
          onClick={handleMyAgentsTabClick}
        >
          My Agents
        </button>
      </div>

      {isMyTab && !isAuthenticated ? (
        <div className="agents-empty">
          <div className="agents-empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="24" cy="16" r="8" />
              <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" />
            </svg>
          </div>
          <p className="agents-empty-text">Sign in to see your saved and subscribed agents.</p>
          <button className="btn primary" onClick={() => onOpenAuth?.('login')}>Sign in</button>
        </div>
      ) : isMyTab ? (
        <TabContent
          agents={myAgents}
          loading={loadingMine}
          error={errorMine}
          search={search}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={onDelete}
          canDelete={(agent) => agent.isOwned}
          emptyNode={
            <div className="agents-empty">
              <div className="agents-empty-icon">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="8" width="32" height="32" rx="4" />
                  <line x1="24" y1="16" x2="24" y2="24" />
                  <line x1="16" y1="32" x2="32" y2="32" />
                  <circle cx="18" cy="24" r="2" fill="currentColor" stroke="none" />
                  <circle cx="30" cy="24" r="2" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <p className="agents-empty-text">No agents yet.</p>
              <button className="btn primary" onClick={onNew}>Build your first agent</button>
            </div>
          }
        />
      ) : (
        <TabContent
          agents={publicAgents}
          loading={loadingPublic}
          error={errorPublic}
          search={search}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={null}
          onSubscribe={handlePublicSubscribe}
          emptyNode={
            <div className="agents-empty">
              <div className="agents-empty-icon">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="8" width="32" height="32" rx="4" />
                  <line x1="24" y1="16" x2="24" y2="24" />
                  <line x1="16" y1="32" x2="32" y2="32" />
                  <circle cx="18" cy="24" r="2" fill="currentColor" stroke="none" />
                  <circle cx="30" cy="24" r="2" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <p className="agents-empty-text">No public agents yet.</p>
              <button className="btn primary" onClick={onNew}>Build your first agent</button>
            </div>
          }
        />
      )}
    </div>
  );
}
