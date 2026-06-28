import React from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  { keys: [`${mod}+Z`],              action: 'Undo' },
  { keys: [`${mod}+Shift+Z`, `${isMac ? '⌃' : 'Ctrl'}+Y`], action: 'Redo' },
  { keys: [`${mod}+S`],              action: 'Save agent' },
  { keys: [`${mod}+E`],              action: 'Export to Markdown' },
  { keys: ['?'],                      action: 'Show / hide this help' },
  { keys: ['Esc'],                    action: 'Close overlay' },
];

export default function ShortcutsOverlay({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <table className="shortcuts-table">
            <tbody>
              {SHORTCUTS.map(({ keys, action }) => (
                <tr key={action} className="shortcuts-row">
                  <td className="shortcuts-keys">
                    {keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && <span className="shortcuts-or"> or </span>}
                        <kbd className="kbd">{k}</kbd>
                      </React.Fragment>
                    ))}
                  </td>
                  <td className="shortcuts-action">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="shortcuts-hint">Shortcuts do not fire when a text field is focused, except {mod}+S which always saves.</p>
        </div>
      </div>
    </div>
  );
}
