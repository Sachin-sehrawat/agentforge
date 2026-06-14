// Visual metadata for each tool type. Pairs with the backend's TOOL_CATALOG
// (same ids), but keeps presentation concerns (icon, accent color, blurb)
// on the frontend.

const icon = (paths) => (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {paths}
  </svg>
);

export const ICONS = {
  web_search: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20" y1="20" x2="15.8" y2="15.8" />
    </>
  ),
  calculator: icon(
    <>
      <rect x="4.5" y="2.5" width="15" height="19" rx="2" />
      <line x1="7.5" y1="6.5" x2="16.5" y2="6.5" />
      <line x1="7.5" y1="11" x2="9.5" y2="11" />
      <line x1="11.5" y1="11" x2="13.5" y2="11" />
      <line x1="15.5" y1="11" x2="17.5" y2="11" />
      <line x1="7.5" y1="15" x2="9.5" y2="15" />
      <line x1="11.5" y1="15" x2="13.5" y2="15" />
      <line x1="15.5" y1="15" x2="17.5" y2="15" />
      <line x1="7.5" y1="19" x2="9.5" y2="19" />
      <line x1="11.5" y1="19" x2="17.5" y2="19" />
    </>
  ),
  code_runner: icon(
    <>
      <polyline points="9 6 3 12 9 18" />
      <polyline points="15 6 21 12 15 18" />
    </>
  ),
  http_request: icon(
    <>
      <path d="M9 7H6a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3h3" />
      <path d="M15 7h3a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-3" />
      <line x1="8" y1="10" x2="16" y2="10" />
    </>
  ),
};

export const AGENT_ICON = icon(
  <>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <line x1="12" y1="2" x2="12" y2="7" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="2" y1="12" x2="7" y2="12" />
    <line x1="17" y1="12" x2="22" y2="12" />
    <circle cx="9.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="11" r="0.9" fill="currentColor" stroke="none" />
    <line x1="9.5" y1="14" x2="14.5" y2="14" />
  </>
);

export const TOOL_META = {
  web_search: {
    label: 'Web Search',
    color: 'var(--accent-cyan)',
    blurb: 'Looks things up on the live web before answering.',
  },
  calculator: {
    label: 'Calculator',
    color: 'var(--accent-amber)',
    blurb: 'Evaluates math expressions precisely.',
  },
  code_runner: {
    label: 'Code Runner',
    color: 'var(--accent-violet)',
    blurb: 'Runs short JS snippets in a sandbox.',
  },
  http_request: {
    label: 'API Request',
    color: 'var(--accent-coral)',
    blurb: 'Calls a public API and reads the response.',
  },
};

export const TOOL_ORDER = ['web_search', 'calculator', 'code_runner', 'http_request'];
