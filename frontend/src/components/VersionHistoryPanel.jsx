import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { TOOL_META } from '../toolMeta.jsx';

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// LCS-based line diff. a=current, b=snapshot.
// 'add' = in snapshot only (will be added on restore)
// 'remove' = in current only (will be removed on restore)
function lineDiff(currentText, snapText) {
  const a = (currentText || '').split('\n');
  const b = (snapText || '').split('\n');
  if (a.length * b.length > 40000) {
    return [
      ...a.map((t) => ({ type: 'remove', text: t })),
      ...b.map((t) => ({ type: 'add', text: t })),
    ];
  }
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'equal', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', text: a[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

function FieldDiff({ label, current, snap }) {
  const changed = current !== snap;
  return (
    <div className="diff-field">
      <span className="diff-field-label">{label}</span>
      {changed ? (
        <div className="diff-field-changed">
          <div className="diff-field-value diff-remove">{current || <em className="diff-empty">empty</em>}</div>
          <div className="diff-field-value diff-add">{snap || <em className="diff-empty">empty</em>}</div>
        </div>
      ) : (
        <div className="diff-field-value diff-equal">{snap || <em className="diff-empty">empty</em>}</div>
      )}
    </div>
  );
}

function PromptDiff({ current, snap }) {
  if (!current && !snap) {
    return <div className="diff-notice">No system prompt in either version.</div>;
  }
  if (current === snap) {
    return <div className="diff-notice">No changes to system prompt.</div>;
  }
  const lines = lineDiff(current, snap);
  if (!lines.some((l) => l.type !== 'equal')) {
    return <div className="diff-notice">No changes to system prompt.</div>;
  }
  return (
    <div className="diff-prompt">
      {lines.map((line, idx) => (
        <div key={idx} className={`diff-line diff-line-${line.type}`}>
          <span className="diff-line-marker">
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span className="diff-line-text">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

function ListDiff({ current, snap, labelFn }) {
  const currentSet = new Set(current);
  const snapSet = new Set(snap);
  const all = [...new Set([...current, ...snap])];
  if (all.length === 0) return <div className="diff-notice">None in either version.</div>;
  return (
    <div className="diff-chips">
      {all.map((id) => {
        const inCurrent = currentSet.has(id);
        const inSnap = snapSet.has(id);
        const type = inSnap && !inCurrent ? 'add' : !inSnap && inCurrent ? 'remove' : 'equal';
        return (
          <span key={id} className={`diff-chip diff-chip-${type}`}>{labelFn(id)}</span>
        );
      })}
    </div>
  );
}

export default function VersionHistoryPanel({ agentId, currentAgent, allSkills, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNo, setSelectedNo] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState(null);

  useEffect(() => {
    api.listAgentVersions(agentId)
      .then((list) => {
        setVersions(list);
        if (list.length > 0) setSelectedNo(list[0].versionNo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    if (selectedNo == null) return;
    setDetail(null);
    setConfirmRestore(false);
    setRestoreError(null);
    setLoadingDetail(true);
    api.getAgentVersion(agentId, selectedNo)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [agentId, selectedNo]);

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreError(null);
    try {
      const result = await api.restoreAgentVersion(agentId, selectedNo);
      onRestore(result);
      onClose();
    } catch (err) {
      setRestoreError(err.message);
      setRestoring(false);
      setConfirmRestore(false);
    }
  };

  const snap = detail?.snapshot;
  const toolLabel = (id) => TOOL_META[id]?.label || id;
  const skillLabel = (id) => allSkills.find((s) => s.id === id)?.label || id;
  const selectedMeta = versions.find((v) => v.versionNo === selectedNo);

  return (
    <>
      <div className="version-backdrop" onClick={onClose} />
      <div className="version-panel" role="dialog" aria-label="Version History">
        <div className="version-panel-header">
          <h2 className="version-panel-title">Version History</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="version-panel-body">
          <div className="version-list">
            {loading && <p className="version-status">Loading…</p>}
            {error && <p className="version-status version-error-text">{error}</p>}
            {!loading && !error && versions.length === 0 && (
              <p className="version-status">No versions saved yet.</p>
            )}
            {versions.map((v) => (
              <button
                key={v.versionNo}
                className={`version-item${selectedNo === v.versionNo ? ' active' : ''}`}
                onClick={() => setSelectedNo(v.versionNo)}
              >
                <div className="version-no">v{v.versionNo}</div>
                <div className="version-meta">
                  <div className="version-summary">{v.changeSummary || 'Saved'}</div>
                  <div className="version-time">{formatRelativeTime(v.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="version-diff">
            {!selectedNo && !loading && (
              <div className="version-diff-empty">Select a version to preview changes.</div>
            )}
            {loadingDetail && (
              <div className="version-diff-empty">Loading snapshot…</div>
            )}
            {snap && !loadingDetail && (
              <>
                <div className="diff-section">
                  <div className="diff-section-title">Name &amp; Persona</div>
                  <FieldDiff label="Name" current={currentAgent.name} snap={snap.name} />
                  <FieldDiff label="Persona" current={currentAgent.persona} snap={snap.persona} />
                </div>

                <div className="diff-section">
                  <div className="diff-section-title">System Prompt</div>
                  <PromptDiff current={currentAgent.systemPrompt} snap={snap.systemPrompt} />
                </div>

                <div className="diff-section">
                  <div className="diff-section-title">Tools</div>
                  <ListDiff current={currentAgent.tools || []} snap={snap.tools || []} labelFn={toolLabel} />
                </div>

                <div className="diff-section">
                  <div className="diff-section-title">Skills</div>
                  <ListDiff current={currentAgent.skills || []} snap={snap.skills || []} labelFn={skillLabel} />
                </div>
              </>
            )}
          </div>
        </div>

        {selectedNo != null && (
          <div className="version-panel-footer">
            {restoreError && <p className="version-error-text version-error-inline">{restoreError}</p>}
            {confirmRestore ? (
              <div className="version-confirm">
                <span className="version-confirm-msg">
                  Restore v{selectedNo}? The current state will be replaced and a new version snapshot will be created.
                </span>
                <div className="version-confirm-actions">
                  <button className="btn subtle" onClick={() => setConfirmRestore(false)}>Cancel</button>
                  <button className="btn primary" onClick={handleRestore} disabled={restoring}>
                    {restoring ? 'Restoring…' : 'Confirm restore'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="version-footer-row">
                <span className="version-footer-label">
                  {selectedMeta?.changeSummary || `Version ${selectedNo}`}
                </span>
                <button
                  className="btn primary"
                  onClick={() => setConfirmRestore(true)}
                  disabled={!snap || loadingDetail}
                >
                  Restore v{selectedNo}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
