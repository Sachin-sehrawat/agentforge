import React from 'react';

function IssueItem({ issue, onClick }) {
  return (
    <button className="validation-item" onClick={() => onClick(issue)} title="Click to navigate to this issue">
      <span className="validation-item-msg">{issue.message}</span>
      {issue.field && (
        <span className="validation-item-field">{issue.field}</span>
      )}
    </button>
  );
}

export default function ValidationPanel({ errors, warnings, action, onClose, onOverride, onItemClick }) {
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const actionLabel = action === 'save' ? 'Save anyway' : 'Export anyway';

  return (
    <div className="validation-panel">
      <div className="validation-panel-header">
        <div className="validation-panel-title">
          {hasErrors ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Fix errors to {action === 'save' ? 'save' : 'export'}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Review warnings
            </>
          )}
        </div>
        <button className="validation-panel-close" onClick={onClose} title="Dismiss">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="validation-panel-body">
        {hasErrors && (
          <div className="validation-section validation-errors">
            <div className="validation-section-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Errors — {action === 'save' ? 'save' : 'export'} blocked ({errors.length})
            </div>
            {errors.map((e, i) => (
              <IssueItem key={i} issue={e} onClick={onItemClick} />
            ))}
          </div>
        )}
        {hasWarnings && (
          <div className="validation-section validation-warnings">
            <div className="validation-section-label">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Warnings ({warnings.length})
            </div>
            {warnings.map((w, i) => (
              <IssueItem key={i} issue={w} onClick={onItemClick} />
            ))}
          </div>
        )}
      </div>

      <div className="validation-panel-footer">
        <button className="btn subtle" onClick={onClose}>Dismiss</button>
        {!hasErrors && (
          <button className="btn primary" onClick={onOverride}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
