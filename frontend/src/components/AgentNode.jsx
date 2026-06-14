import React, { useState } from 'react';
import { AGENT_ICON } from '../toolMeta.jsx';
import { PERSONA_CATEGORIES } from '../data/personas.js';

const PERSONA_LOOKUP = Object.fromEntries(
  PERSONA_CATEGORIES.flatMap((c) => c.personas.map((p) => [p.id, { ...p, color: c.color }]))
);

const AgentNode = React.forwardRef(function AgentNode(
  { position, agent, onChange, onHeaderPointerDown, onToggleSkill, onToggleInstruction, allSkills },
  ref
) {
  const [expandedSkill, setExpandedSkill] = useState(null);
  const [expandedInstruction, setExpandedInstruction] = useState(null);

  const activeSkills = (agent.skills || [])
    .map((id) => (allSkills || []).find((s) => s.id === id))
    .filter(Boolean);

  const activeInstructions = (agent.instructions || [])
    .map((id) => PERSONA_LOOKUP[id])
    .filter(Boolean);

  return (
    <div
      ref={ref}
      className="node agent-node"
      style={{ left: position.x, top: position.y }}
    >
      <div className="node-header" onPointerDown={onHeaderPointerDown}>
        <span className="node-icon">
          <AGENT_ICON />
        </span>
        <span className="node-title">Agent core</span>
      </div>
      <div className="node-body">
        <div>
          <label className="field-label" htmlFor="agent-name">Name</label>
          <input
            id="agent-name"
            className="field-input"
            value={agent.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Research Buddy"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="agent-persona">Persona</label>
          <input
            id="agent-persona"
            className="field-input"
            value={agent.persona}
            onChange={(e) => onChange('persona', e.target.value)}
            placeholder="e.g. A cheerful research assistant who cites sources."
          />
        </div>
        <div>
          <label className="field-label" htmlFor="agent-prompt">System prompt</label>
          <textarea
            id="agent-prompt"
            className="field-textarea"
            value={agent.systemPrompt}
            onChange={(e) => onChange('systemPrompt', e.target.value)}
            placeholder="Extra instructions for how the agent should behave and when to use its tools..."
          />
        </div>

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
