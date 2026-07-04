import React, { useState } from 'react';
import { AGENT_ICON } from '../toolMeta.jsx';
import { PERSONA_CATEGORIES } from '../data/personas.js';

const PERSONA_LOOKUP = Object.fromEntries(
  PERSONA_CATEGORIES.flatMap((c) => c.personas.map((p) => [p.id, { ...p, color: c.color }]))
);

const TAG_MAX_LENGTH = 30;
const TAG_MAX_COUNT = 10;

const AgentNode = React.forwardRef(function AgentNode(
  { position, agent, onChange, onHeaderPointerDown, onToggleSkill, onToggleInstruction, allSkills, categories = [], fieldIssues, onViewSource },
  ref
) {
  const [expandedSkill, setExpandedSkill] = useState(null);
  const [expandedInstruction, setExpandedInstruction] = useState(null);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState('');

  function addTag(raw) {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    const currentTags = agent.tags || [];
    if (value.length > TAG_MAX_LENGTH) {
      setTagError(`Tag must be ${TAG_MAX_LENGTH} characters or fewer`);
      return;
    }
    if (currentTags.length >= TAG_MAX_COUNT) {
      setTagError(`Maximum ${TAG_MAX_COUNT} tags allowed`);
      return;
    }
    if (currentTags.includes(value)) {
      setTagError('Tag already added');
      return;
    }
    setTagError('');
    onChange('tags', [...currentTags, value]);
    setTagInput('');
  }

  function removeTag(tag) {
    onChange('tags', (agent.tags || []).filter((t) => t !== tag));
  }

  function handleTagKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && tagInput === '' && (agent.tags || []).length > 0) {
      const tags = agent.tags || [];
      onChange('tags', tags.slice(0, -1));
    }
  }

  function fieldSeverity(field) {
    if (!fieldIssues) return null;
    const issues = fieldIssues[field] || [];
    if (issues.some((i) => i.severity === 'error')) return 'error';
    if (issues.length > 0) return 'warning';
    return null;
  }

  const nodeLevel = fieldIssues?.node || [];
  const nodeSeverity = nodeLevel.some((i) => i.severity === 'error') ? 'error'
    : nodeLevel.length > 0 ? 'warning' : null;

  const activeSkills = (agent.skills || [])
    .map((id) => (allSkills || []).find((s) => s.id === id))
    .filter(Boolean);

  const activeInstructions = (agent.instructions || [])
    .map((id) => PERSONA_LOOKUP[id])
    .filter(Boolean);

  return (
    <div
      ref={ref}
      className={`node agent-node${nodeSeverity ? ` node-has-${nodeSeverity}` : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      <div className="node-header" onPointerDown={onHeaderPointerDown}>
        <span className="node-icon">
          <AGENT_ICON />
        </span>
        <span className="node-title">Agent core</span>
        {nodeSeverity && (
          <span className={`node-issue-dot node-issue-dot--${nodeSeverity}`} title="This node has validation issues" />
        )}
      </div>
      <div className="node-body">
        <div>
          <label className={`field-label${fieldSeverity('name') ? ` field-label--${fieldSeverity('name')}` : ''}`} htmlFor="agent-name">Name</label>
          <input
            id="agent-name"
            className={`field-input${fieldSeverity('name') ? ` field-input--${fieldSeverity('name')}` : ''}`}
            value={agent.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Research Buddy"
          />
        </div>
        <div>
          <label className={`field-label${fieldSeverity('persona') ? ` field-label--${fieldSeverity('persona')}` : ''}`} htmlFor="agent-persona">Persona</label>
          <input
            id="agent-persona"
            className={`field-input${fieldSeverity('persona') ? ` field-input--${fieldSeverity('persona')}` : ''}`}
            value={agent.persona}
            onChange={(e) => onChange('persona', e.target.value)}
            placeholder="e.g. A cheerful research assistant who cites sources."
          />
        </div>
        <div>
          <label className={`field-label${fieldSeverity('systemPrompt') ? ` field-label--${fieldSeverity('systemPrompt')}` : ''}`} htmlFor="agent-prompt">System prompt</label>
          <textarea
            id="agent-prompt"
            className={`field-textarea${fieldSeverity('systemPrompt') ? ` field-input--${fieldSeverity('systemPrompt')}` : ''}`}
            value={agent.systemPrompt}
            onChange={(e) => onChange('systemPrompt', e.target.value)}
            placeholder="Extra instructions for how the agent should behave and when to use its tools..."
          />
        </div>

        <div>
          <label className="field-label" htmlFor="agent-tags">Tags</label>
          <div className="agent-tags-input-row">
            {(agent.tags || []).map((tag) => (
              <span key={tag} className="agent-tag-pill">
                {tag}
                <button
                  className="agent-tag-remove"
                  onClick={() => removeTag(tag)}
                  title={`Remove tag "${tag}"`}
                >
                  ✕
                </button>
              </span>
            ))}
            {(agent.tags || []).length < TAG_MAX_COUNT && (
              <input
                id="agent-tags"
                className="agent-tags-input"
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setTagError(''); }}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                placeholder={(agent.tags || []).length === 0 ? 'e.g. research, coding' : ''}
                maxLength={TAG_MAX_LENGTH + 1}
              />
            )}
          </div>
          {tagError && <span className="field-error">{tagError}</span>}
        </div>

        {categories.length > 0 && (
          <div>
            <label className="field-label" htmlFor="agent-category">Category</label>
            <select
              id="agent-category"
              className="field-input"
              value={agent.categoryId ?? ''}
              onChange={(e) => onChange('categoryId', e.target.value || null)}
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
        )}

        {agent.forkedFrom && (
          <div className="agent-provenance">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
              <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>
              <line x1="12" y1="12" x2="12" y2="15"/>
            </svg>
            Forked from{' '}
            {agent.forkedFromName ? (
              <button
                className="provenance-link"
                onClick={() => onViewSource?.(agent.forkedFrom)}
                title={`View source: ${agent.forkedFromName}`}
              >
                {agent.forkedFromName}
              </button>
            ) : (
              <span className="provenance-deleted">[deleted agent]</span>
            )}
          </div>
        )}

        {activeSkills.length > 0 && (
          <div className="node-skills-section">
            <div className="node-skills-label">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="8 1 10.2 5.5 15 6.2 11.5 9.6 12.4 14.4 8 12 3.6 14.4 4.5 9.6 1 6.2 5.8 5.5 8 1" />
              </svg>
              Active skills
              <span className="node-skills-count">{activeSkills.length}</span>
            </div>
            <div className="node-skills-list">
              {activeSkills.map((skill) => {
                const isExpanded = expandedSkill === skill.id;
                return (
                  <div
                    key={skill.id}
                    className={`node-skill-item${isExpanded ? ' expanded' : ''}`}
                    style={{ '--skill-color': skill.color }}
                  >
                    <div className="node-skill-row">
                      <span className="node-skill-dot" />
                      <button
                        className="node-skill-name"
                        onClick={() => setExpandedSkill(isExpanded ? null : skill.id)}
                        title={isExpanded ? 'Collapse' : 'Expand instruction'}
                      >
                        {skill.label}
                        <svg className="node-skill-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points={isExpanded ? '2 8 6 4 10 8' : '2 4 6 8 10 4'} />
                        </svg>
                      </button>
                      <button
                        className="node-skill-remove"
                        onClick={() => onToggleSkill(skill.id)}
                        title={`Remove ${skill.label} skill`}
                      >
                        ✕
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="node-skill-instruction">
                        {skill.instruction}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeInstructions.length > 0 && (
          <div className="node-skills-section">
            <div className="node-skills-label">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M2 8h8M2 12h5" />
              </svg>
              Agent instructions
              <span className="node-skills-count">{activeInstructions.length}</span>
            </div>
            <div className="node-skills-list">
              {activeInstructions.map((p) => {
                const isExpanded = expandedInstruction === p.id;
                return (
                  <div
                    key={p.id}
                    className={`node-skill-item${isExpanded ? ' expanded' : ''}`}
                    style={{ '--skill-color': p.color }}
                  >
                    <div className="node-skill-row">
                      <span className="node-skill-dot" />
                      <button
                        className="node-skill-name"
                        onClick={() => setExpandedInstruction(isExpanded ? null : p.id)}
                        title={isExpanded ? 'Collapse' : 'Expand instruction'}
                      >
                        {p.name}
                        <svg className="node-skill-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points={isExpanded ? '2 8 6 4 10 8' : '2 4 6 8 10 4'} />
                        </svg>
                      </button>
                      <button
                        className="node-skill-remove"
                        onClick={() => onToggleInstruction(p)}
                        title={`Remove ${p.name} instruction`}
                      >
                        ✕
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="node-skill-instruction">
                        {p.systemPrompt}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="agent-port" />
    </div>
  );
});

export default AgentNode;
