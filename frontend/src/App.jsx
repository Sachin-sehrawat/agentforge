import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Canvas from './components/Canvas.jsx';
import PersonaPanel from './components/PersonaPanel.jsx';
import SkillsBar from './components/SkillsBar.jsx';
import AgentsPage from './components/AgentsPage.jsx';
import SkillsPage from './components/SkillsPage.jsx';
import { api } from './api.js';
import { TOOL_META } from './toolMeta.jsx';
import { SKILLS } from './data/skills.js';
import { PERSONA_CATEGORIES } from './data/personas.js';

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

const PERSONA_LOOKUP = Object.fromEntries(
  PERSONA_CATEGORIES.flatMap((c) => c.personas.map((p) => [p.id, p]))
);

function defaultToolPosition(index) {
  return { x: 460, y: 30 + index * 150 };
}

function generateMarkdown(agent, allSkills) {
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
    .map((id) => PERSONA_LOOKUP[id])
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
  const [agent, setAgent] = useState(DEFAULT_AGENT);
  const [savedAgents, setSavedAgents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('builder');
  const [customSkills, setCustomSkills] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);

  // Tracks whether the current agent state was loaded from a saved record
  // (vs. a workspace-restored draft) to avoid overwriting user's unsaved work.
  const isRestoredRef = useRef(false);
  const autosaveTimerRef = useRef(null);

  const allSkills = useMemo(
    () => [
      ...SKILLS.map((s) => ({ ...s, builtin: true })),
      ...customSkills.map((s) => ({ ...s, builtin: false })),
    ],
    [customSkills]
  );

  // On mount: load saved agents, custom skills, user preferences, and the last workspace state.
  useEffect(() => {
    refreshSavedAgents();
    refreshCustomSkills();

    Promise.all([
      api.getUserPreferences(USER_ID),
      api.getWorkspaceData(WORKSPACE_ID),
    ]).then(([prefs, wsData]) => {
      // Restore last view from preferences
      if (prefs.view && ['builder', 'agents', 'skills'].includes(prefs.view)) {
        setView(prefs.view);
      }
      // Restore unsaved canvas state from workspace
      if (wsData.agent && typeof wsData.agent === 'object') {
        setAgent({ ...DEFAULT_AGENT, ...wsData.agent });
        isRestoredRef.current = true;
      }
    }).finally(() => {
      setLoadingWorkspace(false);
    });
  }, []);

  // Debounced auto-save of workspace state whenever the canvas changes.
  const scheduleWorkspaceAutosave = useCallback((agentState) => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      api.saveWorkspaceData(WORKSPACE_ID, { agent: agentState });
      api.saveDraftAgent(WORKSPACE_ID, agentState);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  // Persist view choice as a user preference.
  const handleSetView = useCallback((nextView) => {
    setView(nextView);
    api.saveUserPreferences(USER_ID, { view: nextView });
  }, []);

  function refreshSavedAgents() {
    api.listAgents().then(setSavedAgents).catch(() => {});
  }

  function refreshCustomSkills() {
    api.listSkills().then(setCustomSkills).catch(() => {});
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
    api.saveWorkspaceData(WORKSPACE_ID, { agent: DEFAULT_AGENT });
  };

  const downloadMd = (agentData) => {
    const md = generateMarkdown(agentData, allSkills);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(agentData.name || 'agent').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSave = async () => {
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
      downloadMd({ ...payload, name: payload.name });
    } catch (err) {
      console.error('Could not save:', err.message);
    } finally {
      setSaving(false);
    }
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

  const onDownload = (agentData) => {
    downloadMd(agentData || agent);
  };

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
        savedAgents={savedAgents}
        onLoad={onLoad}
        onDelete={onDelete}
        onDownload={onDownload}
        view={view}
        onSetView={handleSetView}
        customSkillsCount={customSkills.length}
      />

      {view === 'agents' ? (
        <AgentsPage
          savedAgents={savedAgents}
          onOpen={onLoad}
          onDownload={onDownload}
          onDelete={onDelete}
          onNew={onNew}
        />
      ) : view === 'skills' ? (
        <SkillsPage
          allSkills={allSkills}
          onCreateSkill={onCreateSkill}
          onUpdateSkill={onUpdateSkill}
          onDeleteSkill={onDeleteSkill}
        />
      ) : (
        <>
          <SkillsBar skills={allSkills} activeSkills={agent.skills} onToggleSkill={onToggleSkill} />
          {loadingWorkspace ? (
            <div className="workspace-loading">Loading workspace…</div>
          ) : (
            <div className="workbench">
              <Sidebar addedTools={agent.tools} onAddTool={onAddTool} />
              <Canvas
                agent={agent}
                onChangeAgentField={onChangeAgentField}
                onMoveTool={onMoveTool}
                onAddTool={onAddTool}
                onRemoveTool={onRemoveTool}
                onToggleSkill={onToggleSkill}
                onToggleInstruction={onToggleInstruction}
                allSkills={allSkills}
              />
              <PersonaPanel
                activeInstructions={agent.instructions}
                onToggleInstruction={onToggleInstruction}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
