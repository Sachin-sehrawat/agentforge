import React, { useEffect, useRef, useState } from 'react';
import { AGENT_ICON } from '../toolMeta.jsx';

const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' };

const THEME_ICON = {
  light: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  dark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  system: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
};

const THEME_LABEL = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };

export default function Topbar({
  agent,
  onChangeName,
  onNew,
  onSave,
  saving,
  savedAgents,
  onLoad,
  onDelete,
  onDownload,
  onOpenImport,
  onOpenTemplates,
  onOpenHistory,
  view,
  onSetView,
  customSkillsCount,
  user,
  onOpenAuth,
  onLogout,
  isAuthenticated,
  theme = 'system',
  onThemeChange,
  quota,
}) {
  const isFree = user?.tier === 'free';
  const exportUsage = isFree && quota?.usage?.export;
  const saveUsage = isFree && quota?.usage?.save;
  const exportRemaining = exportUsage ? exportUsage.limit - exportUsage.used : null;
  const saveRemaining = saveUsage ? saveUsage.limit - saveUsage.used : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  if (view === 'landing') {
    return (
      <header className="topbar topbar--landing">
        <div className="brand">
          <span className="brand-mark">
            <AGENT_ICON />
          </span>
          AgentForge
        </div>

        <nav className="topbar-landing-nav">
          <button className="topbar-landing-nav__item" onClick={() => onSetView('builder')}>Product</button>
          <button className="topbar-landing-nav__item" onClick={() => onSetView('builder')}>Templates</button>
          <button className="topbar-landing-nav__item" onClick={() => onSetView('marketplace')}>Marketplace</button>
          <a href="#" className="topbar-landing-nav__item">Docs</a>
        </nav>

        <div className="topbar-spacer" />

        <button
          className="theme-toggle"
          onClick={() => onThemeChange(THEME_CYCLE[theme])}
          title={`${THEME_LABEL[theme]} (click to switch)`}
          aria-label={THEME_LABEL[theme]}
        >
          {THEME_ICON[theme]}
        </button>

        <div className="topbar-divider" />

        <div className="topbar-auth">
          <button className="btn subtle" onClick={() => onOpenAuth('login')}>Sign in</button>
          <button className="btn primary" onClick={() => onOpenAuth('signup')}>Start building free</button>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <AGENT_ICON />
        </span>
        AgentForge
      </div>

      <div className="topbar-divider" />

      <nav className="topbar-nav">
        <button
          className={`topbar-nav-item${view === 'builder' ? ' active' : ''}`}
          onClick={() => onSetView('builder')}
        >
          Builder
        </button>
        <button
          className={`topbar-nav-item${view === 'agents' ? ' active' : ''}`}
          onClick={() => onSetView('agents')}
        >
          Agents
        </button>
        <button
          className={`topbar-nav-item${view === 'marketplace' ? ' active' : ''}`}
          onClick={() => onSetView('marketplace')}
        >
          Marketplace
        </button>
        <button
          className={`topbar-nav-item${view === 'skills' ? ' active' : ''}`}
          onClick={() => onSetView('skills')}
        >
          Skills
          {customSkillsCount > 0 && (
            <span className="topbar-nav-badge">{customSkillsCount}</span>
          )}
        </button>
        {isAuthenticated && (
          <button
            className={`topbar-nav-item${view === 'developer' ? ' active' : ''}`}
            onClick={() => onSetView('developer')}
          >
            Developer
          </button>
        )}
        {isAuthenticated && (
          <button
            className={`topbar-nav-item${view === 'admin' ? ' active' : ''}`}
            onClick={() => onSetView('admin')}
          >
            Admin
          </button>
        )}
      </nav>

      {view === 'builder' && (
        <>
          <div className="topbar-divider" />

          <input
            className="agent-name-input"
            value={agent.name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="Untitled agent"
          />

          {isAuthenticated && <div className="agent-menu" ref={menuRef}>
            <button className="btn subtle" onClick={() => setMenuOpen((v) => !v)}>
              My agents {savedAgents.length > 0 ? `(${savedAgents.length})` : ''}
            </button>
            {menuOpen && (
              <div className="agent-menu-list">
                {savedAgents.length === 0 && (
                  <div className="agent-menu-empty">No saved agents yet. Build one and hit Save agent.</div>
                )}
                {savedAgents.map((a) => (
                  <div
                    className="agent-menu-item"
                    key={a.id}
                    onClick={() => {
                      onLoad(a.id);
                      setMenuOpen(false);
                    }}
                  >
                    <div>
                      <div>{a.name}</div>
                      <div className="meta">{a.tools.length} tool{a.tools.length === 1 ? '' : 's'}</div>
                    </div>
                    <div className="item-actions">
                      <button
                        className="download-item"
                        title="Download as Markdown"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownload(a);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        className="remove"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(a.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>}
        </>
      )}

      <div className="topbar-spacer" />

      {view === 'builder' && (
        <div className="topbar-actions">
          {isAuthenticated && agent.id && (
            <button className="btn subtle" onClick={onOpenHistory} title="Browse version history">
              History
            </button>
          )}
          <button
            className="btn subtle"
            onClick={onOpenTemplates}
            title="Start from a pre-built template"
          >
            Templates
          </button>
          <button
            className="btn subtle"
            onClick={onOpenImport}
            title="Import agent from .md or .json"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          <button
            className="btn download"
            onClick={() => onDownload(agent)}
            title="Download agent as Markdown"
            disabled={
              !agent.persona &&
              !agent.systemPrompt &&
              (!agent.tools || agent.tools.length === 0) &&
              (!agent.skills || agent.skills.length === 0) &&
              (!agent.instructions || agent.instructions.length === 0)
            }
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export MD
            {exportRemaining !== null && (
              <span className={`quota-badge${exportRemaining <= 2 ? ' quota-badge-warn' : ''}`}>
                {exportRemaining} left
              </span>
            )}
          </button>
          <button className="btn" onClick={onNew}>New</button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save agent'}
            {!saving && saveRemaining !== null && (
              <span className={`quota-badge${saveRemaining <= 5 ? ' quota-badge-warn' : ''}`}>
                {saveRemaining} left
              </span>
            )}
          </button>
        </div>
      )}

      <button
        className="theme-toggle"
        onClick={() => onThemeChange(THEME_CYCLE[theme])}
        title={`${THEME_LABEL[theme]} (click to switch)`}
        aria-label={THEME_LABEL[theme]}
      >
        {THEME_ICON[theme]}
      </button>

      <div className="topbar-divider" />

      <div className="topbar-auth">
        {user ? (
          <>
            <span className="auth-user-name" title={user.email}>
              {user.displayName || user.email}
            </span>
            <button className="btn subtle" onClick={onLogout}>Sign out</button>
          </>
        ) : (
          <>
            <button className="btn subtle" onClick={() => onOpenAuth('login')}>Sign in</button>
            <button className="btn primary" onClick={() => onOpenAuth('signup')}>Sign up</button>
          </>
        )}
      </div>
    </header>
  );
}
