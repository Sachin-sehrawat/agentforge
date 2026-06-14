import React from 'react';
import { ICONS, TOOL_META, TOOL_ORDER } from '../toolMeta.jsx';

export default function Sidebar({ addedTools, onAddTool }) {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Tool palette</h2>
      <p className="sidebar-hint">
        Drag a tool onto the canvas to wire it up to your agent. The agent decides on its own
        when to use each one.
      </p>

      {TOOL_ORDER.map((toolId) => {
        const meta = TOOL_META[toolId];
        const Icon = ICONS[toolId];
        const added = addedTools.includes(toolId);
        return (
          <div
            key={toolId}
            className={`tool-card${added ? ' added' : ''}`}
            style={{ '--tool-color': meta.color }}
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
              <div className="tool-card-label">{meta.label}</div>
              <div className="tool-card-blurb">{meta.blurb}</div>
            </div>
          </div>
        );
      })}

      <div className="sidebar-foot">
        Tip: <code>Web Search</code> is handled by Claude directly. The other tools run on your
        own backend.
      </div>
    </aside>
  );
}
