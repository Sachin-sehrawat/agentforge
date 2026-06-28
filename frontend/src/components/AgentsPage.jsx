import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TOOL_META } from '../toolMeta.jsx';
import { api } from '../api.js';

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

function AgentCard({ agent, onOpen, onDownload, onDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, isSelected, onToggleSelect }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [subscribed, setSubscribed] = useState(Boolean(agent.isSubscribed));
  const [visibility, setVisibility] = useState(agent.visibility || 'private');

  // Keep local state in sync when parent refreshes the agent list
  useEffect(() => {
    setSubscribed(Boolean(agent.isSubscribed));
  }, [agent.isSubscribed]);

  useEffect(() => {
    setVisibility(agent.visibility || 'private');
  }, [agent.visibility]);

  async function handleSubscribe() {
    const wasSubscribed = subscribed;
    setSubscribed(!wasSubscribed);
    try {
      await onSubscribe(agent);
    } catch {
      setSubscribed(wasSubscribed);
    }
  }

  async function handleToggleVisibility() {
    const isPrivate = visibility === 'private';
    if (isPrivate && !confirmPublish) {
      setConfirmPublish(true);
      setTimeout(() => setConfirmPublish(false), 3000);
      return;
    }
    setConfirmPublish(false);
    const prevVis = visibility;
    const nextVis = isPrivate ? 'public' : 'private';
    setVisibility(nextVis);
    try {
      await onToggleVisibility({ ...agent, visibility: prevVis });
    } catch {
      setVisibility(prevVis);
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

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      await onDuplicate(agent);
    } finally {
      setDuplicating(false);
    }
  }

  const toolCount = (agent.tools || []).length;
  const skillCount = (agent.skills || []).length;
  const instrCount = (agent.instructions || []).length;
  const hasStats = toolCount + skillCount + instrCount > 0;

  return (
    <div className={`agent-card${isSelected ? ' agent-card--selected' : ''}`}>
      {onToggleSelect && (
        <label className="agent-card-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="agent-card-checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
          />
        </label>
      )}
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
          {agent.isOwned && (
            <Badge
              label={visibility === 'public' ? 'Public' : 'Private'}
              color={visibility === 'public' ? '#10b981' : '#9ca3af'}
            />
          )}
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
          {onToggleVisibility && (
            <button
              className={`btn${confirmPublish ? ' danger' : ' subtle'}`}
              onClick={handleToggleVisibility}
              title={
                confirmPublish
                  ? 'Click again — agent will be visible to everyone'
                  : visibility === 'public'
                  ? 'Make private'
                  : 'Make public'
              }
            >
              {confirmPublish
                ? 'Publish?'
                : visibility === 'public'
                ? 'Make Private'
                : 'Make Public'}
            </button>
          )}
          {onDuplicate && (
            <button
              className="btn subtle"
              onClick={handleDuplicate}
              disabled={duplicating}
              title="Duplicate this agent"
            >
              {duplicating ? 'Copying…' : 'Duplicate'}
            </button>
          )}
          {onDelete && (
            <button
              className={`btn${confirmDelete ? ' danger' : ' subtle'}`}
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm' : 'Delete agent'}
            >
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
          )}
          {onAnalytics && (
            <button
              className="btn subtle"
              onClick={() => onAnalytics(agent)}
              title="View analytics"
            >
              Analytics
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

function AgentsList({ agents, search, toolsFilter, tagsFilter, onClearFilters, onOpen, onDownload, onDelete, canDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, emptyNode, selectedIds, onToggleSelect, onToggleSelectAll }) {
  const q = search.trim().toLowerCase();
  const filtered = agents.filter((a) => {
    if (q && !(
      (a.name || '').toLowerCase().includes(q) ||
      (a.persona || '').toLowerCase().includes(q)
    )) return false;
    if (toolsFilter && toolsFilter.size > 0) {
      const agentTools = a.tools || [];
      if (![...toolsFilter].some((t) => agentTools.includes(t))) return false;
    }
    if (tagsFilter && tagsFilter.size > 0) {
      const agentTags = a.tags || [];
      if (![...tagsFilter].some((t) => agentTags.includes(t))) return false;
    }
    return true;
  });

  const selectAllRef = useRef(null);
  const filteredIds = filtered.map((a) => a.id);
  const isSelectable = Boolean(onToggleSelect);
  const allSelected = isSelectable && filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = isSelectable && filteredIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  if (agents.length === 0) return emptyNode;
  if (filtered.length === 0) {
    return (
      <div className="filter-empty-wrap">
        <p className="filter-empty">No agents match the active filters.</p>
        {onClearFilters && (
          <button className="btn subtle small" onClick={onClearFilters}>Clear filters</button>
        )}
      </div>
    );
  }

  return (
    <>
      {isSelectable && (
        <div className="bulk-select-all-row">
          <label className="bulk-select-all-label">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleSelectAll(filteredIds)}
            />
            {allSelected
              ? `Deselect all ${filtered.length}`
              : `Select all ${filtered.length} visible`}
          </label>
        </div>
      )}
      <div className="agents-grid">
        {filtered.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onOpen={onOpen}
            onDownload={onDownload}
            onDelete={canDelete && canDelete(agent) ? onDelete : null}
            onSubscribe={onSubscribe || null}
            onToggleVisibility={onToggleVisibility && agent.isOwned ? onToggleVisibility : null}
            onAnalytics={onAnalytics && agent.isOwned ? onAnalytics : null}
            onDuplicate={onDuplicate && agent.isOwned ? onDuplicate : null}
            isSelected={isSelectable ? selectedIds.has(agent.id) : undefined}
            onToggleSelect={isSelectable ? () => onToggleSelect(agent.id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function TabContent({ agents, loading, error, search, toolsFilter, tagsFilter, onClearFilters, onOpen, onDownload, onDelete, canDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, emptyNode, selectedIds, onToggleSelect, onToggleSelectAll }) {
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
      toolsFilter={toolsFilter}
      tagsFilter={tagsFilter}
      onClearFilters={onClearFilters}
      onOpen={onOpen}
      onDownload={onDownload}
      onDelete={onDelete}
      canDelete={canDelete}
      onSubscribe={onSubscribe}
      onToggleVisibility={onToggleVisibility}
      onAnalytics={onAnalytics}
      onDuplicate={onDuplicate}
      emptyNode={emptyNode}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
    />
  );
}

// Card shown in the Favorites tab — optimistic unfavorite with revert, plus
// quick View, Fork, and Subscribe actions.
function FavoriteCard({ agent, onView, onFork, onSubscribe, onUnfavorite }) {
  const [localAgent, setLocalAgent] = useState(agent);
  const [busyFav, setBusyFav] = useState(false);
  const [busySubscribe, setBusySubscribe] = useState(false);
  const [busyFork, setBusyFork] = useState(false);

  useEffect(() => { setLocalAgent(agent); }, [agent]);

  const toolCount = (localAgent.tools || []).length;

  async function handleUnfavorite() {
    setBusyFav(true);
    try {
      await onUnfavorite(localAgent.id);
    } catch {
      // revert is handled by the parent re-fetching; nothing to revert locally
    } finally {
      setBusyFav(false);
    }
  }

  async function handleSubscribe() {
    const wasSubscribed = localAgent.isSubscribed;
    setLocalAgent((p) => ({ ...p, isSubscribed: !wasSubscribed }));
    setBusySubscribe(true);
    try {
      await onSubscribe(localAgent, !wasSubscribed);
    } catch {
      setLocalAgent((p) => ({ ...p, isSubscribed: wasSubscribed }));
    } finally {
      setBusySubscribe(false);
    }
  }

  async function handleFork() {
    setBusyFork(true);
    try {
      await onFork(localAgent.id);
      setLocalAgent((p) => ({ ...p, forkCount: (p.forkCount || 0) + 1 }));
    } catch {
      // silent
    } finally {
      setBusyFork(false);
    }
  }

  return (
    <div className="agent-card mp-card">
      <div className="agent-card-body">
        <div className="mp-card-header">
          <div className="agent-card-name">{localAgent.name || 'Untitled'}</div>
          {localAgent.ownerDisplayName && (
            <span className="mp-owner">by {localAgent.ownerDisplayName}</span>
          )}
        </div>
        {localAgent.persona && (
          <div className="agent-card-persona">{localAgent.persona}</div>
        )}
        <div className="mp-card-meta">
          {localAgent.forkCount > 0 && (
            <span className="mp-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
                <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>
                <line x1="12" y1="12" x2="12" y2="15"/>
              </svg>
              {localAgent.forkCount}
            </span>
          )}
          {localAgent.favoriteCount > 0 && (
            <span className="mp-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {localAgent.favoriteCount}
            </span>
          )}
        </div>
        {toolCount > 0 && (
          <div className="agent-card-tools">
            {localAgent.tools.slice(0, 5).map((id) => {
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
            {localAgent.tools.length > 5 && (
              <span className="agent-card-tool-chip more">+{localAgent.tools.length - 5}</span>
            )}
          </div>
        )}
      </div>
      <div className="agent-card-footer">
        <div className="agent-card-actions">
          <button className="btn primary" onClick={() => onView(localAgent.id)}>View</button>
          {!localAgent.isOwner && (
            <button
              className="btn subtle"
              onClick={handleSubscribe}
              disabled={busySubscribe}
              title={localAgent.isSubscribed ? 'Remove from My Agents' : 'Add to My Agents'}
            >
              {localAgent.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            </button>
          )}
          {!localAgent.isOwner && (
            <button
              className="btn subtle"
              onClick={handleFork}
              disabled={busyFork}
              title="Fork this agent"
            >
              Fork
            </button>
          )}
          <button
            className="btn subtle mp-btn-fav active"
            onClick={handleUnfavorite}
            disabled={busyFav}
            title="Remove from favorites"
          >
            ♥
          </button>
        </div>
      </div>
    </div>
  );
}

function FavoritesTab({ agents, loading, error, onView, onFork, onSubscribe, onUnfavorite }) {
  if (loading) return <div className="agents-loading">Loading…</div>;
  if (error) return <p className="agents-error">Failed to load favorites: {error}</p>;
  if (agents.length === 0) {
    return (
      <div className="agents-empty">
        <div className="agents-empty-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M36 8.5a9 9 0 0 0-12.73 0L24 9.77l-.27-.27A9 9 0 0 0 11 22.27L24 35.5 37 22.27A9 9 0 0 0 36 8.5z"/>
          </svg>
        </div>
        <p className="agents-empty-text">No favorites yet. Bookmark agents from the Marketplace.</p>
      </div>
    );
  }
  return (
    <div className="agents-grid">
      {agents.map((agent) => (
        <FavoriteCard
          key={agent.id}
          agent={agent}
          onView={onView}
          onFork={onFork}
          onSubscribe={onSubscribe}
          onUnfavorite={onUnfavorite}
        />
      ))}
    </div>
  );
}

export default function AgentsPage({
  publicAgents = [],
  myAgents = [],
  favoriteAgents = [],
  loadingPublic = false,
  loadingMine = false,
  loadingFavorites = false,
  errorPublic = null,
  errorMine = null,
  errorFavorites = null,
  isAuthenticated = false,
  onOpen,
  onDownload,
  onDelete,
  onNew,
  onOpenAuth,
  onSubscribe,
  onToggleVisibility,
  onFork,
  onUnfavorite,
  onAnalytics,
  onDuplicate,
  onBulkDelete,
  onBulkExport,
}) {
  const [activeTab, setActiveTab] = useState('agents');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeletePrimed, setBulkDeletePrimed] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toolsFilter, setToolsFilter] = useState(() => new Set());
  const [tagsFilter, setTagsFilter] = useState(() => new Set());
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const toolPickerRef = useRef(null);
  const tagPickerRef = useRef(null);

  const isFavTab = activeTab === 'favorites';
  const isMyTab = activeTab === 'mine';

  const availableTools = useMemo(() => {
    const seen = new Set();
    for (const a of myAgents) {
      for (const t of (a.tools || [])) seen.add(t);
    }
    return [...seen];
  }, [myAgents]);

  const availableTags = useMemo(() => {
    const seen = new Set();
    for (const a of myAgents) {
      for (const t of (a.tags || [])) seen.add(t);
    }
    return [...seen].sort();
  }, [myAgents]);

  // Clear selection and filters when switching tabs
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkDeletePrimed(false);
    setExportPickerOpen(false);
    setToolsFilter(new Set());
    setTagsFilter(new Set());
    setToolPickerOpen(false);
    setTagPickerOpen(false);
  }, [activeTab]);

  // Close pickers on outside click
  useEffect(() => {
    function handleClick(e) {
      if (toolPickerRef.current && !toolPickerRef.current.contains(e.target)) {
        setToolPickerOpen(false);
      }
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target)) {
        setTagPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleClearAllFilters() {
    setSearch('');
    setToolsFilter(new Set());
    setTagsFilter(new Set());
  }

  function toggleToolFilter(id) {
    setToolsFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTagFilter(tag) {
    setTagsFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkDeletePrimed(false);
    setExportPickerOpen(false);
  }

  function toggleSelectAll(filteredIds) {
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
    setBulkDeletePrimed(false);
    setExportPickerOpen(false);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkDeletePrimed(false);
    setExportPickerOpen(false);
  }

  async function handleBulkDelete() {
    if (!bulkDeletePrimed) {
      setBulkDeletePrimed(true);
      return;
    }
    setBulkBusy(true);
    setBulkDeletePrimed(false);
    try {
      await onBulkDelete([...selectedIds]);
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkExport(format) {
    setExportPickerOpen(false);
    setBulkBusy(true);
    try {
      await onBulkExport([...selectedIds], format);
    } finally {
      setBulkBusy(false);
    }
  }

  function handleMyAgentsTabClick() {
    if (!isAuthenticated) {
      onOpenAuth?.('login');
    } else {
      setActiveTab('mine');
    }
  }

  function handleFavTabClick() {
    if (!isAuthenticated) {
      onOpenAuth?.('login');
    } else {
      setActiveTab('favorites');
    }
  }

  function subTitle() {
    if (isFavTab) {
      if (loadingFavorites) return 'Loading…';
      return favoriteAgents.length === 0
        ? 'Your bookmarked agents.'
        : `${favoriteAgents.length} favorited agent${favoriteAgents.length !== 1 ? 's' : ''}`;
    }
    if (isMyTab) {
      return myAgents.length === 0 ? 'Your saved and subscribed agents.' : `${myAgents.length} agent${myAgents.length !== 1 ? 's' : ''}`;
    }
    return publicAgents.length === 0 ? 'Publicly shared agents.' : `${publicAgents.length} public agent${publicAgents.length !== 1 ? 's' : ''}`;
  }

  // Wraps onSubscribe with an auth gate — anonymous clicks open the login modal
  // and throw to roll back the AgentCard optimistic toggle.
  function handlePublicSubscribe(agent) {
    if (!isAuthenticated) {
      onOpenAuth?.('login');
      throw new Error('auth-required');
    }
    return onSubscribe?.(agent);
  }

  async function handleFavSubscribe(agent, subscribing) {
    if (subscribing) {
      await api.subscribeAgent(agent.id);
    } else {
      await api.unsubscribeAgent(agent.id);
    }
  }

  const selectionCount = selectedIds.size;

  return (
    <div className="agents-page">
      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Agents</h1>
          <p className="agents-page-sub">{subTitle()}</p>
        </div>
        <div className="agents-page-header-actions">
          {!isFavTab && (
            <div className="filter-wrap filter-wrap--header">
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
          )}
          <button className="btn primary" onClick={onNew}>
            + New Agent
          </button>
        </div>
      </div>

      <div className="agents-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'agents'}
          className={`agents-tab${activeTab === 'agents' ? ' active' : ''}`}
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
        <button
          role="tab"
          aria-selected={isFavTab}
          className={`agents-tab${isFavTab ? ' active' : ''}`}
          onClick={handleFavTabClick}
        >
          Favorites
          {isAuthenticated && favoriteAgents.length > 0 && (
            <span className="agents-tab-badge">{favoriteAgents.length}</span>
          )}
        </button>
      </div>

      {isMyTab && isAuthenticated && (availableTools.length > 0 || availableTags.length > 0) && (
        <div className="mp-filters my-agents-filters">
          {availableTools.length > 0 && (
            <div className="mp-filter-group" ref={toolPickerRef}>
              <label className="mp-filter-label">Tools</label>
              <button
                type="button"
                className={`mp-select mp-tool-btn${toolsFilter.size ? ' has-value' : ''}`}
                onClick={() => { setToolPickerOpen((v) => !v); setTagPickerOpen(false); }}
              >
                {toolsFilter.size ? `${toolsFilter.size} tool${toolsFilter.size !== 1 ? 's' : ''} selected` : 'Any tools'}
                <svg className="mp-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {toolPickerOpen && (
                <div className="mp-tool-picker">
                  <div className="mp-tool-picker-header">
                    <span>Filter by tool</span>
                    {toolsFilter.size > 0 && (
                      <button className="mp-clear-link" onClick={() => setToolsFilter(new Set())}>Clear</button>
                    )}
                  </div>
                  <div className="mp-tool-picker-list">
                    {availableTools.map((id) => {
                      const meta = TOOL_META[id];
                      return (
                        <label key={id} className="mp-tool-option">
                          <input
                            type="checkbox"
                            checked={toolsFilter.has(id)}
                            onChange={() => toggleToolFilter(id)}
                          />
                          <span className="mp-tool-swatch" style={{ background: meta?.color || '#999' }} />
                          {meta?.label || id}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {availableTags.length > 0 && (
            <div className="mp-filter-group" ref={tagPickerRef}>
              <label className="mp-filter-label">Tags</label>
              <button
                type="button"
                className={`mp-select mp-tool-btn${tagsFilter.size ? ' has-value' : ''}`}
                onClick={() => { setTagPickerOpen((v) => !v); setToolPickerOpen(false); }}
              >
                {tagsFilter.size ? `${tagsFilter.size} tag${tagsFilter.size !== 1 ? 's' : ''} selected` : 'Any tags'}
                <svg className="mp-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {tagPickerOpen && (
                <div className="mp-tool-picker">
                  <div className="mp-tool-picker-header">
                    <span>Filter by tag</span>
                    {tagsFilter.size > 0 && (
                      <button className="mp-clear-link" onClick={() => setTagsFilter(new Set())}>Clear</button>
                    )}
                  </div>
                  <div className="mp-tool-picker-list">
                    {availableTags.map((tag) => (
                      <label key={tag} className="mp-tool-option">
                        <input
                          type="checkbox"
                          checked={tagsFilter.has(tag)}
                          onChange={() => toggleTagFilter(tag)}
                        />
                        {tag}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(toolsFilter.size > 0 || tagsFilter.size > 0) && (
            <button
              className="mp-clear-link"
              style={{ alignSelf: 'flex-end', paddingBottom: '7px' }}
              onClick={handleClearAllFilters}
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {isMyTab && selectionCount > 0 && (
        <div className="bulk-toolbar">
          <span className="bulk-toolbar-count">{selectionCount} selected</span>
          <button className="btn subtle small" onClick={clearSelection} disabled={bulkBusy}>
            Clear
          </button>
          <div className="bulk-toolbar-actions">
            {exportPickerOpen ? (
              <>
                <span className="bulk-toolbar-label">Export as:</span>
                <button
                  className="btn subtle small"
                  onClick={() => handleBulkExport('markdown')}
                  disabled={bulkBusy}
                >
                  Markdown
                </button>
                <button
                  className="btn subtle small"
                  onClick={() => handleBulkExport('json')}
                  disabled={bulkBusy}
                >
                  JSON
                </button>
                <button
                  className="btn subtle small"
                  onClick={() => setExportPickerOpen(false)}
                  disabled={bulkBusy}
                >
                  ✕
                </button>
              </>
            ) : (
              <button
                className="btn subtle small"
                onClick={() => { setBulkDeletePrimed(false); setExportPickerOpen(true); }}
                disabled={bulkBusy}
              >
                Export
              </button>
            )}
            <button
              className={`btn small${bulkDeletePrimed ? ' danger' : ' subtle'}`}
              onClick={handleBulkDelete}
              disabled={bulkBusy}
            >
              {bulkBusy && bulkDeletePrimed
                ? 'Deleting…'
                : bulkDeletePrimed
                ? `Confirm delete ${selectionCount}?`
                : 'Delete selected'}
            </button>
          </div>
        </div>
      )}

      {isFavTab && !isAuthenticated ? (
        <div className="agents-empty">
          <div className="agents-empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="24" cy="16" r="8" />
              <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" />
            </svg>
          </div>
          <p className="agents-empty-text">Sign in to see your favorite agents.</p>
          <button className="btn primary" onClick={() => onOpenAuth?.('login')}>Sign in</button>
        </div>
      ) : isFavTab ? (
        <FavoritesTab
          agents={favoriteAgents}
          loading={loadingFavorites}
          error={errorFavorites}
          onView={onOpen}
          onFork={onFork}
          onSubscribe={handleFavSubscribe}
          onUnfavorite={onUnfavorite}
        />
      ) : isMyTab && !isAuthenticated ? (
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
          toolsFilter={toolsFilter}
          tagsFilter={tagsFilter}
          onClearFilters={handleClearAllFilters}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={onDelete}
          canDelete={(agent) => agent.isOwned}
          onToggleVisibility={onToggleVisibility}
          onAnalytics={onAnalytics}
          onDuplicate={onDuplicate}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
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
          onClearFilters={() => setSearch('')}
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
