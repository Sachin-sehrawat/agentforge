import React, { useEffect, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Canvas from './components/Canvas.jsx';
import { api } from './api.js';
import { TOOL_META } from './toolMeta.jsx';

const DEFAULT_AGENT = {
  id: null,
  name: 'My Agent',
  persona: '',
  systemPrompt: '',
  tools: [],
  positions: {},
};

function defaultToolPosition(index) {
  return { x: 460, y: 30 + index * 150 };
}

function generateMarkdown(agent) {
  const toolLines = agent.tools.length
    ? agent.tools.map((id) => {
        const meta = TOOL_META[id];
        return `- **${meta ? meta.label : id}** — ${meta ? meta.blurb : ''}`;
      }).join('\n')
    : '_No tools added._';

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `# ${agent.name || 'Untitled Agent'}

${agent.persona ? `> ${agent.persona}\n` : ''}
## System Prompt

${agent.systemPrompt || '_No system prompt defined._'}

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

  useEffect(() => {
    refreshSavedAgents();
  }, []);

  function refreshSavedAgents() {
    api.listAgents().then(setSavedAgents).catch(() => {});
  }

  const onChangeAgentField = (field, value) => {
    setAgent((prev) => ({ ...prev, [field]: value }));
  };

  const onMoveTool = (nodeId, updater) => {
    setAgent((prev) => {
      const current = prev.positions[nodeId] || (nodeId === 'agent' ? { x: 36, y: 36 } : defaultToolPosition(prev.tools.indexOf(nodeId)));
      return { ...prev, positions: { ...prev.positions, [nodeId]: updater(current) } };
    });
  };

  const onAddTool = (toolId, pos) => {
    setAgent((prev) => {
      if (prev.tools.includes(toolId)) {
        if (!pos) return prev;
        return { ...prev, positions: { ...prev.positions, [toolId]: pos } };
      }
      const position = pos || defaultToolPosition(prev.tools.length);
      return {
        ...prev,
        tools: [...prev.tools, toolId],
        positions: { ...prev.positions, [toolId]: position },
      };
    });
  };

  const onRemoveTool = (toolId) => {
    setAgent((prev) => {
      const positions = { ...prev.positions };
      delete positions[toolId];
      return { ...prev, tools: prev.tools.filter((t) => t !== toolId), positions };
    });
  };

  const onNew = () => {
    setAgent(DEFAULT_AGENT);
  };

  const downloadMd = (agentData) => {
    const md = generateMarkdown(agentData);
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
      };
      const result = agent.id ? await api.updateAgent(agent.id, payload) : await api.createAgent(payload);
      setAgent((prev) => ({ ...prev, id: result.id }));
      refreshSavedAgents();
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
      setAgent(result);
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
      />
      <div className="workbench">
        <Sidebar addedTools={agent.tools} onAddTool={onAddTool} />
        <Canvas
          agent={agent}
          onChangeAgentField={onChangeAgentField}
          onMoveTool={onMoveTool}
          onAddTool={onAddTool}
          onRemoveTool={onRemoveTool}
        />
      </div>
    </div>
  );
}
