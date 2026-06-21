import React, { useState } from 'react';

export default function PersonaLibrary({ activeInstructions, onToggleInstruction, categories = [] }) {
  const [collapsed, setCollapsed] = useState({});
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filtered = categories
    .map((cat) => ({
      ...cat,
      personas: q
        ? cat.personas.filter(
            (p) => p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q)
          )
        : cat.personas,
    }))
    .filter((cat) => cat.personas.length > 0);

  function toggleCategory(id) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isOpen(cat) {
    if (q) return true;
    return !collapsed[cat.id];
  }

  return (
    <div className="persona-library">
      <div className="filter-wrap">
        <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter instructions…"
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
        <p className="filter-empty">No instructions match "{query}"</p>
      )}

      {filtered.map((cat) => {
        const open = isOpen(cat);
        return (
          <div key={cat.id} className="persona-category">
            <button
              className="persona-cat-header"
              style={{ '--cat-color': cat.color }}
              onClick={() => toggleCategory(cat.id)}
            >
              <span className="persona-cat-dot" />
              <span className="persona-cat-label">{cat.label}</span>
              <span className="persona-cat-count">{cat.personas.length}</span>
              <span className="persona-cat-chevron">{open ? '‹' : '›'}</span>
            </button>

            {open && (
              <div className="persona-list">
                {cat.personas.map((p) => {
                  const isActive = activeInstructions.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`persona-card${isActive ? ' active' : ''}`}
                      style={{ '--cat-color': cat.color }}
                      onClick={() => onToggleInstruction(p)}
                      title={p.persona}
                    >
                      {isActive && (
                        <span className="persona-card-check">
                          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        </span>
                      )}
                      <div className="persona-card-name">
                        <Highlight text={p.name} query={q} />
                      </div>
                      <div className="persona-card-tagline">
                        <Highlight text={p.tagline} query={q} />
                      </div>
                      {isActive && <span className="persona-card-badge">added</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
