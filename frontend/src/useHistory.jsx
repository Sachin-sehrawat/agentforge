import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 50;
const TEXT_DEBOUNCE_MS = 600;

function serialize(agent) {
  const sortedPositions = {};
  for (const k of Object.keys(agent.positions ?? {}).sort()) {
    sortedPositions[k] = (agent.positions ?? {})[k];
  }
  return JSON.stringify({
    name: agent.name ?? '',
    persona: agent.persona ?? '',
    systemPrompt: agent.systemPrompt ?? '',
    tools: agent.tools ?? [],
    positions: sortedPositions,
    skills: agent.skills ?? [],
    instructions: agent.instructions ?? [],
    tags: agent.tags ?? [],
  });
}

export function useHistory() {
  const past = useRef([]);   // serialized agent strings, oldest first
  const future = useRef([]); // serialized agent strings for redo

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Burst-coalescing state for text field edits
  const debounceTimer = useRef(null);
  const inTextBurst = useRef(false);

  function sync() {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  }

  // Push a full agent snapshot as a history checkpoint.
  // No-op if the serialized snapshot is identical to the stack head.
  const pushHistory = useCallback((snapshot) => {
    const s = serialize(snapshot);
    if (s === past.current[past.current.length - 1]) return;
    past.current = [...past.current.slice(-(MAX_HISTORY - 1)), s];
    future.current = [];
    sync();
  }, []);

  // For text-field edits: push the pre-change snapshot only on the first
  // call within a continuous typing burst; subsequent calls within
  // TEXT_DEBOUNCE_MS are coalesced into the same checkpoint.
  const pushHistoryDebounced = useCallback((preChangeSnapshot) => {
    if (!inTextBurst.current) {
      pushHistory(preChangeSnapshot);
      inTextBurst.current = true;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      inTextBurst.current = false;
    }, TEXT_DEBOUNCE_MS);
  }, [pushHistory]);

  // Restore the previous state. Returns the previous agent object or null.
  // Also resets the text burst so a follow-up typing sequence captures a new checkpoint.
  const undo = useCallback((currentSnapshot) => {
    if (past.current.length === 0) return null;
    inTextBurst.current = false;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [serialize(currentSnapshot), ...future.current];
    sync();
    return JSON.parse(prev);
  }, []);

  // Reapply a previously undone state. Returns the next agent object or null.
  const redo = useCallback((currentSnapshot) => {
    if (future.current.length === 0) return null;
    inTextBurst.current = false;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, serialize(currentSnapshot)];
    sync();
    return JSON.parse(next);
  }, []);

  // Clear all history; call on agent switch.
  const clearHistory = useCallback(() => {
    past.current = [];
    future.current = [];
    inTextBurst.current = false;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    sync();
  }, []);

  return { pushHistory, pushHistoryDebounced, undo, redo, canUndo, canRedo, clearHistory };
}
