import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentNode from './AgentNode.jsx';
import ToolNode from './ToolNode.jsx';
import { TOOL_META } from '../toolMeta.jsx';
import { useNodeDrag } from '../useNodeDrag.jsx';

const AGENT_POS = { x: 36, y: 36 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.1;

export default function Canvas({
  agent,
  onChangeAgentField,
  onMoveTool,
  onMoveToolEnd,
  onAddTool,
  onRemoveTool,
  onToggleSkill,
  onToggleInstruction,
  allSkills,
  agentCategories = [],
  zoom = 1,
  pan = { x: 0, y: 0 },
  onZoomPanChange,
  validationState,
  onViewSource,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const agentRef = useRef(null);
  const toolRefs = useRef(new Map());
  const [wires, setWires] = useState([]);

  const taggedIssues = useMemo(() => {
    if (!validationState) return [];
    return [
      ...validationState.errors.map((e) => ({ ...e, severity: 'error' })),
      ...validationState.warnings.map((w) => ({ ...w, severity: 'warning' })),
    ];
  }, [validationState]);

  const agentFieldIssues = useMemo(() => ({
    name: taggedIssues.filter((i) => i.field === 'name'),
    persona: taggedIssues.filter((i) => i.field === 'persona'),
    systemPrompt: taggedIssues.filter((i) => i.field === 'systemPrompt'),
    node: taggedIssues.filter((i) => !i.field),
  }), [taggedIssues]);

  const toolIssuesMap = useMemo(() => {
    const map = {};
    for (const issue of taggedIssues) {
      if (issue.nodeId) {
        if (!map[issue.nodeId]) map[issue.nodeId] = [];
        map[issue.nodeId].push(issue);
      }
    }
    return map;
  }, [taggedIssues]);

  // Wire positions: getBoundingClientRect returns screen-space coords.
  // With scale(zoom) applied to the canvas element, screen deltas / zoom = canvas-space (SVG) coords.
  const recalc = useCallback(() => {
    const canvasEl = canvasRef.current;
    const agentEl = agentRef.current;
    if (!canvasEl || !agentEl) return;

    const canvasRect = canvasEl.getBoundingClientRect();
    const agentRect = agentEl.getBoundingClientRect();
    const agentPort = {
      x: (agentRect.right - canvasRect.left) / zoom,
      y: (agentRect.top - canvasRect.top + agentRect.height / 2) / zoom,
    };

    const nextWires = agent.tools
      .map((toolId) => {
        const toolEl = toolRefs.current.get(toolId);
        if (!toolEl) return null;
        const toolRect = toolEl.getBoundingClientRect();
        const toolPort = {
          x: (toolRect.left - canvasRect.left) / zoom,
          // 34px is the port offset in canvas-local (CSS) pixels
          y: (toolRect.top - canvasRect.top) / zoom + 34,
        };
        const dx = Math.max(50, (toolPort.x - agentPort.x) / 2);
        const d = `M ${agentPort.x} ${agentPort.y} C ${agentPort.x + dx} ${agentPort.y}, ${toolPort.x - dx} ${toolPort.y}, ${toolPort.x} ${toolPort.y}`;
        return { toolId, d, color: TOOL_META[toolId].color };
      })
      .filter(Boolean);

    setWires(nextWires);
  }, [agent.tools, zoom]);

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

  // Wheel zoom towards cursor, registered with passive:false to suppress browser scroll.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !onZoomPanChange) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const wrapRect = el.getBoundingClientRect();
      const cx = e.clientX - wrapRect.left;
      const cy = e.clientY - wrapRect.top;

      onZoomPanChange((prev) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * delta));
        const ratio = newZoom / prev.zoom;
        return {
          zoom: newZoom,
          pan: {
            x: cx - (cx - prev.pan.x) * ratio,
            y: cy - (cy - prev.pan.y) * ratio,
          },
        };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [onZoomPanChange]);

  const handleAgentDrag = useNodeDrag((updater) => onMoveTool('agent', updater), zoom, onMoveToolEnd);

  // Pan by dragging canvas background (not a node or its children).
  const handlePanStart = useCallback(
    (e) => {
      if (e.button !== 0 || !onZoomPanChange) return;
      if (e.target.closest('.node, .canvas-empty-hint')) return;

      const onMove = (ev) => {
        onZoomPanChange((prev) => ({
          ...prev,
          pan: { x: prev.pan.x + ev.movementX, y: prev.pan.y + ev.movementY },
        }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onZoomPanChange]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    const toolId = e.dataTransfer.getData('toolId');
    if (!toolId || !TOOL_META[toolId]) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // Convert screen drop position to canvas-space, then offset to center the node (~220×60px).
    const x = Math.max(0, (e.clientX - rect.left) / zoom - 110);
    const y = Math.max(0, (e.clientY - rect.top) / zoom - 30);
    onAddTool(toolId, { x, y });
  };

  const agentPos = agent.positions.agent || AGENT_POS;

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPointerDown={handlePanStart}
    >
      <div
        className="canvas"
        ref={canvasRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg className="wires-svg" style={{ pointerEvents: 'none' }}>
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
          onToggleSkill={onToggleSkill}
          onToggleInstruction={onToggleInstruction}
          allSkills={allSkills}
          categories={agentCategories}
          fieldIssues={validationState ? agentFieldIssues : null}
          onViewSource={onViewSource}
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
              zoom={zoom}
              issues={toolIssuesMap[toolId] || []}
              onMoveEnd={onMoveToolEnd}
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
