import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Canvas from './components/Canvas.jsx';
import PersonaPanel from './components/PersonaPanel.jsx';
import SkillsBar from './components/SkillsBar.jsx';
import AgentsPage from './components/AgentsPage.jsx';
import AgentAnalytics from './components/AgentAnalytics.jsx';
import SkillsPage from './components/SkillsPage.jsx';
import AdminPage from './components/AdminPage.jsx';
import MarketplacePage from './components/MarketplacePage.jsx';
import AuthModal from './components/AuthModal.jsx';
import ImportModal from './components/ImportModal.jsx';
import TemplateGallery from './components/TemplateGallery.jsx';
import VersionHistoryPanel from './components/VersionHistoryPanel.jsx';
import ValidationPanel from './components/ValidationPanel.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { api } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { TOOL_META } from './toolMeta.jsx';
import { validateAgentDefinition } from './serialization/agentValidation.js';

const DEFAULT_AGENT = {
  id: null,
  name: 'My Agent',
  persona: '',
  systemPrompt: '',
  tools: [],
  positions: {},
  skills: [],
  instructions: [],
};

// Single workspace per installation; no multi-user auth yet.
const WORKSPACE_ID = 'default';
const USER_ID = 'default';

// Auto-save workspace state this many ms after the last canvas change.
const AUTOSAVE_DEBOUNCE_MS = 1500;

function defaultToolPosition(index) {
  return { x: 460, y: 30 + index * 150 };
}

