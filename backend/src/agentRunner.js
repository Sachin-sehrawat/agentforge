import Anthropic from '@anthropic-ai/sdk';
import { TOOL_CATALOG } from './tools/toolDefinitions.js';

const anthropic = new Anthropic();

const MAX_ITERATIONS = 6;
const MAX_TOKENS = 1024;

/**
 * Runs an agent against a conversation, looping through any client-side
 * tool calls until the model produces a final text response (or the
 * iteration limit is reached).
 *
 * @param {object} agent - { systemPrompt, persona, model, tools: string[] }
 * @param {Array}  conversation - prior messages, [{role, content}]
 * @returns {Promise<{ reply: string, trace: Array, messages: Array }>}
 */
export async function runAgent(agent, conversation) {
  const enabledTools = (agent.tools || []).filter((id) => TOOL_CATALOG[id]);
  const tools = enabledTools.map((id) => TOOL_CATALOG[id].anthropicTool);

  const systemPrompt = buildSystemPrompt(agent);

  let messages = [...conversation];
  const trace = [];
  let replyText = '';

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: agent.model || 'claude-sonnet-4-6',
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
      ...(tools.length ? { tools } : {}),
    });

    messages.push({ role: 'assistant', content: response.content });

    let hasClientToolUse = false;
    const toolResults = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        replyText += block.text;
      } else if (block.type === 'tool_use') {
        const toolDef = TOOL_CATALOG[block.name];
        if (!toolDef || toolDef.kind !== 'client') {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Unknown tool',
            is_error: true,
          });
          continue;
        }

        hasClientToolUse = true;
        const traceEntry = { tool: block.name, input: block.input };

        let output;
        try {
          output = await toolDef.execute(block.input || {});
        } catch (err) {
          output = { error: err.message };
        }

        traceEntry.output = output;
        trace.push(traceEntry);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      } else if (block.type === 'server_tool_use') {
        trace.push({ tool: block.name, input: block.input, server: true });
      } else if (block.type === 'web_search_tool_result') {
        const last = trace[trace.length - 1];
        if (last && last.server) {
          last.output = summarizeSearchResults(block.content);
        } else {
          trace.push({ tool: 'web_search', server: true, output: summarizeSearchResults(block.content) });
        }
      }
    }

    if (!hasClientToolUse) break;

    messages.push({ role: 'user', content: toolResults });
  }

  return { reply: replyText.trim(), trace, messages };
}

function buildSystemPrompt(agent) {
  const parts = [];
  if (agent.persona) parts.push(agent.persona.trim());
  if (agent.systemPrompt) parts.push(agent.systemPrompt.trim());
  if (!parts.length) {
    return 'You are a helpful AI agent. Use the tools available to you when they would help answer the user.';
  }
  return parts.join('\n\n');
}

function summarizeSearchResults(content) {
  if (!Array.isArray(content)) return content;
  return content
    .filter((item) => item.type === 'web_search_result')
    .map((item) => ({ title: item.title, url: item.url }));
}
