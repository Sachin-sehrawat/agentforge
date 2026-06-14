import React from 'react';
import { ICONS, TOOL_META } from '../toolMeta.jsx';
import { useNodeDrag } from '../useNodeDrag.jsx';

const ToolNode = React.forwardRef(function ToolNode(
  { toolId, position, onMoveTool, onRemove, pulsing },
  ref
) {
  const meta = TOOL_META[toolId];
  const Icon = ICONS[toolId];
  const onHeaderPointerDown = useNodeDrag((updater) => onMoveTool(toolId, updater));


  return (
    <div
      ref={ref}
      className={`node tool-node${pulsing ? ' pulsing' : ''}`}
      style={{ left: position.x, top: position.y, '--node-color': meta.color }}
    >
      <div className="node-header" onPointerDown={onHeaderPointerDown}>
        <span className="node-icon">
          <Icon />
        </span>
        <span className="node-title">{meta.label}</span>
        <button className="node-remove" title="Remove tool" onClick={() => onRemove(toolId)}>
          ✕
        </button>
      </div>
      <div className="node-body">
        <span className="hint">{meta.blurb}</span>
      </div>
      <div className="tool-port" />
    </div>
  );
});

export default ToolNode;
