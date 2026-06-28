import React, { useState } from 'react';

const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#6d28d9',
  '#9f1239', '#ef4444', '#f97316', '#f59e0b',
  '#10b981', '#065f46', '#0369a1', '#1e40af',
  '#92400e', '#374151', '#0f766e', '#9a3412',
];

function SkillFormModal({ initial, onSave, onClose }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [color, setColor] = useState(initial?.color || '#6366f1');
  const [description, setDescription] = useState(initial?.description || '');
  const [instruction, setInstruction] = useState(initial?.instruction || '');
  const [saving, setSaving] = useState(false);

  const isValid = label.trim().length > 0 && instruction.trim().length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave({ label: label.trim(), color, description: description.trim(), instruction: instruction.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{initial?.id ? 'Edit Skill' : 'Create Skill'}</h2>
          <button className="modal-close" onClick={onClose} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Label *</label>
            <input
              className="field-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Devil's Advocate"
              autoFocus
            />
          </div>
          <div className="field-group">
            <label className="field-label">Color</label>
            <div className="color-presets">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                className="color-custom-input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                title="Custom color"
              />
            </div>
            <div className="color-preview-row">
              <span className="skill-chip active" style={{ '--skill-color': color, pointerEvents: 'none' }}>
                {label || 'Preview'}
              </span>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Description</label>
            <input
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this skill does"
            />
          </div>
          <div className="field-group">
            <label className="field-label">Instruction *</label>
            <textarea
              className="field-textarea skill-instruction-textarea"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="The full instruction that will be added to the agent when this skill is active…"
              rows={5}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!isValid || saving}>
              {saving ? 'Saving…' : initial?.id ? 'Update Skill' : 'Create Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SkillCard({ skill, onEdit, onDelete, onDuplicate }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  }

  function badgeClass() {
    if (skill.builtin) return 'skill-badge builtin';
    if (skill.isOwned) return 'skill-badge custom';
    return 'skill-badge public';
  }

  function badgeLabel() {
    if (skill.builtin) return 'Built-in';
    if (skill.isOwned) return 'Custom';
    return 'Public';
  }

  return (
    <div className="skill-card">
      <div className="skill-card-strip" style={{ background: skill.color }} />
      <div className="skill-card-body">
        <div className="skill-card-header-row">
          <span className="skill-card-label">{skill.label}</span>
          <span className={badgeClass()}>{badgeLabel()}</span>
        </div>
        {skill.description && (
          <p className="skill-card-description">{skill.description}</p>
        )}
        <div className="skill-card-instruction">{skill.instruction}</div>
      </div>
      <div className="skill-card-footer">
        {skill.builtin ? (
          <button className="btn subtle" onClick={onDuplicate}>
            Duplicate
          </button>
        ) : skill.isOwned ? (
          <>
            <button
              className={`btn${confirmDelete ? ' danger' : ' subtle'}`}
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm' : 'Delete skill'}
            >
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </button>
            <button className="btn subtle" onClick={onEdit}>Edit</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function SkillsPage({ allSkills, onCreateSkill, onUpdateSkill, onDeleteSkill, isAuthenticated, onOpenAuth }) {
  const [search, setSearch] = useState('');
  const [formState, setFormState] = useState(null);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allSkills.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q) ||
          (s.instruction || '').toLowerCase().includes(q)
      )
    : allSkills;

  const customCount = allSkills.filter((s) => !s.builtin && s.isOwned).length;

  async function handleSave(data) {
    if (formState?.id) {
      await onUpdateSkill(formState.id, data);
    } else {
      await onCreateSkill(data);
    }
    setFormState(null);
  }

  return (
    <div className="agents-page">
      {formState !== null && (
        <SkillFormModal
          initial={formState}
          onSave={handleSave}
          onClose={() => setFormState(null)}
        />
      )}

      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Skills Library</h1>
          <p className="agents-page-sub">
            {allSkills.length} skill{allSkills.length !== 1 ? 's' : ''}
            {customCount > 0 ? ` · ${customCount} custom` : ''}
          </p>
        </div>
        <div className="agents-page-header-actions">
          <div className="filter-wrap filter-wrap--header">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="filter-input"
              type="text"
              placeholder="Search skills…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="filter-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <button
            className="btn primary"
            onClick={() => isAuthenticated ? setFormState({}) : onOpenAuth?.('login')}
            title={isAuthenticated ? undefined : 'Sign in to create skills'}
          >
            + Create Skill
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="filter-empty">No skills match "{search}"</p>
      ) : (
        <div className="agents-grid skills-grid">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onEdit={() => setFormState(skill)}
              onDelete={() => onDeleteSkill(skill.id)}
              onDuplicate={() =>
                setFormState({
                  label: `${skill.label} (copy)`,
                  color: skill.color,
                  description: skill.description,
                  instruction: skill.instruction,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
