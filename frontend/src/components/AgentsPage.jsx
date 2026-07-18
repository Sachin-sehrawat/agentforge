import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOOL_META } from '../toolMeta.jsx';
import { api } from '../api.js';

// ── GitHub sync status badge ─────────────────────────────────────────────────

function SyncStatusBadge({ status, onClick }) {
  if (!status) return null;
  if (status.state === 'ok') {
    return (
      <button type="button" className="gh-sync-badge gh-sync-badge--ok" onClick={onClick} title="GitHub sync OK — click to configure">
        <span className="gh-sync-dot" />
        {status.fileUrl ? (
          <a
            href={status.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Synced {status.syncedAt ? timeAgo(status.syncedAt) : ''}
          </a>
        ) : (
          <span>Synced {status.syncedAt ? timeAgo(status.syncedAt) : ''}</span>
        )}
      </button>
    );
  }
  if (status.state === 'conflict') {
    return (
      <button type="button" className="gh-sync-badge gh-sync-badge--conflict" onClick={onClick} title="Remote conflict — click to review">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        Conflict
        {status.fileUrl && (
          <a
            href={status.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            View on GitHub
          </a>
        )}
      </button>
    );
  }
  if (status.state === 'error') {
    return (
      <button type="button" className="gh-sync-badge gh-sync-badge--error" onClick={onClick} title="Sync error — click to configure">
        <span className="gh-sync-dot" />
        {status.errorMessage || 'Sync error'}
      </button>
    );
  }
  if (status.state === 'pending') {
    return (
      <span className="gh-sync-badge gh-sync-badge--pending">
        <svg className="gh-sync-spinner" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Syncing…
      </span>
    );
  }
  return null;
}

// ── Per-agent GitHub sync config modal ───────────────────────────────────────

function AgentGitHubSyncModal({ agent, githubLogin, onClose }) {
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [reposError, setReposError] = useState(null);

  const [selectedRepo, setSelectedRepo] = useState('');
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [pathTemplate, setPathTemplate] = useState('agents/{slug}.md');
  const [format, setFormat] = useState('markdown');
  const [autoSync, setAutoSync] = useState(false);

  const [syncStatus, setSyncStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const agentSlug = (agent.name || 'agent').replace(/[^a-z0-9]/gi, '-').toLowerCase();

  // Load current sync config and status on mount
  useEffect(() => {
    let cancelled = false;
    api.getAgentSyncConfig(agent.id)
      .then((cfg) => {
        if (cancelled) return;
        if (cfg) {
          const [owner, repo] = (cfg.repo_full_name || '').split('/');
          setSelectedRepo(cfg.repo_full_name || '');
          setSelectedBranch(cfg.branch || '');
          setPathTemplate(cfg.path_template || 'agents/{slug}.md');
          setFormat(cfg.format || 'markdown');
          setAutoSync(Boolean(cfg.auto_sync));
          if (owner && repo) loadBranches(cfg.repo_full_name);
        }
      })
      .catch(() => {});

    api.getAgentSyncStatus(agent.id)
      .then((s) => { if (!cancelled) setSyncStatus(s); })
      .catch(() => { if (!cancelled) setSyncStatus(null); })
      .finally(() => { if (!cancelled) setLoadingStatus(false); });

    return () => { cancelled = true; };
  }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load repos on mount
  useEffect(() => {
    setLoadingRepos(true);
    api.getGitHubRepos()
      .then((data) => setRepos(data || []))
      .catch((err) => setReposError(err.message || 'Failed to load repositories'))
      .finally(() => setLoadingRepos(false));
  }, []);

  function loadBranches(repoFullName) {
    if (!repoFullName) { setBranches([]); return; }
    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return;
    setLoadingBranches(true);
    setBranches([]);
    api.getGitHubBranches(owner, repo)
      .then((data) => setBranches(data || []))
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }

  function handleRepoChange(e) {
    const repo = e.target.value;
    setSelectedRepo(repo);
    setSelectedBranch('');
    loadBranches(repo);
  }

  async function handleSave() {
    if (!selectedRepo || !selectedBranch) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await api.setAgentSyncConfig(agent.id, {
        repo_full_name: selectedRepo,
        branch: selectedBranch,
        path_template: pathTemplate || 'agents/{slug}.md',
        format,
        auto_sync: autoSync,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSaveError(null);
    try {
      const result = await api.triggerAgentSync(agent.id);
      setSyncStatus(result || { state: 'pending' });
      // Poll for result
      const poll = setInterval(async () => {
        try {
          const s = await api.getAgentSyncStatus(agent.id);
          if (s && s.state !== 'pending') {
            setSyncStatus(s);
            clearInterval(poll);
            setSyncing(false);
          }
        } catch {
          clearInterval(poll);
          setSyncing(false);
        }
      }, 2000);
      setTimeout(() => { clearInterval(poll); setSyncing(false); }, 30000);
    } catch (err) {
      setSaveError(err.message || 'Sync failed');
      setSyncing(false);
    }
  }

  async function handleRemoveConfig() {
    if (!window.confirm('Remove GitHub sync configuration for this agent?')) return;
    setRemoving(true);
    try {
      await api.deleteAgentSyncConfig(agent.id);
      setSelectedRepo('');
      setSelectedBranch('');
      setPathTemplate('agents/{slug}.md');
      setFormat('markdown');
      setAutoSync(false);
      setSyncStatus(null);
    } catch (err) {
      setSaveError(err.message || 'Failed to remove configuration');
    } finally {
      setRemoving(false);
    }
  }

  const previewPath = pathTemplate
    .replace('{slug}', agentSlug)
    .replace('{name}', agent.name || 'agent')
    .replace('{id}', agent.id || 'id');

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gh-sync-modal" role="dialog" aria-modal="true" aria-label="GitHub sync configuration">
        <div className="gh-sync-modal-header">
          <div className="gh-sync-modal-title-row">
            <svg viewBox="0 0 98 96" width="18" height="18" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
            </svg>
            <h2 className="gh-sync-modal-title">GitHub Sync</h2>
          </div>
          <div className="gh-sync-modal-subtitle">
            <strong>{agent.name || 'Untitled'}</strong>
            {githubLogin && <span className="gh-sync-modal-account"> · {githubLogin}</span>}
          </div>
          <button type="button" className="gh-sync-modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="gh-sync-modal-body">
          {/* Sync status */}
          {!loadingStatus && syncStatus && (
            <div className={`gh-sync-status-row gh-sync-status-row--${syncStatus.state}`}>
              {syncStatus.state === 'ok' && (
                <>
                  <span className="gh-sync-dot" />
                  <span>
                    Synced to{' '}
                    {syncStatus.fileUrl ? (
                      <a href={syncStatus.fileUrl} target="_blank" rel="noopener noreferrer">
                        {syncStatus.repo}/{syncStatus.path}
                      </a>
                    ) : (
                      <>{syncStatus.repo}/{syncStatus.path}</>
                    )}
                    {syncStatus.syncedAt && <> · {timeAgo(syncStatus.syncedAt)}</>}
                  </span>
                </>
              )}
              {syncStatus.state === 'conflict' && (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    Remote conflict — review before syncing.{' '}
                    {syncStatus.fileUrl && (
                      <a href={syncStatus.fileUrl} target="_blank" rel="noopener noreferrer">View on GitHub</a>
                    )}
                  </span>
                </>
              )}
              {syncStatus.state === 'error' && (
                <>
                  <span className="gh-sync-dot" />
                  <span>{syncStatus.errorMessage || 'Last sync failed'}</span>
                </>
              )}
              {syncStatus.state === 'pending' && (
                <>
                  <svg className="gh-sync-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span>Syncing…</span>
                </>
              )}
            </div>
          )}

          {saveError && <div className="gh-error" role="alert">{saveError}</div>}
          {saveSuccess && <div className="gh-sync-saved">Configuration saved.</div>}

          {/* Repo picker */}
          <div className="gh-sync-field">
            <label className="gh-sync-label" htmlFor="gh-repo">Repository</label>
            {reposError ? (
              <p className="gh-sync-field-error">{reposError}</p>
            ) : (
              <select
                id="gh-repo"
                className="gh-sync-select"
                value={selectedRepo}
                onChange={handleRepoChange}
                disabled={loadingRepos}
              >
                <option value="">{loadingRepos ? 'Loading repositories…' : 'Select a repository'}</option>
                {repos.map((r) => (
                  <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Branch picker */}
          <div className="gh-sync-field">
            <label className="gh-sync-label" htmlFor="gh-branch">Branch</label>
            <select
              id="gh-branch"
              className="gh-sync-select"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={!selectedRepo || loadingBranches}
            >
              <option value="">
                {!selectedRepo
                  ? 'Select a repository first'
                  : loadingBranches
                  ? 'Loading branches…'
                  : 'Select a branch'}
              </option>
              {branches.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Path template */}
          <div className="gh-sync-field">
            <label className="gh-sync-label" htmlFor="gh-path">Path template</label>
            <input
              id="gh-path"
              type="text"
              className="gh-sync-input"
              value={pathTemplate}
              onChange={(e) => setPathTemplate(e.target.value)}
              placeholder="agents/{slug}.md"
            />
            <p className="gh-sync-hint">
              Placeholders: <code>{'{slug}'}</code> (URL-safe name), <code>{'{name}'}</code> (agent name),{' '}
              <code>{'{id}'}</code> (agent ID).
              {pathTemplate && (
                <> Preview: <code>{previewPath}</code></>
              )}
            </p>
          </div>

          {/* Format */}
          <div className="gh-sync-field">
            <label className="gh-sync-label">Format</label>
            <div className="gh-sync-radio-group">
              {[['markdown', 'Markdown'], ['json', 'JSON'], ['both', 'Both']].map(([val, label]) => (
                <label key={val} className="gh-sync-radio">
                  <input
                    type="radio"
                    name="gh-format"
                    value={val}
                    checked={format === val}
                    onChange={() => setFormat(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Auto-sync */}
          <div className="gh-sync-field gh-sync-field--toggle">
            <label className="gh-sync-toggle-label" htmlFor="gh-autosync">
              <span>Auto-sync on save</span>
              <p className="gh-sync-hint">Automatically commit to GitHub whenever you save this agent.</p>
            </label>
            <button
              id="gh-autosync"
              type="button"
              role="switch"
              aria-checked={autoSync}
              className={`gh-toggle${autoSync ? ' on' : ''}`}
              onClick={() => setAutoSync((v) => !v)}
            >
              <span className="gh-toggle-thumb" />
            </button>
          </div>
        </div>

        <div className="gh-sync-modal-footer">
          <div className="gh-sync-modal-footer-left">
            {selectedRepo && (
              <button
                type="button"
                className="btn subtle small"
                onClick={handleRemoveConfig}
                disabled={removing}
              >
                {removing ? 'Removing…' : 'Remove config'}
              </button>
            )}
          </div>
          <div className="gh-sync-modal-footer-right">
            {selectedRepo && selectedBranch && (
              <button
                type="button"
                className="btn subtle"
                onClick={handleSyncNow}
                disabled={syncing || saving}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={handleSave}
              disabled={saving || !selectedRepo || !selectedBranch}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function AgentCard({ agent, categories = [], onOpen, onDownload, onExportMcp, onExportFormat, onDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, onGitHubSync, syncStatus, isSelected, onToggleSelect }) {
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
    <div className={`agent-card${onToggleSelect ? ' agent-card--selectable' : ''}${isSelected ? ' agent-card--selected' : ''}`}>
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
      <div
        className="agent-card-body"
        onClick={() => onExportFormat && onExportFormat(agent)}
        style={onExportFormat ? { cursor: 'pointer' } : undefined}
        role={onExportFormat ? 'button' : undefined}
        tabIndex={onExportFormat ? 0 : undefined}
        onKeyDown={onExportFormat ? (e) => { if (e.key === 'Enter' || e.key === ' ') onExportFormat(agent); } : undefined}
        aria-label={onExportFormat ? `View API details for ${agent.name || 'agent'}` : undefined}
      >
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
          {(() => {
            const cat = agent.categoryId ? categories.find((c) => c.id === agent.categoryId) : null;
            return cat ? <Badge label={cat.label} color={cat.color || '#64748b'} /> : null;
          })()}
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
        {syncStatus && (
          <SyncStatusBadge status={syncStatus} onClick={() => onGitHubSync?.(agent)} />
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
          {onExportMcp && (
            <button className="btn subtle" onClick={() => onExportMcp(agent)} title="Export as MCP Server (zip)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              MCP
            </button>
          )}
          {onExportFormat && (
            <button className="btn subtle" onClick={() => onExportFormat(agent)} title="Export as Anthropic / OpenAI payload">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              API
            </button>
          )}
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
          {onGitHubSync && (
            <button
              className="btn subtle gh-sync-btn"
              onClick={() => onGitHubSync(agent)}
              title="Configure GitHub sync"
            >
              <svg viewBox="0 0 98 96" width="11" height="11" aria-hidden="true">
                <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
              </svg>
              GitHub
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

function AgentsList({ agents, search, toolsFilter, tagsFilter, categoryFilter, categories, onClearFilters, onOpen, onDownload, onExportMcp, onExportFormat, onDelete, canDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, onGitHubSync, syncStatuses, emptyNode, selectedIds, onToggleSelect, onToggleSelectAll }) {
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
    if (categoryFilter) {
      if (a.categoryId !== categoryFilter) return false;
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
            categories={categories}
            onOpen={onOpen}
            onDownload={onDownload}
            onExportMcp={onExportMcp || null}
            onExportFormat={onExportFormat || null}
            onDelete={canDelete && canDelete(agent) ? onDelete : null}
            onSubscribe={onSubscribe || null}
            onToggleVisibility={onToggleVisibility && agent.isOwned ? onToggleVisibility : null}
            onAnalytics={onAnalytics && agent.isOwned ? onAnalytics : null}
            onDuplicate={onDuplicate && agent.isOwned ? onDuplicate : null}
            onGitHubSync={onGitHubSync && agent.isOwned ? onGitHubSync : null}
            syncStatus={syncStatuses?.[agent.id] || null}
            isSelected={isSelectable ? selectedIds.has(agent.id) : undefined}
            onToggleSelect={isSelectable ? () => onToggleSelect(agent.id) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function TabContent({ agents, loading, error, search, toolsFilter, tagsFilter, categoryFilter, categories, onClearFilters, onOpen, onDownload, onExportMcp, onExportFormat, onDelete, canDelete, onSubscribe, onToggleVisibility, onAnalytics, onDuplicate, onGitHubSync, syncStatuses, emptyNode, selectedIds, onToggleSelect, onToggleSelectAll }) {
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
      categoryFilter={categoryFilter}
      categories={categories}
      onClearFilters={onClearFilters}
      onOpen={onOpen}
      onDownload={onDownload}
      onExportMcp={onExportMcp}
      onExportFormat={onExportFormat}
      onDelete={onDelete}
      canDelete={canDelete}
      onSubscribe={onSubscribe}
      onToggleVisibility={onToggleVisibility}
      onAnalytics={onAnalytics}
      onDuplicate={onDuplicate}
      onGitHubSync={onGitHubSync}
      syncStatuses={syncStatuses}
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
  categories = [],
  onOpen,
  onDownload,
  onExportMcp,
  onExportFormat,
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
  onNavigateSettings,
  easyMode = false,
}) {
  const [activeTab, setActiveTab] = useState('agents');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeletePrimed, setBulkDeletePrimed] = useState(false);
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toolsFilter, setToolsFilter] = useState(() => new Set());
  const [tagsFilter, setTagsFilter] = useState(() => new Set());
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const toolPickerRef = useRef(null);
  const tagPickerRef = useRef(null);

  // GitHub sync state
  const [githubStatus, setGithubStatus] = useState(null); // null = not loaded
  const [syncModalAgent, setSyncModalAgent] = useState(null);
  const [syncStatuses, setSyncStatuses] = useState({}); // agentId → status

  // Load GitHub connection status when the My Agents tab becomes active
  useEffect(() => {
    if (activeTab !== 'mine' || !isAuthenticated || githubStatus !== null) return;
    api.getGitHubStatus()
      .then((s) => setGithubStatus(s))
      .catch(() => setGithubStatus({ connected: false }));
  }, [activeTab, isAuthenticated, githubStatus]);

  // Refresh sync status for a single agent after the modal is closed
  const refreshSyncStatus = useCallback((agentId) => {
    api.getAgentSyncStatus(agentId)
      .then((s) => {
        if (s) setSyncStatuses((prev) => ({ ...prev, [agentId]: s }));
      })
      .catch(() => {});
  }, []);

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
    setCategoryFilter(null);
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
    setCategoryFilter(null);
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
        {!easyMode && (
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
        )}
      </div>

      {isMyTab && isAuthenticated && (availableTools.length > 0 || availableTags.length > 0 || categories.length > 0) && (
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

          {categories.length > 0 && (
            <div className="mp-filter-group">
              <label className="mp-filter-label">Category</label>
              <select
                className="mp-select"
                value={categoryFilter ?? ''}
                onChange={(e) => setCategoryFilter(e.target.value || null)}
              >
                <option value="">Any category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          )}

          {(toolsFilter.size > 0 || tagsFilter.size > 0 || categoryFilter) && (
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

      {isMyTab && selectionCount > 0 && !easyMode && (
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
        <>
        {!easyMode && githubStatus && !githubStatus.connected && (
          <div className="gh-connect-nudge">
            <svg viewBox="0 0 98 96" width="14" height="14" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
            </svg>
            Connect GitHub to sync agent definitions to a repository.{' '}
            <button className="btn-link" onClick={() => onNavigateSettings?.('settings')}>
              Connect in Settings
            </button>
          </div>
        )}
        <TabContent
          agents={myAgents}
          loading={loadingMine}
          error={errorMine}
          search={search}
          toolsFilter={toolsFilter}
          tagsFilter={tagsFilter}
          categoryFilter={categoryFilter}
          categories={categories}
          onClearFilters={handleClearAllFilters}
          onOpen={onOpen}
          onDownload={onDownload}
          onExportMcp={easyMode ? null : onExportMcp}
          onExportFormat={easyMode ? null : onExportFormat}
          onDelete={easyMode ? null : onDelete}
          canDelete={(agent) => agent.isOwned}
          onToggleVisibility={easyMode ? null : onToggleVisibility}
          onAnalytics={easyMode ? null : onAnalytics}
          onDuplicate={easyMode ? null : onDuplicate}
          onGitHubSync={easyMode ? null : (githubStatus?.connected ? setSyncModalAgent : null)}
          syncStatuses={easyMode ? {} : syncStatuses}
          selectedIds={selectedIds}
          onToggleSelect={easyMode ? null : toggleSelect}
          onToggleSelectAll={easyMode ? null : toggleSelectAll}
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
        {syncModalAgent && githubStatus?.connected && (
          <AgentGitHubSyncModal
            agent={syncModalAgent}
            githubLogin={githubStatus.githubLogin}
            onClose={() => {
              const agentId = syncModalAgent.id;
              setSyncModalAgent(null);
              refreshSyncStatus(agentId);
            }}
          />
        )}
        </>
      ) : (
        <TabContent
          agents={publicAgents}
          loading={loadingPublic}
          error={errorPublic}
          search={search}
          categories={categories}
          onClearFilters={() => setSearch('')}
          onOpen={onOpen}
          onDownload={onDownload}
          onExportMcp={easyMode ? null : onExportMcp}
          onExportFormat={easyMode ? null : onExportFormat}
          onDelete={null}
          onSubscribe={easyMode ? null : handlePublicSubscribe}
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
