import React from 'react';

function formatResetTime(resetsAt) {
  if (!resetsAt) return '';
  const d = new Date(resetsAt);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

export default function QuotaUpgradeModal({ action, limit, used, resetsAt, onClose }) {
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const actionLabel = action === 'save' ? 'saves' : 'exports';

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop}>
      <div className="modal quota-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="quota-title">
        <div className="modal-header">
          <h2 className="modal-title" id="quota-title">Daily limit reached</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body quota-upgrade-body">
          <div className="quota-upgrade-icon">🚦</div>
          <p className="quota-upgrade-message">
            You&rsquo;ve used <strong>{used} of {limit} {actionLabel}</strong> today.
          </p>
          <p className="quota-upgrade-reset">
            Your quota resets at <strong>{formatResetTime(resetsAt)}</strong>.
          </p>
          <p className="quota-upgrade-cta-text">
            Upgrade to a paid plan for unlimited {actionLabel}.
          </p>
          <div className="quota-upgrade-actions">
            <button className="btn primary" onClick={onClose}>
              Upgrade
            </button>
            <button className="btn subtle" onClick={onClose}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
