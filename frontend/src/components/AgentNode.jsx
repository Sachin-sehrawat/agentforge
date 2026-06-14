import React from 'react';
import { AGENT_ICON } from '../toolMeta.jsx';

const AgentNode = React.forwardRef(function AgentNode(
  { position, agent, onChange, onHeaderPointerDown },
  ref
) {
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
      </div>
      <div className="agent-port" />
    </div>
  );
});

export default AgentNode;
