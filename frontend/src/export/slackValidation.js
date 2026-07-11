import { SLACK_PROFILE } from '../data/slackProfile.js';

// Keywords in a system prompt that suggest markdown-heavy output unlikely to
// render well in Slack. The check is skipped when the prompt already
// references Slack or mrkdwn, indicating the author is already aware.
const HEAVY_MARKDOWN_RE = /\btables?\b|```|\bcode\s+blocks?\b|\b(numbered|bulleted?|long)\s+lists?\b/i;
const SLACK_AWARE_RE = /\b(slack|mrkdwn)\b/i;

/**
 * Validates a canonical agent definition against Slack compatibility constraints.
 *
 * @param {object} canonicalAgent - Output of toCanonical() / serializeAgent()
 * @param {string} [canonicalAgent.systemPrompt]
 * @param {string[]} [canonicalAgent.tools]
 * @returns {{ warnings: Array<{code: string, field: string|null, message: string}> }}
 */
export function validateForSlack(canonicalAgent) {
  const warnings = [];

  const systemPrompt = typeof canonicalAgent?.systemPrompt === 'string'
    ? canonicalAgent.systemPrompt
    : '';
  const tools = Array.isArray(canonicalAgent?.tools) ? canonicalAgent.tools : [];

  // ── Tool suitability ──────────────────────────────────────────────────────

  for (const toolId of tools) {
    if (!SLACK_PROFILE.recommendedTools.includes(toolId)) {
      warnings.push({
        code: 'SLACK_UNSUITABLE_TOOL',
        field: 'tools',
        message: `"${toolId}" may not be suitable for Slack interactions.`,
      });
    }
  }

  // ── System prompt checks ──────────────────────────────────────────────────

  if (!systemPrompt.trim()) {
    warnings.push({
      code: 'SLACK_NO_SYSTEM_PROMPT',
      field: 'systemPrompt',
      message: 'No system prompt is set. Consider adding one to establish tone and Slack-specific formatting rules.',
    });
  } else if (
    HEAVY_MARKDOWN_RE.test(systemPrompt) &&
    !SLACK_AWARE_RE.test(systemPrompt)
  ) {
    warnings.push({
      code: 'SLACK_HEAVY_MARKDOWN_PROMPT',
      field: 'systemPrompt',
      message:
        'System prompt may encourage output (tables, code blocks, or long lists) that does not render well in Slack. ' +
        'Consider restricting formatting to Slack mrkdwn.',
    });
  }

  return { warnings };
}
