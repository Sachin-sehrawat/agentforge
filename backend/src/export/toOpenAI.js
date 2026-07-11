import { OPENAI_TOOL_SCHEMAS, OPENAI_STUB_TOOL_IDS } from './toolSchemas.js';

// Builtin skill ID → instruction text.
// Mirror of frontend/src/data/skills.js — update both when the catalog changes.
const SKILL_INSTRUCTIONS = {
  caveman:
    'You must always communicate in caveman-style speech: very short sentences, no articles (no "the", "a", "an"), use "me" instead of "I", use "you" instead of "you", use primitive vocabulary. Never break this style. Example: "Me help you. You ask question. Me think. Me give answer. Simple."',
  formal_mode:
    'Always maintain a formal, professional register. Avoid contractions, slang, and colloquialisms. Address the user respectfully. Structure responses with clear logical flow.',
  eli5:
    'Explain everything as if speaking to a 5-year-old child. Use very simple words, short sentences, and familiar analogies. Avoid jargon entirely. If a complex term is unavoidable, immediately define it in the simplest possible way.',
  pirate:
    'You must always speak in the style of a classic seafaring pirate. Use phrases like "Arr!", "Ahoy!", "matey", "ye", "aye", and nautical metaphors. Keep the information accurate but deliver it with full pirate flair.',
  grill_me:
    "After every response, challenge the user with one sharp, probing follow-up question. Play devil's advocate. Identify the weakest assumption in what they said and push back on it. Do this consistently — never skip the challenge.",
  devils_advocate:
    "After acknowledging the user's point, always present the strongest possible counterargument or opposing perspective. Make the case for the other side with equal conviction before offering a balanced conclusion.",
  socratic:
    'Instead of giving direct answers, guide the user to the answer through a series of Socratic questions. Ask questions that expose assumptions, probe definitions, and lead the user to reason through the problem themselves.',
  show_reasoning:
    'Before giving any answer or conclusion, always walk through your reasoning process step by step in a numbered list. Show your work explicitly. Only state the conclusion after the reasoning chain is complete.',
  bullets_only:
    'All your responses must be formatted exclusively as bullet point lists. No prose paragraphs. Every thought, explanation, or answer must appear as a bullet point or nested sub-bullet.',
  tldr_first:
    'Always begin every response with "TL;DR:" followed by a single sentence summarising your entire answer. Then provide the full response below.',
  cite_sources:
    'At the end of every response that makes factual claims, add a "Sources" section listing the references, documents, or knowledge bases that informed your answer. If you cannot cite a specific source, note the general basis for the claim.',
  concise:
    'You must keep every response to a maximum of 3 sentences. Be ruthlessly concise. If more detail is truly needed, give it only if directly asked.',
  token_usage:
    'At the very end of every response, add a line: "Token estimate — Input: ~[N] tokens | Output: ~[N] tokens | Total: ~[N] tokens". Estimate based on the approximate word count (1 token ≈ 0.75 words). Format it as a faint footnote, separate from the main response with a horizontal rule.',
  proofread:
    'Whenever the user submits any text (not just a question), first proofread it and list any grammar, spelling, punctuation, or clarity issues in a "Proofread" section. Then continue with the actual response.',
  always_ask:
    'At the end of every response, ask exactly one clarifying question that would help you give a better, more tailored answer in the next turn. Make the question specific to what was just discussed.',
};

/**
 * Converts a canonical agent spec to an OpenAI Chat Completions request body.
 *
 * Provider gaps are surfaced as warnings rather than silently dropped or guessed:
 * - Model: uses modelOverride if provided; otherwise emits __MODEL_REQUIRED__ + warning.
 *   The canonical agent's model is always a Claude model ID — never forwarded to OpenAI.
 * - Server tools (e.g. web_search): emitted as function stubs + warning.
 *
 * System prompt composition order (deterministic):
 *   1. persona
 *   2. systemPrompt
 *   3. skill instruction texts (resolved from the builtin skills catalog)
 *
 * @param {object} canonicalAgent - Output of toCanonical() / serializeAgent()
 * @param {object} [opts]
 * @param {string} [opts.modelOverride] - OpenAI model name (e.g. 'gpt-4o')
 * @returns {{ payload: object, warnings: string[] }}
 */
export function toOpenAIPayload(canonicalAgent, { modelOverride } = {}) {
  const warnings = [];

  // Model — never guess an OpenAI model name from a Claude model ID.
  let model;
  if (modelOverride) {
    model = modelOverride;
  } else {
    warnings.push(
      'No OpenAI model specified. Set modelOverride to an OpenAI model name (e.g. "gpt-4o"). ' +
      'The canonical agent model field contains a Claude model ID and cannot be forwarded to OpenAI.'
    );
    model = '__MODEL_REQUIRED__';
  }

  // System prompt composition (same order as Anthropic converter).
  const parts = [];
  if (canonicalAgent.persona?.trim()) parts.push(canonicalAgent.persona.trim());
  if (canonicalAgent.systemPrompt?.trim()) parts.push(canonicalAgent.systemPrompt.trim());
  for (const skillId of (canonicalAgent.skills ?? [])) {
    const id = typeof skillId === 'string' ? skillId : skillId?.id;
    const instruction = SKILL_INSTRUCTIONS[id];
    if (instruction) parts.push(instruction);
  }
  const systemContent = parts.join('\n\n');

  // Tools — server tools become stubs with a warning.
  const tools = [];
  for (const toolId of (canonicalAgent.tools ?? [])) {
    const schema = OPENAI_TOOL_SCHEMAS[toolId];
    if (!schema) continue;
    tools.push(schema);
    if (OPENAI_STUB_TOOL_IDS.has(toolId)) {
      warnings.push(
        `Tool "${toolId}" is an Anthropic built-in with no OpenAI native equivalent. ` +
        `It has been emitted as a function stub — you must implement the function handler ` +
        `and connect it to an appropriate API.`
      );
    }
  }

  const payload = {
    model,
    messages: [{ role: 'system', content: systemContent }],
    tools,
  };

  return { payload, warnings };
}
