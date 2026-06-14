import React, { useState } from 'react';
import { ICONS, TOOL_META, TOOL_CATEGORIES } from '../toolMeta.jsx';

export default function Sidebar({ addedTools, onAddTool }) {
  const [collapsed, setCollapsed] = useState({});
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filtered = TOOL_CATEGORIES
    .map((cat) => ({
      ...cat,
      tools: q
        ? cat.tools.filter((id) => {
            const m = TOOL_META[id];
            return m.label.toLowerCase().includes(q) || m.blurb.toLowerCase().includes(q);
          })
        : cat.tools,
    }))
    .filter((cat) => cat.tools.length > 0);

  function toggleCategory(id) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isOpen(cat) {
    if (q) return true;
    return !collapsed[cat.id];
  }

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Tool palette</h2>

      <div className="filter-wrap">
        <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="filter-clear" onClick={() => setQuery('')} title="Clear">
            ✕
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="filter-empty">No tools match "{query}"</p>
      )}

      {filtered.map((cat) => {
        const open = isOpen(cat);
        return (
          <div key={cat.id} className="tool-category">
            <button
              className="tool-cat-header"
              style={{ '--cat-color': cat.color }}
              onClick={() => toggleCategory(cat.id)}
            >
              <span className="tool-cat-dot" />
              <span className="tool-cat-label">{cat.label}</span>
              <span className="tool-cat-count">{cat.tools.length}</span>
              <span className="tool-cat-chevron">{open ? '‹' : '›'}</span>
            </button>

            {open && (
              <div className="tool-cat-list">
                {cat.tools.map((toolId) => {
                  const meta = TOOL_META[toolId];
                  const Icon = ICONS[toolId];
                  const added = addedTools.includes(toolId);
                  return (
                    <div
                      key={toolId}
                      className={`tool-card${added ? ' added' : ''}`}
                      style={{ '--tool-color': cat.color }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('toolId', toolId);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDoubleClick={() => !added && onAddTool(toolId)}
                      title="Drag onto the canvas, or double-click to add"
                    >
                      {added && <span className="tool-card-badge">wired</span>}
                      <span className="tool-card-icon">
                        <Icon />
                      </span>
                      <div className="tool-card-body">
                        <div className="tool-card-label">
                          <Highlight text={meta.label} query={q} />
                        </div>
                        <div className="tool-card-blurb">
                          <Highlight text={meta.blurb} query={q} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {!query && (
        <div className="sidebar-foot">
          Tip: <code>Web Search</code> runs via Claude. All other tools execute on your backend.
        </div>
      )}
    </aside>
  );
}

function Highlight({ text, query }) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="filter-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
