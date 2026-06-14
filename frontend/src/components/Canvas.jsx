import React, { useCallback, useEffect, useRef, useState } from 'react';
import AgentNode from './AgentNode.jsx';
import ToolNode from './ToolNode.jsx';
import { TOOL_META } from '../toolMeta.jsx';
import { useNodeDrag } from '../useNodeDrag.jsx';

const AGENT_POS = { x: 36, y: 36 };

export default function Canvas({
  agent,
  onChangeAgentField,
  onMoveTool,
  onAddTool,
  onRemoveTool,
}) {
  const canvasRef = useRef(null);
  const agentRef = useRef(null);
  const toolRefs = useRef(new Map());
  const [wires, setWires] = useState([]);

  const recalc = useCallback(() => {
    const canvasEl = canvasRef.current;
    const agentEl = agentRef.current;
    if (!canvasEl || !agentEl) return;

    const canvasRect = canvasEl.getBoundingClientRect();
    const agentRect = agentEl.getBoundingClientRect();
    const agentPort = {
      x: agentRect.right - canvasRect.left,
      y: agentRect.top - canvasRect.top + agentRect.height / 2,
    };

    const nextWires = agent.tools
      .map((toolId) => {
        const toolEl = toolRefs.current.get(toolId);
        if (!toolEl) return null;
        const toolRect = toolEl.getBoundingClientRect();
        const toolPort = {
          x: toolRect.left - canvasRect.left,
          y: toolRect.top - canvasRect.top + 34,
        };
        const dx = Math.max(50, (toolPort.x - agentPort.x) / 2);
        const d = `M ${agentPort.x} ${agentPort.y} C ${agentPort.x + dx} ${agentPort.y}, ${toolPort.x - dx} ${toolPort.y}, ${toolPort.x} ${toolPort.y}`;
        return { toolId, d, color: TOOL_META[toolId].color };
      })
      .filter(Boolean);

    setWires(nextWires);
  }, [agent.tools]);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (agentRef.current) ro.observe(agentRef.current);
    toolRefs.current.forEach((el) => el && ro.observe(el));
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalc, agent.positions]);

  const handleAgentDrag = useNodeDrag((updater) => {
    onMoveTool('agent', updater);
  });

  const handleDrop = (e) => {
    e.preventDefault();
    const toolId = e.dataTransfer.getData('toolId');
    if (!toolId || !TOOL_META[toolId]) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 110);
    const y = Math.max(0, e.clientY - rect.top - 30);
    onAddTool(toolId, { x, y });
  };

  const agentPos = agent.positions.agent || AGENT_POS;

  return (
    <div className="canvas-wrap" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <div className="canvas" ref={canvasRef}>
        <svg className="wires-svg">
          {wires.map((w) => (
            <path
              key={w.toolId}
              className="wire-path"
              style={{ '--node-color': w.color }}
              d={w.d}
            />
          ))}
        </svg>

        <AgentNode
          ref={agentRef}
          position={agentPos}
          agent={agent}
          onChange={onChangeAgentField}
          onHeaderPointerDown={handleAgentDrag}
        />

        {agent.tools.map((toolId) => {
          const pos = agent.positions[toolId] || { x: 420, y: 40 };
          return (
            <ToolNode
              key={toolId}
              ref={(el) => {
                if (el) toolRefs.current.set(toolId, el);
                else toolRefs.current.delete(toolId);
              }}
              toolId={toolId}
              position={pos}
              onMoveTool={onMoveTool}
              onRemove={onRemoveTool}
              pulsing={false}
            />
          );
        })}

        {agent.tools.length === 0 && (
          <div className="canvas-empty-hint" style={{ left: agentPos.x + 320, top: agentPos.y + 24 }}>
            Drag a tool from the left panel onto the canvas to wire it up to your agent.
          </div>
        )}
      </div>
    </div>
  );
}
