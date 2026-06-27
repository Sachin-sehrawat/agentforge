import React, { useRef, useState } from 'react';
import { api } from '../api.js';

export default function ImportModal({ onClose, onCommit }) {
  const [phase, setPhase] = useState('pick'); // 'pick' | 'review'
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('markdown');
  const [fileName, setFileName] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    setFormat(ext === 'json' ? 'json' : 'markdown');
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => setContent(ev.target.result);
    reader.readAsText(file);
  }

  async function handlePreview() {
    const text = content.trim();
    if (!text) {
      setError('Paste some content or pick a file first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.importAgent(format, text);
      setParsed(result.agent);
      setWarnings(result.warnings ?? []);
      setPhase('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setPhase('pick');
    setParsed(null);
    setWarnings([]);
    setError('');
  }

  function handleCommit() {
    onCommit(parsed);
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-header">
          <h2 className="modal-title" id="import-title">
            {phase === 'pick' ? 'Import agent' : 'Review import'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {phase === 'pick' ? (
          <div className="modal-body">
            <div className="import-file-zone" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.json"
                className="import-file-input"
                onChange={handleFileChange}
              />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="import-file-icon">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="import-file-label">
                {fileName ? fileName : 'Click to pick a .md or .json file'}
              </span>
            </div>

            <div className="import-divider">
              <span>or paste content below</span>
            </div>

            <div className="field-group">
              <div className="import-format-row">
                <label className="field-label">Format</label>
                <div className="import-format-tabs">
                  <button
                    type="button"
                    className={`import-format-tab${format === 'markdown' ? ' active' : ''}`}
                    onClick={() => setFormat('markdown')}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className={`import-format-tab${format === 'json' ? ' active' : ''}`}
                    onClick={() => setFormat('json')}
                  >
                    JSON
                  </button>
                </div>
              </div>
              <textarea
                className="field-input import-textarea"
                placeholder={format === 'json'
                  ? '{ "name": "My Agent", "tools": [...], ... }'
                  : '# My Agent\n\n## System Prompt\n...'}
                value={content}
                onChange={(e) => { setContent(e.target.value); setFileName(''); setError(''); }}
                rows={8}
                spellCheck={false}
              />
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn primary"
                onClick={handlePreview}
                disabled={loading || !content.trim()}
              >
                {loading ? 'Parsing…' : 'Preview import'}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="import-summary">
              <div className="import-summary-row">
                <span className="import-summary-label">Name</span>
                <span className="import-summary-value">{parsed.name || <em>Untitled</em>}</span>
              </div>
              {parsed.persona && (
                <div className="import-summary-row">
                  <span className="import-summary-label">Persona</span>
                  <span className="import-summary-value">{parsed.persona}</span>
                </div>
              )}
              <div className="import-summary-row">
                <span className="import-summary-label">Tools</span>
                <span className="import-summary-value">
                  {parsed.tools.length > 0 ? parsed.tools.join(', ') : <em>none</em>}
                </span>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="import-warnings">
                <p className="import-warnings-title">
                  {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                </p>
                <ul className="import-warnings-list">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="import-draft-note">
              The agent will load as an unsaved draft. Nothing is persisted until you click <strong>Save agent</strong>.
            </p>

            <div className="modal-footer">
              <button type="button" className="btn" onClick={handleBack}>Back</button>
              <button type="button" className="btn primary" onClick={handleCommit}>
                Load onto canvas
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
