import React from 'react';
import PersonaLibrary from './PersonaLibrary.jsx';

export default function PersonaPanel({ activeInstructions, onToggleInstruction, categories }) {
  return (
    <aside className="persona-panel">
      <div className="persona-panel-header">
        <h2 className="persona-panel-title">Instructions Library</h2>
        <p className="persona-panel-hint">
          Click an instruction set to add it to your agent. Click again to remove it.
        </p>
      </div>
      <div className="persona-panel-body">
        <PersonaLibrary
          activeInstructions={activeInstructions}
          onToggleInstruction={onToggleInstruction}
          categories={categories}
        />
      </div>
    </aside>
  );
}
