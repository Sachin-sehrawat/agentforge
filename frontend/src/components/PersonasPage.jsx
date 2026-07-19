import React, { useState } from 'react';

export default function PersonasPage({ categories = [] }) {
  const [query, setQuery] = useState('');
  const [openPersona, setOpenPersona] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

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

  async function copyPersona(p) {
    try {
      await navigator.clipboard.writeText(p.persona || p.systemPrompt || '');
      setCopiedId(p.id);
      setTimeout(() => setCopiedId((prev) => (prev === p.id ? null : prev)), 2000);
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="agents-page personas-page">
      <div className="agents-page-header">
        <h1 className="agents-page-title">Personas</h1>
        <p className="agents-page-sub">Browse curated persona instructions used to shape agent tone and expertise.</p>
      </div>

      <div className="filter-wrap personas-page-search">
        <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="filter-input"
          type="text"
          placeholder="Search personas…"
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
        <p className="filter-empty">No personas match "{query}"</p>
      )}

      <div className="personas-page-list">
        {filtered.map((cat) => (
          <div key={cat.id} className="persona-category">
            <div className="persona-cat-header persona-cat-header--static" style={{ '--cat-color': cat.color }}>
              <span className="persona-cat-dot" />
              <span className="persona-cat-label">{cat.label}</span>
              <span className="persona-cat-count">{cat.personas.length}</span>
            </div>
            <div className="persona-list personas-page-grid">
              {cat.personas.map((p) => (
                <div key={p.id} className="persona-card personas-page-card" style={{ '--cat-color': cat.color }}>
                  <button
                    className="personas-page-card-main"
                    onClick={() => setOpenPersona(openPersona === p.id ? null : p.id)}
                  >
                    <div className="persona-card-name">{p.name}</div>
                    <div className="persona-card-tagline">{p.tagline}</div>
                  </button>
                  {openPersona === p.id && (
                    <div className="personas-page-detail">
                      <p>{p.persona || p.systemPrompt}</p>
                      <button className="btn subtle" onClick={() => copyPersona(p)}>
                        {copiedId === p.id ? 'Copied!' : 'Copy prompt'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
