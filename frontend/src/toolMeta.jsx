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
  // ── VS Code ──────────────────────────────────────────────────────────────
  vscode_read_file: icon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </>
  ),
  vscode_write_file: icon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="9 15 11 17 15 13" />
    </>
  ),
  vscode_run_terminal: icon(
    <>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <polyline points="7 8 11 12 7 16" />
      <line x1="13" y1="16" x2="18" y2="16" />
    </>
  ),
  vscode_search_files: icon(
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
      <line x1="14.2" y1="14.2" x2="16.5" y2="16.5" />
    </>
  ),
  vscode_get_diagnostics: icon(
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  vscode_apply_diff: icon(
    <>
      <line x1="4" y1="6" x2="10" y2="6" />
      <line x1="4" y1="10" x2="10" y2="10" />
      <line x1="4" y1="14" x2="10" y2="14" />
      <polyline points="14 9 17 12 14 15" />
      <line x1="17" y1="12" x2="21" y2="12" />
    </>
  ),

  // ── Code & Dev ───────────────────────────────────────────────────────────
  web_search: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20" y1="20" x2="15.8" y2="15.8" />
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
  git_commit: icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="8" />
      <line x1="12" y1="16" x2="12" y2="22" />
    </>
  ),
  git_diff: icon(
    <>
      <rect x="3" y="8" width="10" height="11" rx="1" />
      <path d="M9 2h10a1 1 0 0 1 1 1v10" />
      <line x1="6" y1="13" x2="10" y2="13" />
      <line x1="14" y1="7" x2="18" y2="7" />
      <line x1="16" y1="5" x2="16" y2="9" />
    </>
  ),
  npm_run: icon(
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </>
  ),

  // ── Data & Math ──────────────────────────────────────────────────────────
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
  csv_parser: icon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </>
  ),
  json_transform: icon(
    <>
      <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    </>
  ),
  sql_query: icon(
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),

  // ── Communication ────────────────────────────────────────────────────────
  send_email: icon(
    <>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22 6 12 13 2 6" />
    </>
  ),
  slack_message: icon(
    <>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="10" y1="8" x2="10" y2="14" />
      <line x1="14" y1="8" x2="14" y2="14" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  webhook_trigger: icon(
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  ),

  // ── File & Storage ───────────────────────────────────────────────────────
  read_file: icon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </>
  ),
  write_file: icon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10.5 17.5l3.5-3.5 1.5 1.5-3.5 3.5h-1.5v-1.5z" />
    </>
  ),
  list_directory: icon(
    <>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="8" y1="14" x2="16" y2="14" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </>
  ),
  s3_upload: icon(
    <>
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </>
  ),

  // ── AI & Models ──────────────────────────────────────────────────────────
  llm_call: icon(
    <>
      <path d="M12 2l1.8 5.4H20l-4.8 3.5 1.8 5.5L12 13l-5 3.4 1.8-5.5L4 7.4h6.2L12 2z" />
    </>
  ),
  image_generate: icon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </>
  ),
  text_embed: icon(
    <>
      <line x1="3" y1="7" x2="11" y2="7" />
      <line x1="3" y1="11" x2="11" y2="11" />
      <line x1="3" y1="15" x2="8" y2="15" />
      <polyline points="14 9 18 12 14 15" />
      <line x1="18" y1="12" x2="21" y2="12" />
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
  // VS Code
  vscode_read_file:    { label: 'Read File',        color: '#007ACC', blurb: 'Read a file from the VS Code workspace.' },
  vscode_write_file:   { label: 'Write File',       color: '#007ACC', blurb: 'Create or overwrite a file in the workspace.' },
  vscode_run_terminal: { label: 'Run in Terminal',  color: '#007ACC', blurb: 'Execute a command in the integrated terminal.' },
  vscode_search_files: { label: 'Search Files',     color: '#007ACC', blurb: 'Find files or text across the workspace.' },
  vscode_get_diagnostics: { label: 'Get Diagnostics', color: '#007ACC', blurb: 'Fetch errors and warnings from the editor.' },
  vscode_apply_diff:   { label: 'Apply Diff',       color: '#007ACC', blurb: 'Apply a patch or edit to an open file.' },

  // Code & Dev
  web_search:  { label: 'Web Search',  color: '#6366f1', blurb: 'Looks things up on the live web before answering.' },
  code_runner: { label: 'Code Runner', color: '#8b5cf6', blurb: 'Runs short JS snippets in a sandbox.' },
  http_request:{ label: 'API Request', color: '#f97316', blurb: 'Calls a public API and reads the response.' },
  git_commit:  { label: 'Git Commit',  color: '#8b5cf6', blurb: 'Stage and commit changes to the repo.' },
  git_diff:    { label: 'Git Diff',    color: '#8b5cf6', blurb: 'Show uncommitted changes in the working tree.' },
  npm_run:     { label: 'npm Script',  color: '#8b5cf6', blurb: 'Run a script defined in package.json.' },

  // Data & Math
  calculator:      { label: 'Calculator',       color: '#f59e0b', blurb: 'Evaluates math expressions precisely.' },
  csv_parser:      { label: 'CSV Parser',       color: '#f59e0b', blurb: 'Parse and query tabular CSV data.' },
  json_transform:  { label: 'JSON Transform',   color: '#f59e0b', blurb: 'Filter and reshape JSON structures.' },
  sql_query:       { label: 'SQL Query',        color: '#f59e0b', blurb: 'Run a SQL query against a SQLite database.' },

  // Communication
  send_email:      { label: 'Send Email',       color: '#10b981', blurb: 'Send a message via SMTP or an email API.' },
  slack_message:   { label: 'Slack Message',    color: '#10b981', blurb: 'Post a message to a Slack channel.' },
  webhook_trigger: { label: 'Webhook',          color: '#10b981', blurb: 'Fire a POST request to any webhook URL.' },

  // File & Storage
  read_file:       { label: 'Read File',        color: '#f97316', blurb: 'Read the contents of a local file.' },
  write_file:      { label: 'Write File',       color: '#f97316', blurb: 'Write or append content to a local file.' },
  list_directory:  { label: 'List Directory',   color: '#f97316', blurb: 'List files and folders in a directory.' },
  s3_upload:       { label: 'S3 Upload',        color: '#f97316', blurb: 'Upload a file to an Amazon S3 bucket.' },

  // AI & Models
  llm_call:        { label: 'LLM Call',         color: '#a855f7', blurb: 'Send a prompt to another AI model.' },
  image_generate:  { label: 'Image Generate',   color: '#a855f7', blurb: 'Generate an image via an image API.' },
  text_embed:      { label: 'Text Embed',       color: '#a855f7', blurb: 'Convert text to a vector embedding.' },
};

