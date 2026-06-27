import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TOOL_META } from '../toolMeta.jsx';

export default function TemplateGallery({ allSkills, onSelect, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, []);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const skillLabelMap = Object.fromEntries(allSkills.map((s) => [s.id, s.label]));

  // Split blank from the rest
  const nonBlank = templates.filter((t) => t.id !== 'blank');
  const blank = templates.find((t) => t.id === 'blank');

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop}>
      <div className="modal tg-modal" role="dialog" aria-modal="true" aria-labelledby="tg-title">
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="tg-title">Choose a template</h2>
            <p className="tg-subtitle">Start from a pre-built agent or a blank canvas.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body tg-body">
          {loading ? (
            <div className="tg-loading">Loading templates…</div>
          ) : (
            <>
              <div className="tg-grid">
                {nonBlank.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    skillLabelMap={skillLabelMap}
                    onSelect={onSelect}
                  />
                ))}
              </div>

              {blank && (
                <button
                  className="tg-blank-btn"
                  onClick={() => onSelect(blank)}
                  title="Clear the canvas and start from scratch"
                >
                  <span className="tg-blank-icon">{blank.icon}</span>
                  <span className="tg-blank-text">
                    <span className="tg-blank-name">{blank.name}</span>
                    <span className="tg-blank-desc">{blank.description}</span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ template, skillLabelMap, onSelect }) {
  const { name, description, icon, definition } = template;
  const tools = definition?.tools ?? [];
  const skills = definition?.skills ?? [];

  return (
    <button className="tg-card" onClick={() => onSelect(template)}>
      <div className="tg-card-icon">{icon}</div>
      <div className="tg-card-body">
        <div className="tg-card-name">{name}</div>
        <div className="tg-card-desc">{description}</div>
        {(tools.length > 0 || skills.length > 0) && (
          <div className="tg-card-badges">
            {tools.map((id) => {
              const meta = TOOL_META[id];
              return (
                <span
                  key={id}
                  className="tg-badge tg-badge-tool"
                  style={{ '--badge-color': meta?.color ?? '#6366f1' }}
                >
                  {meta?.label ?? id}
                </span>
              );
            })}
            {skills.map((id) => (
              <span key={id} className="tg-badge tg-badge-skill">
                {skillLabelMap[id] ?? id}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="tg-card-cta">Use template</div>
    </button>
  );
}