function generateMarkdown(agent, allSkills, personaLookup) {
  const toolLines = agent.tools.length
    ? agent.tools.map((id) => {
        const meta = TOOL_META[id];
        return `- **${meta ? meta.label : id}** — ${meta ? meta.blurb : ''}`;
      }).join('\n')
    : '_No tools added._';

  const activeSkills = (agent.skills || [])
    .map((id) => allSkills.find((s) => s.id === id))
    .filter(Boolean);

  const skillLines = activeSkills.length
    ? activeSkills.map((s) => `- **${s.label}** — ${s.description}\n  > ${s.instruction}`).join('\n')
    : '';

  const activeInstructions = (agent.instructions || [])
    .map((id) => (personaLookup || {})[id])
    .filter(Boolean);

  const instructionLines = activeInstructions.length
    ? activeInstructions.map((p) => `### ${p.name}\n\n${p.systemPrompt}`).join('\n\n---\n\n')
    : '';

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `# ${agent.name || 'Untitled Agent'}

${agent.persona ? `> ${agent.persona}\n` : ''}## System Prompt

${agent.systemPrompt || '_No system prompt defined._'}
${skillLines ? `\n## Active Skills\n\n${skillLines}\n` : ''}${instructionLines ? `\n## Agent Instructions\n\n${instructionLines}\n` : ''}
## Capabilities

${toolLines}

---
_Created with AgentForge · ${date}_
`;
}

export default function App() {
  const { user, isAuthenticated, logout } = useAuth();
  const [agent, setAgent] = useState(DEFAULT_AGENT);
  const [publicAgents, setPublicAgents] = useState([]);
  const [myAgents, setMyAgents] = useState([]);
  const [favoriteAgents, setFavoriteAgents] = useState([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [loadingMine, setLoadingMine] = useState(false);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [errorPublic, setErrorPublic] = useState(null);
  const [errorMine, setErrorMine] = useState(null);
  const [errorFavorites, setErrorFavorites] = useState(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('builder');
  const [builtinSkills, setBuiltinSkills] = useState([]);
  const [personaCategories, setPersonaCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [customSkills, setCustomSkills] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [canvasView, setCanvasView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [authModal, setAuthModal] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [emptyStateDismissed, setEmptyStateDismissed] = useState(false);

  const [analyticsAgent, setAnalyticsAgent] = useState(null);

  const [validationState, setValidationState] = useState(null);
  const [toasts, setToasts] = useState([]);

  const isRestoredRef = useRef(false);
  const autosaveTimerRef = useRef(null);
  const canvasViewSaveTimerRef = useRef(null);

  const allSkills = useMemo(
    () => [
      ...builtinSkills.map((s) => ({ ...s, builtin: true })),
      ...customSkills.map((s) => ({ ...s, builtin: false })),
    ],
    [builtinSkills, customSkills]
  );

  const personaLookup = useMemo(
    () => Object.fromEntries(
      personaCategories.flatMap((c) => c.personas.map((p) => [p.id, p]))
    ),
    [personaCategories]
  );

  // On mount: load public agents, custom skills, user preferences, and the last workspace state.
  useEffect(() => {
    api.listBuiltinSkills().then(setBuiltinSkills).catch(() => {});
    api.listPersonaCategories().then(setPersonaCategories).catch(() => {});
    api.listTemplates().then(setTemplates).catch(() => {});
    refreshPublicAgents();
    refreshCustomSkills(false); // initial fetch is unauthenticated; auth effect re-fetches with ownership

    Promise.all([
      api.getUserPreferences(USER_ID),
      api.getWorkspaceData(WORKSPACE_ID),
    ]).then(([prefs, wsData]) => {
      if (prefs.view && ['builder', 'agents', 'skills', 'admin', 'marketplace'].includes(prefs.view)) {
        setView(prefs.view);
      }
      if (typeof prefs.canvas_zoom === 'number' || prefs.canvas_pan) {
        setCanvasView({
          zoom: typeof prefs.canvas_zoom === 'number' ? prefs.canvas_zoom : 1,
          pan: prefs.canvas_pan && typeof prefs.canvas_pan.x === 'number'
            ? prefs.canvas_pan
            : { x: 0, y: 0 },
        });
      }
      if (wsData.agent && typeof wsData.agent === 'object') {
        const restored = { ...DEFAULT_AGENT, ...wsData.agent };
        setAgent(restored);
        isRestoredRef.current = true;
        if (restored.persona || restored.systemPrompt || restored.tools?.length > 0) {
          setEmptyStateDismissed(true);
        }
      }
    }).finally(() => {
      setLoadingWorkspace(false);
    });
  }, []);

  const scheduleWorkspaceAutosave = useCallback((agentState) => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      api.saveWorkspaceData(WORKSPACE_ID, { agent: agentState });
      api.saveDraftAgent(WORKSPACE_ID, agentState);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  // Debounced save of canvas zoom/pan to user preferences.
  const handleCanvasViewChange = useCallback((updater) => {
    setCanvasView((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (canvasViewSaveTimerRef.current) clearTimeout(canvasViewSaveTimerRef.current);
      canvasViewSaveTimerRef.current = setTimeout(() => {
        api.saveUserPreferences(USER_ID, {
          canvas_zoom: next.zoom,
          canvas_pan: next.pan,
        }).catch(() => {});
      }, 500);
      return next;
    });
  }, []);

  const handleSetView = useCallback((nextView) => {
    setView(nextView);
    setAnalyticsAgent(null);
    api.saveUserPreferences(USER_ID, { view: nextView });
  }, []);

  // Load or clear the user's own agents/skills whenever authentication state changes.
  // Also re-fetch public agents so isSubscribed/isFavorited flags reflect the current user.
  useEffect(() => {
    if (isAuthenticated) {
      refreshMyAgents();
      refreshPublicAgents();
      refreshFavorites();
      refreshCustomSkills(true);
    } else {
      setMyAgents([]);
      setFavoriteAgents([]);
      setErrorMine(null);
      setErrorFavorites(null);
      refreshPublicAgents();
      refreshCustomSkills(false);
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshPublicAgents() {
    setLoadingPublic(true);
    setErrorPublic(null);
    api.listPublicAgents()
      .then(setPublicAgents)
      .catch((err) => setErrorPublic(err.message))
      .finally(() => setLoadingPublic(false));
  }

  function refreshMyAgents() {
    setLoadingMine(true);
    setErrorMine(null);
    api.listMyAgents()
      .then(setMyAgents)
      .catch((err) => setErrorMine(err.message))
      .finally(() => setLoadingMine(false));
  }

  function refreshFavorites() {
    setLoadingFavorites(true);
    setErrorFavorites(null);
    api.listFavorites()
      .then(setFavoriteAgents)
      .catch((err) => setErrorFavorites(err.message))
      .finally(() => setLoadingFavorites(false));
  }

  function refreshSavedAgents() {
    refreshPublicAgents();
    if (isAuthenticated) refreshMyAgents();
  }

  function refreshCustomSkills(authenticated) {
    const authed = authenticated !== undefined ? authenticated : isAuthenticated;
    if (authed) {
      Promise.all([api.listPublicSkills(), api.listMySkills()])
        .then(([publicSkills, mySkills]) => {
          const myIds = new Set(mySkills.map((s) => s.id));
          setCustomSkills([
            ...publicSkills.filter((s) => !myIds.has(s.id)),
            ...mySkills,
          ]);
        })
        .catch(() => {});
    } else {
      api.listPublicSkills().then(setCustomSkills).catch(() => {});
    }
  }

  const onChangeAgentField = (field, value) => {
    setAgent((prev) => {
      const next = { ...prev, [field]: value };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onMoveTool = (nodeId, updater) => {
    setAgent((prev) => {
      const current = prev.positions[nodeId] || (nodeId === 'agent' ? { x: 36, y: 36 } : defaultToolPosition(prev.tools.indexOf(nodeId)));
      const next = { ...prev, positions: { ...prev.positions, [nodeId]: updater(current) } };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onAddTool = (toolId, pos) => {
    setAgent((prev) => {
      if (prev.tools.includes(toolId)) {
        if (!pos) return prev;
        const next = { ...prev, positions: { ...prev.positions, [toolId]: pos } };
        scheduleWorkspaceAutosave(next);
        return next;
      }
      const position = pos || defaultToolPosition(prev.tools.length);
      const next = {
        ...prev,
        tools: [...prev.tools, toolId],
        positions: { ...prev.positions, [toolId]: position },
      };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onRemoveTool = (toolId) => {
    setAgent((prev) => {
      const positions = { ...prev.positions };
      delete positions[toolId];
      const next = { ...prev, tools: prev.tools.filter((t) => t !== toolId), positions };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onToggleSkill = (skillId) => {
    setAgent((prev) => {
      const skills = prev.skills.includes(skillId)
        ? prev.skills.filter((s) => s !== skillId)
        : [...prev.skills, skillId];
      const next = { ...prev, skills };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onToggleInstruction = (persona) => {
    setAgent((prev) => {
      const instructions = prev.instructions.includes(persona.id)
        ? prev.instructions.filter((id) => id !== persona.id)
        : [...prev.instructions, persona.id];
      const next = { ...prev, instructions };
      scheduleWorkspaceAutosave(next);
      return next;
    });
  };

  const onNew = () => {
    setAgent(DEFAULT_AGENT);
    setView('builder');
    setEmptyStateDismissed(false);
    api.saveWorkspaceData(WORKSPACE_ID, { agent: DEFAULT_AGENT });
  };

  const downloadMd = (agentData) => {
    const md = generateMarkdown(agentData, allSkills, personaLookup);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(agentData.name || 'agent').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const performSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: agent.name || 'Untitled agent',
        persona: agent.persona,
        systemPrompt: agent.systemPrompt,
        tools: agent.tools,
        positions: agent.positions,
        skills: agent.skills,
        instructions: agent.instructions,
      };
      const result = agent.id ? await api.updateAgent(agent.id, payload) : await api.createAgent(payload);
      setAgent((prev) => ({ ...prev, id: result.id }));
      refreshSavedAgents();
      // Clear workspace draft after a successful save
      api.saveWorkspaceData(WORKSPACE_ID, { agent: { ...payload, id: result.id } });
    } catch (err) {
      console.error('Could not save:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const buildValidationOpts = useCallback(() => ({
    existingNames: myAgents.filter((a) => a.id !== agent.id).map((a) => a.name),
    resolvableSkillIds: allSkills.map((s) => s.id),
    availablePersonaIds: personaCategories.flatMap((c) => c.personas.map((p) => p.id)),
  }), [myAgents, agent.id, allSkills, personaCategories]);

  const onSave = () => {
    if (!isAuthenticated) {
      // Flush any pending debounced autosave immediately so the draft is
      // captured on the server before the auth modal opens.
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      api.saveWorkspaceData(WORKSPACE_ID, { agent });
      api.saveDraftAgent(WORKSPACE_ID, agent);
      setAuthModal({ tab: 'login', onSuccess: performSave });
      return;
    }

    const { errors, warnings } = validateAgentDefinition(agent, buildValidationOpts());
    if (errors.length > 0 || warnings.length > 0) {
      setValidationState({ errors, warnings, action: 'save', onConfirm: performSave });
      return;
    }
    performSave();
  };

  const onLoad = async (id) => {
    try {
      const result = await api.getAgent(id);
      const loaded = { ...DEFAULT_AGENT, ...result };
      setAgent(loaded);
      setView('builder');
      api.saveWorkspaceData(WORKSPACE_ID, { agent: loaded });
    } catch (err) {
      console.error('Could not load agent:', err.message);
    }
  };

  const onDelete = async (id) => {
    try {
      await api.deleteAgent(id);
      if (agent.id === id) onNew();
      refreshSavedAgents();
    } catch {
      // ignore
    }
  };

  function showToast(msg, type = 'info') {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  const onFork = async (id) => {
    const result = await api.forkAgent(id);
    api.bustMarketplaceCache();
    const loaded = { ...DEFAULT_AGENT, ...result };
    setAgent(loaded);
    setView('builder');
    setEmptyStateDismissed(true);
    api.saveWorkspaceData(WORKSPACE_ID, { agent: loaded });
    if (result.skillWarnings?.length > 0) {
      result.skillWarnings.forEach((w) =>
        showToast(`Skill not accessible and was removed: ${w}`, 'warning')
      );
    }
    if (isAuthenticated) refreshMyAgents();
    return result;
  };

  const onDuplicate = async (sourceAgent) => {
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic = {
      ...sourceAgent,
      id: optimisticId,
      name: sourceAgent.name + ' (copy)',
      isOwned: true,
      isSubscribed: false,
      updatedAt: new Date().toISOString(),
    };
    setMyAgents((prev) => [optimistic, ...prev]);
    try {
      const created = await api.duplicateAgent(sourceAgent.id);
      setMyAgents((prev) =>
        prev.map((a) => (a.id === optimisticId ? { ...created, isOwned: true } : a))
      );
      const agentId = created.id;
      showToast(
        <span>
          Created &ldquo;{created.name}&rdquo;.{' '}
          <button
            className="toast-link"
            onClick={() => { onLoad(agentId); handleSetView('builder'); }}
          >
            Open in builder
          </button>
        </span>,
        'success'
      );
    } catch (err) {
      setMyAgents((prev) => prev.filter((a) => a.id !== optimisticId));
      showToast(`Failed to duplicate agent: ${err.message}`, 'error');
      throw err;
    }
  };

  const onToggleVisibility = async (agent) => {
    const newVisibility = agent.visibility === 'public' ? 'private' : 'public';
    try {
      const updated = await api.updateAgentVisibility(agent.id, newVisibility);
      setMyAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, visibility: updated.visibility } : a))
      );
      if (newVisibility === 'public') {
        setPublicAgents((prev) =>
          prev.some((a) => a.id === agent.id)
            ? prev.map((a) => (a.id === agent.id ? { ...a, visibility: 'public' } : a))
            : [updated, ...prev]
        );
      } else {
        // Went private — remove from public list; also drop any non-owner subscriptions
        setPublicAgents((prev) => prev.filter((a) => a.id !== agent.id));
        setMyAgents((prev) => prev.filter((a) => !(a.id === agent.id && !a.isOwned)));
      }
    } catch (err) {
      console.error('Could not update visibility:', err.message);
      throw err;
    }
  };

  const onSubscribe = async (agent) => {
    const agentId = agent.id;
    const subscribing = !agent.isSubscribed;
    if (subscribing) {
      await api.subscribeAgent(agentId);
      setPublicAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, isSubscribed: true } : a))
      );
      setMyAgents((prev) =>
        prev.some((a) => a.id === agentId)
          ? prev
          : [{ ...agent, isSubscribed: true }, ...prev]
      );
    } else {
      await api.unsubscribeAgent(agentId);
      setPublicAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, isSubscribed: false } : a))
      );
      setMyAgents((prev) => prev.filter((a) => !(a.id === agentId && !a.isOwned)));
    }
  };

  const onBulkDelete = async (ids) => {
    try {
      const result = await api.bulkDeleteAgents(ids);
      setMyAgents((prev) => prev.filter((a) => !result.deleted.includes(a.id)));
      if (result.deleted.includes(agent.id)) onNew();
      if (result.skipped.length > 0) {
        showToast(
          `Deleted ${result.deleted.length} agent${result.deleted.length !== 1 ? 's' : ''}. ${result.skipped.length} skipped (not owned).`,
          'warning'
        );
      } else {
        showToast(`Deleted ${result.deleted.length} agent${result.deleted.length !== 1 ? 's' : ''}.`, 'success');
      }
      return result;
    } catch (err) {
      showToast(`Bulk delete failed: ${err.message}`, 'error');
      throw err;
    }
  };

  const onBulkExport = async (ids, format) => {
    try {
      const result = await api.bulkExportAgents(ids, format);
      let content, mimeType, ext;
      if (format === 'json') {
        const parsed = result.results.map((r) => JSON.parse(r.content));
        content = JSON.stringify(parsed, null, 2);
        mimeType = 'application/json';
        ext = 'json';
      } else {
        content = result.results.map((r) => r.content).join('\n\n---\n\n');
        mimeType = 'text/markdown';
        ext = 'md';
      }
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agents-export.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
      throw err;
    }
  };

  const onUnfavorite = async (id) => {
    setFavoriteAgents((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.unfavoriteAgent(id);
      api.bustMarketplaceCache();
    } catch (err) {
      refreshFavorites();
      throw err;
    }
  };

  const onDownload = (agentData) => {
    const target = agentData || agent;
    // Only validate the current canvas agent, not saved agents opened from the list
    if (!agentData || agentData === agent) {
      const { errors, warnings } = validateAgentDefinition(target, buildValidationOpts());
      if (errors.length > 0 || warnings.length > 0) {
        setValidationState({ errors, warnings, action: 'export', onConfirm: () => downloadMd(target) });
        return;
      }
    }
    downloadMd(target);
  };

  const handleValidationItemClick = useCallback((issue) => {
    const fieldToId = { name: 'agent-name', persona: 'agent-persona', systemPrompt: 'agent-prompt' };
    if (issue.field && fieldToId[issue.field]) {
      const el = document.getElementById(fieldToId[issue.field]);
      if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
  }, []);

  const onRestoreVersion = useCallback((restoredAgent) => {
    const loaded = { ...DEFAULT_AGENT, ...restoredAgent };
    setAgent(loaded);
    api.saveWorkspaceData(WORKSPACE_ID, { agent: loaded });
    refreshSavedAgents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onImportCommit = useCallback((parsedAgent) => {
    const positions = { ...(parsedAgent.positions ?? {}) };
    if (!positions.agent) positions.agent = { x: 36, y: 36 };
    parsedAgent.tools.forEach((toolId, index) => {
      if (!positions[toolId]) positions[toolId] = defaultToolPosition(index);
    });
    const draft = { ...DEFAULT_AGENT, ...parsedAgent, positions, id: null };
    setAgent(draft);
    setView('builder');
    setImportOpen(false);
    api.saveWorkspaceData(WORKSPACE_ID, { agent: draft });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onFromTemplate = useCallback(async (template) => {
    setTemplateGalleryOpen(false);
    if (template.id === 'blank') {
      onNew();
      return;
    }
    let def = template.definition;
    if (!def) {
      try {
        const full = await api.getTemplate(template.id);
        def = full.definition;
      } catch (err) {
        console.error('Could not load template:', err.message);
        return;
      }
    }
    onImportCommit(def);
    const { errors, warnings } = validateAgentDefinition(
      { ...DEFAULT_AGENT, ...def },
      buildValidationOpts()
    );
    if (errors.length > 0 || warnings.length > 0) {
      setValidationState({ errors, warnings, action: 'template', onConfirm: null });
    }
  }, [onImportCommit, onNew, buildValidationOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreateSkill = async (data) => {
    try {
      const created = await api.createSkill(data);
      setCustomSkills((prev) => [...prev, created]);
    } catch (err) {
      console.error('Could not create skill:', err.message);
      throw err;
    }
  };

  const onUpdateSkill = async (id, data) => {
    try {
      const updated = await api.updateSkill(id, data);
      setCustomSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      console.error('Could not update skill:', err.message);
      throw err;
    }
  };

  const onDeleteSkill = async (id) => {
    try {
      await api.deleteSkill(id);
      setCustomSkills((prev) => prev.filter((s) => s.id !== id));
      setAgent((prev) => ({
        ...prev,
        skills: prev.skills.filter((sid) => sid !== id),
      }));
    } catch (err) {
      console.error('Could not delete skill:', err.message);
    }
  };

  return (
    <div className="app">
      <Topbar
        agent={agent}
        onChangeName={(name) => onChangeAgentField('name', name)}
        onNew={onNew}
        onSave={onSave}
        saving={saving}
        savedAgents={myAgents}
        onLoad={onLoad}
        onDelete={onDelete}
        onDownload={onDownload}
        onOpenImport={() => setImportOpen(true)}
        onOpenTemplates={() => setTemplateGalleryOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        view={view}
        onSetView={handleSetView}
        customSkillsCount={customSkills.length}
        user={user}
        onOpenAuth={(tab) => setAuthModal({ tab, onSuccess: null })}
        onLogout={logout}
        isAuthenticated={isAuthenticated}
      />

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onCommit={onImportCommit}
        />
      )}

      {templateGalleryOpen && (
        <TemplateGallery
          allSkills={allSkills}
          onSelect={onFromTemplate}
          onClose={() => setTemplateGalleryOpen(false)}
        />
      )}

      {historyOpen && agent.id && isAuthenticated && (
        <VersionHistoryPanel
          agentId={agent.id}
          currentAgent={agent}
          allSkills={allSkills}
          onClose={() => setHistoryOpen(false)}
          onRestore={onRestoreVersion}
        />
      )}

      {authModal && (
        <AuthModal
          initialTab={authModal.tab}
          onClose={() => setAuthModal(null)}
          onSuccess={() => {
            const action = authModal.onSuccess;
            setAuthModal(null);
            action?.();
          }}
        />
      )}

      {validationState && (
        <ValidationPanel
          errors={validationState.errors}
          warnings={validationState.warnings}
          action={validationState.action}
          onClose={() => setValidationState(null)}
          onOverride={() => {
            const confirm = validationState.onConfirm;
            setValidationState(null);
            confirm?.();
          }}
          onItemClick={handleValidationItemClick}
        />
      )}

      {view === 'agents' && analyticsAgent ? (
        <AgentAnalytics
          agentId={analyticsAgent.id}
          agentName={analyticsAgent.name}
          onBack={() => setAnalyticsAgent(null)}
        />
      ) : view === 'agents' ? (
        <AgentsPage
          publicAgents={publicAgents}
          myAgents={myAgents}
          favoriteAgents={favoriteAgents}
          loadingPublic={loadingPublic}
          loadingMine={loadingMine}
          loadingFavorites={loadingFavorites}
          errorPublic={errorPublic}
          errorMine={errorMine}
          errorFavorites={errorFavorites}
          isAuthenticated={isAuthenticated}
          onOpen={onLoad}
          onDownload={onDownload}
          onDelete={onDelete}
          onNew={onNew}
          onOpenAuth={(tab) => setAuthModal({ tab, onSuccess: null })}
          onSubscribe={onSubscribe}
          onToggleVisibility={onToggleVisibility}
          onFork={onFork}
          onUnfavorite={onUnfavorite}
          onDuplicate={onDuplicate}
          onBulkDelete={onBulkDelete}
          onBulkExport={onBulkExport}
          onAnalytics={(agent) => setAnalyticsAgent({ id: agent.id, name: agent.name })}
        />
      ) : view === 'skills' ? (
        <SkillsPage
          allSkills={allSkills}
          onCreateSkill={onCreateSkill}
          onUpdateSkill={onUpdateSkill}
          onDeleteSkill={onDeleteSkill}
          isAuthenticated={isAuthenticated}
          onOpenAuth={(tab) => setAuthModal({ tab, onSuccess: null })}
        />
      ) : view === 'marketplace' ? (
        <MarketplacePage
          isAuthenticated={isAuthenticated}
          onView={onLoad}
          onFork={onFork}
          onOpenAuth={(tab) => setAuthModal({ tab, onSuccess: null })}
        />
      ) : view === 'admin' ? (
        <AdminPage
          builtinSkills={builtinSkills}
          personaCategories={personaCategories}
          templates={templates}
          onBuiltinSkillsChange={setBuiltinSkills}
          onPersonaCategoriesChange={setPersonaCategories}
          onTemplatesChange={setTemplates}
          isAuthenticated={isAuthenticated}
          onOpenAuth={(tab) => setAuthModal({ tab, onSuccess: null })}
        />
      ) : (
        <>
          <SkillsBar skills={allSkills} activeSkills={agent.skills} onToggleSkill={onToggleSkill} />
          {loadingWorkspace ? (
            <div className="workspace-loading">Loading workspace…</div>
          ) : (
            <ErrorBoundary message="The canvas encountered an error. Your work is safe — click Try again to reload.">
              <div className="workbench">
                <Sidebar addedTools={agent.tools} onAddTool={onAddTool} />
                {!emptyStateDismissed && !agent.id && !agent.persona && !agent.systemPrompt && agent.tools.length === 0 && (
                  <div className="canvas-empty-state">
                    <div className="ces-card">
                      <div className="ces-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </div>
                      <h2 className="ces-title">Start building your agent</h2>
                      <p className="ces-desc">Choose a template to get started quickly, or build from scratch on the canvas.</p>
                      <button className="btn primary ces-btn" onClick={() => setTemplateGalleryOpen(true)}>
                        Browse templates
                      </button>
                      <button className="btn subtle ces-btn-secondary" onClick={() => setEmptyStateDismissed(true)}>
                        Start blank
                      </button>
                    </div>
                  </div>
                )}
                <Canvas
                  agent={agent}
                  onChangeAgentField={onChangeAgentField}
                  onMoveTool={onMoveTool}
                  onAddTool={onAddTool}
                  onRemoveTool={onRemoveTool}
                  onToggleSkill={onToggleSkill}
                  onToggleInstruction={onToggleInstruction}
                  allSkills={allSkills}
                  zoom={canvasView.zoom}
                  pan={canvasView.pan}
                  onZoomPanChange={handleCanvasViewChange}
                  validationState={validationState}
                  onViewSource={onLoad}
                />
                <PersonaPanel
                  activeInstructions={agent.instructions}
                  onToggleInstruction={onToggleInstruction}
                  categories={personaCategories}
                />
              </div>
            </ErrorBoundary>
          )}
        </>
      )}
      {toasts.length > 0 && (
        <div className="toast-container" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <span className="toast-msg">{t.msg}</span>
              <button
                className="toast-dismiss"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
