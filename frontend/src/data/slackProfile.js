export const SLACK_PROFILE = {
  label: 'Slack Bot',

  // Tool IDs that work well in Slack interactions.
  // http_request is omitted: raw HTTP output is rarely readable in chat.
  // code_runner is omitted: execution output and tracebacks are not suited to Slack threads.
  recommendedTools: ['web_search', 'calculator'],

  // Injected at the end of the composed system prompt when Slack mode is enabled.
  systemPromptAddendum:
    'Format all responses using Slack mrkdwn syntax: use *bold*, _italic_, ' +
    '`inline code`, and >blockquote for emphasis. Avoid standard Markdown ' +
    '(no ## headings, no HTML). Do not render multi-column tables; prefer ' +
    'short prose or a simple list instead. Keep replies thread-aware — one ' +
    'focused idea per message.',

  // Appended as a separate guidance block after the system prompt and addendum.
  maxResponseGuidance:
    'Keep Slack replies concise — aim for under 200 words per message. ' +
    'If a topic requires more depth, state the key point and offer to ' +
    'continue in a thread reply rather than posting a wall of text.',
};
