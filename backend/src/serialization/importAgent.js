import { TOOL_CATALOG, TOOL_IDS } from '../tools/toolDefinitions.js';
import { AGENT_SCHEMA_VERSION } from './agentSchema.js';

// Reverse map: lowercase label → tool ID (built from backend catalog, not frontend TOOL_META)
const LABEL_TO_TOOL_ID = Object.fromEntries(
  Object.entries(TOOL_CATALOG).map(([id, def]) => [def.label.toLowerCase(), id])
);

function emptyAgent() {
  return {
    schemaVersion: AGENT_SCHEMA_VERSION,
    name: '',
    persona: '',
    systemPrompt: '',
    model: '',
    tools: [],
    skills: [],
    instructions: [],
    positions: {},
  };
}

/**
 * Parse a JSON-encoded agent export.
 * @param {string} text
 * @returns {{ agent: object, warnings: string[] } | { error: string, line?: number }}
 */
export function parseJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'Expected a JSON object at the top level' };
  }

  const warnings = [];
  const agent = emptyAgent();

  if (typeof parsed.name === 'string') {
    agent.name = parsed.name;
  } else if (parsed.name !== undefined) {
    warnings.push('Field "name" is not a string; skipped');
  }

  if (typeof parsed.persona === 'string') {
    agent.persona = parsed.persona;
  } else if (parsed.persona !== undefined) {
    warnings.push('Field "persona" is not a string; skipped');
  }

  if (typeof parsed.systemPrompt === 'string') {
    agent.systemPrompt = parsed.systemPrompt;
  } else if (parsed.systemPrompt !== undefined) {
    warnings.push('Field "systemPrompt" is not a string; skipped');
  }

  if (typeof parsed.model === 'string') {
    agent.model = parsed.model;
  } else if (parsed.model !== undefined) {
    warnings.push('Field "model" is not a string; skipped');
  }

  if (Array.isArray(parsed.tools)) {
    for (const t of parsed.tools) {
      if (typeof t === 'string' && TOOL_IDS.includes(t)) {
        agent.tools.push(t);
      } else {
        warnings.push(`Unknown or invalid tool "${t}"; skipped`);
      }
    }
  } else if (parsed.tools !== undefined) {
    warnings.push('Field "tools" is not an array; skipped');
  }

  if (Array.isArray(parsed.skills)) {
    agent.skills = parsed.skills;
  } else if (parsed.skills !== undefined) {
    warnings.push('Field "skills" is not an array; skipped');
  }

  if (Array.isArray(parsed.instructions)) {
    agent.instructions = parsed.instructions;
  } else if (parsed.instructions !== undefined) {
    warnings.push('Field "instructions" is not an array; skipped');
  }

  if (parsed.positions !== undefined) {
    if (typeof parsed.positions === 'object' && parsed.positions !== null && !Array.isArray(parsed.positions)) {
      agent.positions = parsed.positions;
    } else {
      warnings.push('Field "positions" is not an object; skipped');
    }
  }

  return { agent, warnings };
}

/**
 * Parse a Markdown agent export produced by AgentForge's generateMarkdown().
 * Skills and instructions IDs cannot be recovered from Markdown and will be
 * returned as empty arrays with warnings if those sections are present.
 * @param {string} text
 * @returns {{ agent: object, warnings: string[] } | { error: string }}
 */
export function parseMarkdown(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { error: 'Input is empty or not a string' };
  }

  const lines = text.split('\n');
  const warnings = [];
  const agent = emptyAgent();

  // Extract name from first H1
  const h1Line = lines.find((l) => l.startsWith('# '));
  if (h1Line) {
    agent.name = h1Line.slice(2).trim();
  } else {
    warnings.push('No H1 heading found; name left empty');
  }

  // Extract persona: first blockquote line between H1 and the first ## heading
  let pastH1 = false;
  for (const line of lines) {
    if (line.startsWith('# ')) { pastH1 = true; continue; }
    if (!pastH1) continue;
    if (line.startsWith('## ')) break;
    if (line.startsWith('> ')) {
      agent.persona = line.slice(2).trim();
      break;
    }
  }

  // Split into L2 sections: each `## Heading` starts a new bucket
  const sections = {};
  let currentSection = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      sections[currentSection] = [];
    } else if (currentSection !== null) {
      sections[currentSection].push(line);
    }
  }

  // System Prompt
  if ('System Prompt' in sections) {
    const raw = sections['System Prompt'].join('\n').trim();
    if (raw && raw !== '_No system prompt defined._') {
      agent.systemPrompt = raw;
    }
  } else {
    warnings.push('Section "System Prompt" not found; systemPrompt left empty');
  }

  // Capabilities → tools (label lookup)
  if ('Capabilities' in sections) {
    const capContent = sections['Capabilities'].join('\n');
    if (!capContent.includes('_No tools added._')) {
      for (const line of sections['Capabilities']) {
        if (!line.startsWith('- **')) continue;
        const match = line.match(/^- \*\*([^*]+)\*\*/);
        if (match) {
          const label = match[1].trim();
          const toolId = LABEL_TO_TOOL_ID[label.toLowerCase()];
          if (toolId) {
            agent.tools.push(toolId);
          } else {
            warnings.push(`Unknown tool label "${label}"; skipped`);
          }
        }
      }
    }
  } else {
    warnings.push('Section "Capabilities" not found; tools left empty');
  }

  // Skills and instructions carry rendered content only — IDs cannot be recovered
  if ('Active Skills' in sections) {
    warnings.push('Skills cannot be recovered from Markdown (IDs not stored); skills left empty');
  }

  if ('Agent Instructions' in sections) {
    warnings.push('Instructions cannot be recovered from Markdown (IDs not stored); instructions left empty');
  }

  return { agent, warnings };
}
