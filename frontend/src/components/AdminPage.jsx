import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

// ── Color presets (shared between skill and category forms) ─────────────────
const COLOR_PRESETS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#6d28d9',
  '#9f1239', '#ef4444', '#f97316', '#f59e0b',
  '#10b981', '#065f46', '#0369a1', '#1e40af',
  '#92400e', '#374151', '#0f766e', '#9a3412',
];

// ── Shared color picker sub-form ────────────────────────────────────────────
function ColorPicker({ color, onChange }) {
  return (
    <div className="field-group">
      <label className="field-label">Color</label>
      <div className="color-presets">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch${color === c ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          className="color-custom-input"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          title="Custom color"
        />
      </div>
    </div>
  );
}

// ── Modal wrapper ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Builtin skill form modal ────────────────────────────────────────────────
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
    <Modal title={initial?.id ? 'Edit Builtin Skill' : 'Create Builtin Skill'} onClose={onClose}>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label">Label *</label>
          <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Formal Mode" autoFocus />
        </div>
        <ColorPicker color={color} onChange={setColor} />
        <div className="color-preview-row">
          <span className="skill-chip active" style={{ '--skill-color': color, pointerEvents: 'none' }}>
            {label || 'Preview'}
          </span>
        </div>
        <div className="field-group">
          <label className="field-label">Description</label>
          <input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary of what this skill does" />
        </div>
        <div className="field-group">
          <label className="field-label">Instruction *</label>
          <textarea
            className="field-textarea skill-instruction-textarea"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="The full instruction that will be injected into the agent when this skill is active…"
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
    </Modal>
  );
}

