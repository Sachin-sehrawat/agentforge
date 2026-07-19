// Plain-data port of frontend/src/toolMeta.jsx's TOOL_META (label + blurb only —
// no icons/colors needed here). Keep in sync if the web app's catalog changes.
const TOOL_META = {
  // VS Code
  vscode_read_file: { label: 'Read File', blurb: 'Read a file from the VS Code workspace.' },
  vscode_write_file: { label: 'Write File', blurb: 'Create or overwrite a file in the workspace.' },
  vscode_run_terminal: { label: 'Run in Terminal', blurb: 'Execute a command in the integrated terminal.' },
  vscode_search_files: { label: 'Search Files', blurb: 'Find files or text across the workspace.' },
  vscode_get_diagnostics: { label: 'Get Diagnostics', blurb: 'Fetch errors and warnings from the editor.' },
  vscode_apply_diff: { label: 'Apply Diff', blurb: 'Apply a patch or edit to an open file.' },

  // Code & Dev
  web_search: { label: 'Web Search', blurb: 'Looks things up on the live web before answering.' },
  code_runner: { label: 'Code Runner', blurb: 'Runs short JS snippets in a sandbox.' },
  http_request: { label: 'API Request', blurb: 'Calls a public API and reads the response.' },
  git_commit: { label: 'Git Commit', blurb: 'Stage and commit changes to the repo.' },
  git_diff: { label: 'Git Diff', blurb: 'Show uncommitted changes in the working tree.' },
  npm_run: { label: 'npm Script', blurb: 'Run a script defined in package.json.' },

  // Data & Math
  calculator: { label: 'Calculator', blurb: 'Evaluates math expressions precisely.' },
  csv_parser: { label: 'CSV Parser', blurb: 'Parse and query tabular CSV data.' },
  json_transform: { label: 'JSON Transform', blurb: 'Filter and reshape JSON structures.' },
  sql_query: { label: 'SQL Query', blurb: 'Run a SQL query against a SQLite database.' },

  // Communication
  send_email: { label: 'Send Email', blurb: 'Send a message via SMTP or an email API.' },
  slack_message: { label: 'Slack Message', blurb: 'Post a message to a Slack channel.' },
  webhook_trigger: { label: 'Webhook', blurb: 'Fire a POST request to any webhook URL.' },

  // File & Storage
  read_file: { label: 'Read File', blurb: 'Read the contents of a local file.' },
  write_file: { label: 'Write File', blurb: 'Write or append content to a local file.' },
  list_directory: { label: 'List Directory', blurb: 'List files and folders in a directory.' },
  s3_upload: { label: 'S3 Upload', blurb: 'Upload a file to an Amazon S3 bucket.' },

  // AI & Models
  llm_call: { label: 'LLM Call', blurb: 'Send a prompt to another AI model.' },
  image_generate: { label: 'Image Generate', blurb: 'Generate an image via an image API.' },
  text_embed: { label: 'Text Embed', blurb: 'Convert text to a vector embedding.' },
};

module.exports = { TOOL_META };
