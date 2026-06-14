import React, { useEffect, useRef, useState } from 'react';
import { AGENT_ICON } from '../toolMeta.jsx';

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
}) {
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

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">
          <AGENT_ICON />
        </span>
        AgentForge
      </div>

      <div className="topbar-divider" />

      <input
        className="agent-name-input"
        value={agent.name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Untitled agent"
      />

      <div className="agent-menu" ref={menuRef}>
        <button className="btn subtle" onClick={() => setMenuOpen((v) => !v)}>
          Saved agents {savedAgents.length > 0 ? `(${savedAgents.length})` : ''}
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
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        {agent.id && (
          <button className="btn download" onClick={() => onDownload(agent)} title="Download agent as Markdown">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export MD
          </button>
        )}
        <button className="btn" onClick={onNew}>New</button>
        <button className="btn primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save agent'}
        </button>
      </div>
    </header>
  );
}