// ── Category form modal ─────────────────────────────────────────────────────
function CategoryFormModal({ initial, onSave, onClose }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [color, setColor] = useState(initial?.color || '#6366f1');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ label: label.trim(), color });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial?.id ? 'Edit Category' : 'Create Category'} onClose={onClose}>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label">Label *</label>
          <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Technology" autoFocus />
        </div>
        <ColorPicker color={color} onChange={setColor} />
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!label.trim() || saving}>
            {saving ? 'Saving…' : initial?.id ? 'Update Category' : 'Create Category'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Persona form modal ──────────────────────────────────────────────────────
function PersonaFormModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [tagline, setTagline] = useState(initial?.tagline || '');
  const [persona, setPersona] = useState(initial?.persona || '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || '');
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0 && systemPrompt.trim().length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        tagline: tagline.trim(),
        persona: persona.trim(),
        systemPrompt: systemPrompt.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial?.id ? 'Edit Persona' : 'Add Persona'} onClose={onClose}>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label">Name *</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Software Engineer" autoFocus />
        </div>
        <div className="field-group">
          <label className="field-label">Tagline</label>
          <input className="field-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One-line description shown in the library" />
        </div>
        <div className="field-group">
          <label className="field-label">Persona description</label>
          <input className="field-input" value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="A short description of this persona's style" />
        </div>
        <div className="field-group">
          <label className="field-label">System Prompt *</label>
          <textarea
            className="field-textarea skill-instruction-textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="The full system prompt injected when this persona is active…"
            rows={7}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!isValid || saving}>
            {saving ? 'Saving…' : initial?.id ? 'Update Persona' : 'Add Persona'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Template form modal ─────────────────────────────────────────────────────
function TemplateFormModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [icon, setIcon] = useState(initial?.icon || '');
  const [definitionJson, setDefinitionJson] = useState(
    initial?.definition ? JSON.stringify(initial.definition, null, 2) : '{}'
  );
  const [jsonError, setJsonError] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = name.trim().length > 0 && !jsonError;

  function handleDefinitionChange(val) {
    setDefinitionJson(val);
    try {
      JSON.parse(val);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || saving) return;
    let definition;
    try { definition = JSON.parse(definitionJson); } catch { return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), category: category.trim(), icon: icon.trim(), definition });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial?.id ? 'Edit Template' : 'Create Template'} onClose={onClose}>
      <form className="modal-body" onSubmit={handleSubmit}>
        <div className="field-group">
          <label className="field-label">Name *</label>
          <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Code Assistant" autoFocus />
        </div>
        <div className="field-group">
          <label className="field-label">Description</label>
          <input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary shown in the gallery" />
        </div>
        <div className="field-group">
          <label className="field-label">Category</label>
          <input className="field-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. productivity" />
        </div>
        <div className="field-group">
          <label className="field-label">Icon</label>
          <input className="field-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. 💻" />
        </div>
        <div className="field-group">
          <label className="field-label">Definition (JSON) *</label>
          <textarea
            className={`field-textarea skill-instruction-textarea${jsonError ? ' field-error' : ''}`}
            value={definitionJson}
            onChange={(e) => handleDefinitionChange(e.target.value)}
            rows={8}
            spellCheck={false}
          />
          {jsonError && <p className="field-error-msg">{jsonError}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!isValid || saving}>
            {saving ? 'Saving…' : initial?.id ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Templates tab ────────────────────────────────────────────────────────────
function TemplatesTab({ templates, onTemplatesChange, isAuthenticated, onOpenAuth }) {
  const [search, setSearch] = useState('');
  const [formState, setFormState] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? templates.filter((t) => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
    : templates;

  async function openEdit(template) {
    if (!isAuthenticated) { onOpenAuth?.('login'); return; }
    const full = await api.getTemplate(template.id);
    setFormState(full);
  }

  async function handleSave(data) {
    if (formState?.id) {
      const updated = await api.updateTemplate(formState.id, data);
      onTemplatesChange((prev) => prev.map((t) => (t.id === formState.id ? updated : t)));
    } else {
      const created = await api.createTemplate(data);
      onTemplatesChange((prev) => [...prev, created]);
    }
    setFormState(null);
  }

  async function handleDelete(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 2500);
      return;
    }
    await api.deleteTemplate(id);
    onTemplatesChange((prev) => prev.filter((t) => t.id !== id));
    setConfirmDelete(null);
  }

  return (
    <div>
      {formState !== null && (
        <TemplateFormModal initial={formState} onSave={handleSave} onClose={() => setFormState(null)} />
      )}

      <div className="agents-page-header">
        <div>
          <h2 className="agents-page-title">Templates</h2>
          <p className="agents-page-sub">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="agents-page-header-actions">
          <div className="filter-wrap filter-wrap--header">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input className="filter-input" type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="filter-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button
            className="btn primary"
            onClick={() => isAuthenticated ? setFormState({}) : onOpenAuth?.('login')}
          >
            + Create Template
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="filter-empty">{search ? `No templates match "${search}"` : 'No templates yet.'}</p>
      ) : (
        <div className="agents-grid skills-grid">
          {filtered.map((tmpl) => (
            <div key={tmpl.id} className="skill-card">
              <div className="skill-card-strip" style={{ background: '#6366f1' }} />
              <div className="skill-card-body">
                <div className="skill-card-header-row">
                  {tmpl.icon && <span style={{ marginRight: 6 }}>{tmpl.icon}</span>}
                  <span className="skill-card-label">{tmpl.name}</span>
                  {tmpl.category && <span className="skill-badge builtin">{tmpl.category}</span>}
                </div>
                {tmpl.description && <p className="skill-card-description">{tmpl.description}</p>}
              </div>
              <div className="skill-card-footer">
                <button
                  className={`btn${confirmDelete === tmpl.id ? ' danger' : ' subtle'}`}
                  onClick={() => handleDelete(tmpl.id)}
                >
                  {confirmDelete === tmpl.id ? 'Confirm?' : 'Delete'}
                </button>
                <button className="btn subtle" onClick={() => openEdit(tmpl)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Builtin Skills tab ──────────────────────────────────────────────────────
function BuiltinSkillsTab({ skills, onSkillsChange, isAuthenticated, onOpenAuth }) {
  const [search, setSearch] = useState('');
  const [formState, setFormState] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? skills.filter((s) => s.label.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
    : skills;

  async function handleSave(data) {
    if (formState?.id) {
      const updated = await api.updateBuiltinSkill(formState.id, data);
      onSkillsChange((prev) => prev.map((s) => (s.id === formState.id ? updated : s)));
    } else {
      const created = await api.createBuiltinSkill(data);
      onSkillsChange((prev) => [...prev, created]);
    }
    setFormState(null);
  }

  async function handleDelete(id) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 2500);
      return;
    }
    await api.deleteBuiltinSkill(id);
    onSkillsChange((prev) => prev.filter((s) => s.id !== id));
    setConfirmDelete(null);
  }

  return (
    <div>
      {formState !== null && (
        <SkillFormModal initial={formState} onSave={handleSave} onClose={() => setFormState(null)} />
      )}

      <div className="agents-page-header">
        <div>
          <h2 className="agents-page-title">Builtin Skills</h2>
          <p className="agents-page-sub">{skills.length} skill{skills.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="agents-page-header-actions">
          <div className="filter-wrap filter-wrap--header">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input className="filter-input" type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button className="filter-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button
            className="btn primary"
            onClick={() => isAuthenticated ? setFormState({}) : onOpenAuth?.('login')}
          >
            + Create Skill
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="filter-empty">{search ? `No skills match "${search}"` : 'No builtin skills yet.'}</p>
      ) : (
        <div className="agents-grid skills-grid">
          {filtered.map((skill) => (
            <div key={skill.id} className="skill-card">
              <div className="skill-card-strip" style={{ background: skill.color }} />
              <div className="skill-card-body">
                <div className="skill-card-header-row">
                  <span className="skill-card-label">{skill.label}</span>
                  <span className="skill-badge builtin">Built-in</span>
                </div>
                {skill.description && <p className="skill-card-description">{skill.description}</p>}
                <div className="skill-card-instruction">{skill.instruction}</div>
              </div>
              <div className="skill-card-footer">
                <button
                  className={`btn${confirmDelete === skill.id ? ' danger' : ' subtle'}`}
                  onClick={() => handleDelete(skill.id)}
                >
                  {confirmDelete === skill.id ? 'Confirm?' : 'Delete'}
                </button>
                <button className="btn subtle" onClick={() => setFormState(skill)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Personas tab ────────────────────────────────────────────────────────────
function PersonasTab({ categories, onCategoriesChange, isAuthenticated, onOpenAuth }) {
  const [catForm, setCatForm] = useState(null);
  const [personaForm, setPersonaForm] = useState(null); // { categoryId, persona? }
  const [collapsed, setCollapsed] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null); // 'cat:id' or 'persona:catId:id'

  function toggleCategory(id) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSaveCategory(data) {
    if (catForm?.id) {
      const updated = await api.updatePersonaCategory(catForm.id, data);
      onCategoriesChange((prev) => prev.map((c) => (c.id === catForm.id ? updated : c)));
    } else {
      const created = await api.createPersonaCategory(data);
      onCategoriesChange((prev) => [...prev, created]);
    }
    setCatForm(null);
  }

  async function handleDeleteCategory(id) {
    const key = `cat:${id}`;
    if (confirmDelete !== key) {
      setConfirmDelete(key);
      setTimeout(() => setConfirmDelete(null), 2500);
      return;
    }
    await api.deletePersonaCategory(id);
    onCategoriesChange((prev) => prev.filter((c) => c.id !== id));
    setConfirmDelete(null);
  }

  async function handleSavePersona(data) {
    const { categoryId, persona } = personaForm;
    if (persona?.id) {
      const updated = await api.updatePersona(categoryId, persona.id, data);
      onCategoriesChange((prev) => prev.map((c) => (c.id === categoryId ? updated : c)));
    } else {
      const updated = await api.createPersona(categoryId, data);
      onCategoriesChange((prev) => prev.map((c) => (c.id === categoryId ? updated : c)));
    }
    setPersonaForm(null);
  }

  async function handleDeletePersona(categoryId, personaId) {
    const key = `persona:${categoryId}:${personaId}`;
    if (confirmDelete !== key) {
      setConfirmDelete(key);
      setTimeout(() => setConfirmDelete(null), 2500);
      return;
    }
    const updated = await api.deletePersona(categoryId, personaId);
    onCategoriesChange((prev) => prev.map((c) => (c.id === categoryId ? updated : c)));
    setConfirmDelete(null);
  }

  return (
    <div>
      {catForm !== null && (
        <CategoryFormModal initial={catForm} onSave={handleSaveCategory} onClose={() => setCatForm(null)} />
      )}
      {personaForm !== null && (
        <PersonaFormModal initial={personaForm.persona} onSave={handleSavePersona} onClose={() => setPersonaForm(null)} />
      )}

      <div className="agents-page-header">
        <div>
          <h2 className="agents-page-title">Personas</h2>
          <p className="agents-page-sub">
            {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} ·{' '}
            {categories.reduce((n, c) => n + c.personas.length, 0)} personas
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => isAuthenticated ? setCatForm({}) : onOpenAuth?.('login')}
        >
          + Create Category
        </button>
      </div>

      {categories.length === 0 && (
        <p className="filter-empty">No persona categories yet.</p>
      )}

      {categories.map((cat) => {
        const open = !collapsed[cat.id];
        const catDeleteKey = `cat:${cat.id}`;
        return (
          <div key={cat.id} className="persona-category admin-category">
            <div className="persona-cat-header admin-cat-header" style={{ '--cat-color': cat.color }}>
              <button className="persona-cat-toggle" onClick={() => toggleCategory(cat.id)}>
                <span className="persona-cat-dot" />
                <span className="persona-cat-label">{cat.label}</span>
                <span className="persona-cat-count">{cat.personas.length}</span>
                <span className="persona-cat-chevron">{open ? '‹' : '›'}</span>
              </button>
              <div className="admin-cat-actions">
                <button className="btn subtle small" onClick={() => isAuthenticated ? setCatForm(cat) : onOpenAuth?.('login')}>Edit</button>
                <button
                  className={`btn small${confirmDelete === catDeleteKey ? ' danger' : ' subtle'}`}
                  onClick={() => handleDeleteCategory(cat.id)}
                >
                  {confirmDelete === catDeleteKey ? 'Confirm?' : 'Delete'}
                </button>
              </div>
            </div>

            {open && (
              <div className="persona-list admin-persona-list">
                {cat.personas.map((p) => {
                  const pDeleteKey = `persona:${cat.id}:${p.id}`;
                  return (
                    <div key={p.id} className="admin-persona-row">
                      <div className="admin-persona-info">
                        <span className="admin-persona-name">{p.name}</span>
                        {p.tagline && <span className="admin-persona-tagline">{p.tagline}</span>}
                      </div>
                      <div className="admin-persona-actions">
                        <button className="btn subtle small" onClick={() => isAuthenticated ? setPersonaForm({ categoryId: cat.id, persona: p }) : onOpenAuth?.('login')}>Edit</button>
                        <button
                          className={`btn small${confirmDelete === pDeleteKey ? ' danger' : ' subtle'}`}
                          onClick={() => handleDeletePersona(cat.id, p.id)}
                        >
                          {confirmDelete === pDeleteKey ? 'Confirm?' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  className="btn subtle admin-add-persona"
                  onClick={() => isAuthenticated ? setPersonaForm({ categoryId: cat.id }) : onOpenAuth?.('login')}
                >
                  + Add Persona
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── JSON diff helper ────────────────────────────────────────────────────────
function JsonDiff({ before, after }) {
  if (before == null && after == null) return <span className="audit-no-diff">—</span>;

  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  const changed = [...allKeys].filter(
    (k) => JSON.stringify((before ?? {})[k]) !== JSON.stringify((after ?? {})[k])
  );

  if (changed.length === 0) {
    return <span className="audit-no-diff">No field changes</span>;
  }

  return (
    <table className="audit-diff-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k}>
            <td className="audit-diff-key">{k}</td>
            <td className="audit-diff-before">
              {before != null && k in before
                ? <code>{JSON.stringify((before)[k], null, 2)}</code>
                : <span className="audit-absent">—</span>}
            </td>
            <td className="audit-diff-after">
              {after != null && k in after
                ? <code>{JSON.stringify((after)[k], null, 2)}</code>
                : <span className="audit-absent">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Audit log tab ────────────────────────────────────────────────────────────
const ACTION_OPTIONS = [
  '', 'agent.create', 'agent.update', 'agent.delete', 'agent.visibility_change',
  'skill.create', 'skill.update', 'skill.delete',
];
const ENTITY_OPTIONS = ['', 'agent', 'skill', 'user'];

function AuditLogTab({ user }) {
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async (f, p) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getAuditLog({ ...f, page: p, pageSize: 20 });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters, page);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFilter(e) {
    e.preventDefault();
    setPage(1);
    setExpanded(null);
    load(filters, 1);
  }

  function handlePageChange(next) {
    setPage(next);
    setExpanded(null);
    load(filters, next);
  }

  function toggleExpand(id) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  if (!user?.isAdmin) {
    return <p className="filter-empty">Access restricted to administrators.</p>;
  }

  return (
    <div>
      <div className="agents-page-header">
        <div>
          <h2 className="agents-page-title">Audit Log</h2>
          {result && (
            <p className="agents-page-sub">{result.total} record{result.total !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      <form className="audit-filters" onSubmit={handleFilter}>
        <div className="audit-filter-row">
          <div className="field-group audit-filter-field">
            <label className="field-label">Action</label>
            <select
              className="field-input"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            >
              {ACTION_OPTIONS.map((a) => (
                <option key={a} value={a}>{a || 'All actions'}</option>
              ))}
            </select>
          </div>

          <div className="field-group audit-filter-field">
            <label className="field-label">Entity type</label>
            <select
              className="field-input"
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
            >
              {ENTITY_OPTIONS.map((t) => (
                <option key={t} value={t}>{t || 'All types'}</option>
              ))}
            </select>
          </div>

          <div className="field-group audit-filter-field">
            <label className="field-label">From</label>
            <input
              type="date"
              className="field-input"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>

          <div className="field-group audit-filter-field">
            <label className="field-label">To</label>
            <input
              type="date"
              className="field-input"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>

          <div className="audit-filter-actions">
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const cleared = { action: '', entityType: '', from: '', to: '' };
                setFilters(cleared);
                setPage(1);
                setExpanded(null);
                load(cleared, 1);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      {error && <p className="field-error-msg" style={{ marginBottom: 12 }}>{error}</p>}

      {result && result.items.length === 0 && (
        <p className="filter-empty">No audit records match the current filters.</p>
      )}

      {result && result.items.length > 0 && (
        <>
          <div className="audit-list">
            {result.items.map((item) => (
              <div key={item.id} className="audit-row">
                <button
                  className="audit-row-summary"
                  onClick={() => toggleExpand(item.id)}
                  type="button"
                >
                  <span className="audit-action">{item.action}</span>
                  <span className="audit-entity">{item.entityType} <code className="audit-id">{item.entityId}</code></span>
                  <span className="audit-actor">
                    {item.actorEmailSnapshot || item.actorId || 'system'}
                  </span>
                  <span className="audit-time">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  <span className="audit-chevron">{expanded === item.id ? '▲' : '▼'}</span>
                </button>

                {expanded === item.id && (
                  <div className="audit-detail">
                    <div className="audit-detail-meta">
                      <span><strong>ID:</strong> {item.id}</span>
                      {item.ip && <span><strong>IP:</strong> {item.ip}</span>}
                    </div>
                    <JsonDiff before={item.before} after={item.after} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="audit-pagination">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              ← Prev
            </button>
            <span className="audit-page-info">
              Page {page} of {Math.ceil(result.total / result.pageSize) || 1}
            </span>
            <button
              className="btn"
              disabled={!result.hasMore}
              onClick={() => handlePageChange(page + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── AdminPage root ───────────────────────────────────────────────────────────
export default function AdminPage({ builtinSkills, personaCategories, templates, onBuiltinSkillsChange, onPersonaCategoriesChange, onTemplatesChange, isAuthenticated, user, onOpenAuth }) {
  const [tab, setTab] = useState('skills');

  return (
    <div className="agents-page">
      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Admin</h1>
          <p className="agents-page-sub">Manage builtin skills, persona libraries, and templates</p>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'skills' ? ' active' : ''}`} onClick={() => setTab('skills')}>
          Builtin Skills
        </button>
        <button className={`admin-tab${tab === 'personas' ? ' active' : ''}`} onClick={() => setTab('personas')}>
          Personas
        </button>
        <button className={`admin-tab${tab === 'templates' ? ' active' : ''}`} onClick={() => setTab('templates')}>
          Templates
        </button>
        {user?.isAdmin && (
          <button className={`admin-tab${tab === 'audit' ? ' active' : ''}`} onClick={() => setTab('audit')}>
            Audit Log
          </button>
        )}
      </div>

      <div className="admin-tab-content">
        {tab === 'skills' ? (
          <BuiltinSkillsTab
            skills={builtinSkills}
            onSkillsChange={onBuiltinSkillsChange}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
          />
        ) : tab === 'personas' ? (
          <PersonasTab
            categories={personaCategories}
            onCategoriesChange={onPersonaCategoriesChange}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
          />
        ) : tab === 'audit' ? (
          <AuditLogTab user={user} />
        ) : (
          <TemplatesTab
            templates={templates}
            onTemplatesChange={onTemplatesChange}
            isAuthenticated={isAuthenticated}
            onOpenAuth={onOpenAuth}
          />
        )}
      </div>
    </div>
  );
}
