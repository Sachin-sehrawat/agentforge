const { TOOL_META } = require('./toolMeta');
const api = require('./api');

// Port of generateMarkdown() from frontend/src/App.jsx — keep the two in sync.
function generateMarkdown(agent, allSkills, personaLookup) {
  const tools = agent.tools || [];
  const toolLines = tools.length
    ? tools.map((id) => {
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

// Fetches the skill/persona catalogs an agent's export may reference, mirroring
// how the web app builds `allSkills` and `personaLookup` in App.jsx.
async function fetchExportContext(token) {
  const [builtinSkills, publicSkills, mySkills, personaCategories] = await Promise.all([
    api.listBuiltinSkills().catch(() => []),
    api.listPublicSkills(token).catch(() => []),
    api.listMySkills(token).catch(() => []),
    api.listPersonaCategories().catch(() => []),
  ]);

  const myIds = new Set(mySkills.map((s) => s.id));
  const allSkills = [
    ...builtinSkills,
    ...publicSkills.filter((s) => !myIds.has(s.id)),
    ...mySkills,
  ];

  const personaLookup = Object.fromEntries(
    personaCategories.flatMap((c) => c.personas.map((p) => [p.id, p]))
  );

  return { allSkills, personaLookup };
}

module.exports = { generateMarkdown, fetchExportContext };
