import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const EASY_MODE_OVERRIDES = {
  'page.developer':         false,
  'page.settings':          false,
  'page.skills':            false,
  'builder.skills':         false,
  'builder.personas':       false,
  'builder.import':         false,
  'builder.versionHistory': false,
  'agents.subscribe':       false,
  'agents.fork':            false,
  'agents.duplicate':       false,
  'agents.visibility':      false,
  'agents.analytics':       false,
  'agents.exportFormat':    false,
  'agents.bulkDelete':      false,
  'agents.bulkExport':      false,
  'agents.favorites':       false,
  'marketplace.fork':       false,
  'marketplace.ratings':    false,
  'skills.create':          false,
  'skills.edit':            false,
  'skills.delete':          false,
  'github.connect':         false,
  'webhooks.create':        false,
  'webhooks.testDelivery':  false,
};

const LOCAL_MODE_KEY = 'agentforge_uiMode';
const VALID_MODES = ['pro', 'easy'];

function readLocalMode() {
  const stored = localStorage.getItem(LOCAL_MODE_KEY);
  return VALID_MODES.includes(stored) ? stored : null;
}

const FeatureFlagsContext = createContext({
  flags: {},
  defaults: {},
  uiMode: 'pro',
  serverUiMode: 'pro',
  localModeOverride: null,
  setLocalMode: () => {},
  reload: () => {},
  setFlagsAndMode: () => {},
});

export function useFeatureFlag(key) {
  const { flags } = useContext(FeatureFlagsContext);
  return key in flags ? flags[key] : true;
}

export function useUiMode() {
  return useContext(FeatureFlagsContext).uiMode;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

export function FeatureFlagsProvider({ children }) {
  const [rawFlags, setRawFlags]         = useState({});
  const [defaults, setDefaults]         = useState({});
  const [serverUiMode, setServerUiMode] = useState('pro');
  // Per-user local override — persisted to localStorage, starts from stored value
  const [localModeOverride, setLocalModeOverride] = useState(readLocalMode);

  async function load() {
    try {
      const data = await api.getFeatureFlags();
      setRawFlags(data.flags ?? {});
      setDefaults(data.defaults ?? {});
      setServerUiMode(data.uiMode ?? 'pro');
    } catch {
      // On failure keep all flags true (safe default)
    }
  }

  useEffect(() => { load(); }, []);

  // Effective mode: local preference wins over global server setting
  const uiMode = localModeOverride ?? serverUiMode;

  function setLocalMode(mode) {
    if (!VALID_MODES.includes(mode)) return;
    setLocalModeOverride(mode);
    localStorage.setItem(LOCAL_MODE_KEY, mode);
  }

  const flags = useMemo(() => {
    if (uiMode === 'easy') return { ...rawFlags, ...EASY_MODE_OVERRIDES };
    return rawFlags;
  }, [rawFlags, uiMode]);

  function setFlagsAndMode(newFlags, newMode) {
    setRawFlags(newFlags);
    if (newMode !== undefined) setServerUiMode(newMode);
  }

  return (
    <FeatureFlagsContext.Provider value={{
      flags, defaults, uiMode, serverUiMode,
      localModeOverride, setLocalMode,
      reload: load, setFlagsAndMode,
    }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}
