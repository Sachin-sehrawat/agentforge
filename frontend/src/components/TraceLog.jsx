import React from 'react';
import { ICONS, TOOL_META } from '../toolMeta.jsx';

function formatValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.length > 220 ? value.slice(0, 220) + '…' : value;
  try {
    const json = JSON.stringify(value, null, 0);
    return json.length > 220 ? json.slice(0, 220) + '…' : json;
  } catch {
    return String(value);
  }
}

function TraceRows({ data, prefix }) {
  if (!data || typeof data !== 'object') return null;
  return Object.entries(data).map(([key, val]) => {
    const formatted = formatValue(val);
    if (formatted === null) return null;
    return (
      <div className="trace-item-row" key={`${prefix}-${key}`}>
        <span className="k">{key}:</span> {formatted}
      </div>
    );
  });
}

export default function TraceLog({ trace }) {
  return (
    <div className="panel-section trace">
      <div className="panel-heading">
        Tool activity
        {trace.length > 0 && <span className="count">{trace.length}</span>}
      </div>

      <div className="trace-list">
        {trace.length === 0 && (
          <div className="trace-empty">
            Every tool call your agent makes will show up here, in sync with a pulse on the
            canvas.
          </div>
        )}

        {trace.map((entry, i) => {
          const meta = TOOL_META[entry.tool] || { label: entry.tool, color: 'var(--text-muted)' };
          const Icon = ICONS[entry.tool];
          return (
            <div className="trace-item" key={i} style={{ '--item-color': meta.color }}>
              <div className="trace-item-head">
                {Icon && <Icon />}
                {meta.label}
                {entry.server && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>· built-in</span>}
              </div>
              <TraceRows data={entry.input} prefix={`${i}-in`} />
              <TraceRows data={entry.output} prefix={`${i}-out`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