export const TOOL_CATEGORIES = [
  {
    id: 'vscode',
    label: 'VS Code',
    color: '#007ACC',
    tools: ['vscode_read_file', 'vscode_write_file', 'vscode_run_terminal', 'vscode_search_files', 'vscode_get_diagnostics', 'vscode_apply_diff'],
  },
  {
    id: 'code',
    label: 'Code & Dev',
    color: '#8b5cf6',
    tools: ['web_search', 'code_runner', 'http_request', 'git_commit', 'git_diff', 'npm_run'],
  },
  {
    id: 'data',
    label: 'Data & Math',
    color: '#f59e0b',
    tools: ['calculator', 'csv_parser', 'json_transform', 'sql_query'],
  },
  {
    id: 'comms',
    label: 'Communication',
    color: '#10b981',
    tools: ['send_email', 'slack_message', 'webhook_trigger'],
  },
  {
    id: 'files',
    label: 'File & Storage',
    color: '#f97316',
    tools: ['read_file', 'write_file', 'list_directory', 's3_upload'],
  },
  {
    id: 'ai',
    label: 'AI & Models',
    color: '#a855f7',
    tools: ['llm_call', 'image_generate', 'text_embed'],
  },
];

// Flat ordered list — keeps backwards compat with any code using TOOL_ORDER
export const TOOL_ORDER = TOOL_CATEGORIES.flatMap((c) => c.tools);
