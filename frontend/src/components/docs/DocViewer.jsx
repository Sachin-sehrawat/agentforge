import React, { useEffect, useRef, useState } from 'react';

// ── Inline format (bold, italic, inline code, links) ────────────────────────
function inlineFormat(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="dv-inline-code">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="dv-link">$1</a>');
}

// ── CopyButton ───────────────────────────────────────────────────────────────
function CopyButton({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="doc-code-copy"
      onClick={() => {
        navigator.clipboard.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// ── Markdown renderer ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let codeAccum = null;
  let codeLang = '';
  let tableRows = [];
  let listItems = [];
  let listType = null;
  let blockquoteLines = [];

  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    result.push(
      <Tag key={result.length} className={`dv-${listType}`}>
        {listItems.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
        ))}
      </Tag>
    );
    listItems = [];
    listType = null;
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    const [header, ...body] = tableRows;
    result.push(
      <div key={result.length} className="doc-table-wrap">
        <table className="doc-table">
          <thead><tr>{header.map((c, i) => <th key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(c) }} />)}</tr></thead>
          <tbody>{body.map((row, ri) => (
            <tr key={ri}>{row.map((c, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: inlineFormat(c) }} />)}</tr>
          ))}</tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  const flushBlockquote = () => {
    if (!blockquoteLines.length) return;
    result.push(
      <blockquote key={result.length} className="doc-callout doc-callout--info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div>{blockquoteLines.map((l, i) => <p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(l) }} />)}</div>
      </blockquote>
    );
    blockquoteLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inside code block
    if (codeAccum !== null) {
      if (line.startsWith('```')) {
        const code = codeAccum.join('\n');
        result.push(
          <div key={result.length} className="doc-code-block">
            <div className="doc-code-header">
              {codeLang && <span className="doc-code-lang">{codeLang}</span>}
              <CopyButton code={code} />
            </div>
            <pre className="doc-code-pre"><code>{code}</code></pre>
          </div>
        );
        codeAccum = null;
        codeLang = '';
      } else {
        codeAccum.push(line);
      }
      continue;
    }

    // Start code block
    if (line.startsWith('```')) {
      flushList(); flushTable(); flushBlockquote();
      codeLang = line.slice(3).trim();
      codeAccum = [];
      continue;
    }

    // Table row
    if (/^\|.+\|$/.test(line)) {
      flushList(); flushBlockquote();
      if (/^\|[\s\-:|]+\|$/.test(line)) continue; // separator
      tableRows.push(line.slice(1, -1).split('|').map(c => c.trim()));
      continue;
    } else {
      flushTable();
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList(); flushTable();
      blockquoteLines.push(line.slice(2));
      continue;
    } else {
      flushBlockquote();
    }

    // Unordered list
    if (/^[\*\-] /.test(line)) {
      flushTable();
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(line.slice(2));
      continue;
    }
    // Ordered list
    if (/^\d+\. /.test(line)) {
      flushTable();
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(line.replace(/^\d+\. /, ''));
      continue;
    }
    flushList();

    // Headings
    if (line.startsWith('#### ')) {
      result.push(<h4 key={result.length} className="dv-h4" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(5)) }} />);
    } else if (line.startsWith('### ')) {
      result.push(<h3 key={result.length} className="dv-h3" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(4)) }} />);
    } else if (line.startsWith('## ')) {
      result.push(<h2 key={result.length} className="dv-h2" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(3)) }} />);
    } else if (line.startsWith('# ')) {
      result.push(<h1 key={result.length} className="dv-h1" dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(2)) }} />);
    }
    // HR
    else if (/^-{3,}$/.test(line.trim())) {
      result.push(<hr key={result.length} className="dv-hr" />);
    }
    // Checkbox list item (GitHub flavored)
    else if (/^- \[[ x]\] /.test(line)) {
      const checked = line[3] === 'x';
      result.push(
        <p key={result.length} className="dv-check">
          <span className={`dv-checkbox${checked ? ' checked' : ''}`}>{checked ? '✓' : ''}</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.slice(6)) }} />
        </p>
      );
    }
    // Empty line
    else if (line.trim() === '') {
      // paragraph spacer — no element needed
    }
    // Paragraph
    else {
      result.push(<p key={result.length} className="dv-p" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    }
  }

  flushList(); flushTable(); flushBlockquote();
  return result;
}

// ── Build sidebar headings from raw markdown ─────────────────────────────────
function extractHeadings(text) {
  const headings = [];
  const lines = text.split('\n');
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m2 = line.match(/^## (.+)$/);
    if (m2) headings.push({ level: 2, text: m2[1], id: m2[1].toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    const m3 = line.match(/^### (.+)$/);
    if (m3) headings.push({ level: 3, text: m3[1], id: m3[1].toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  }
  return headings;
}

// ── Main DocViewer component ─────────────────────────────────────────────────
export default function DocViewer({ filename, title, onBack }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const mainRef = useRef(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    fetch(`/api/docs/${filename}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setContent)
      .catch(e => setError(e.message));
  }, [filename]);

  const headings = content ? extractHeadings(content) : [];

  // Inject ids into rendered headings via useEffect after render
  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.querySelectorAll('h2, h3').forEach(el => {
      const id = el.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      el.id = id;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0 }
    );
    mainRef.current.querySelectorAll('h2, h3').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [content]);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="doc-page">
      <div className="doc-topbar">
        <button className="doc-back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Docs
        </button>
        <div className="doc-topbar-title">
          <span className="doc-topbar-badge">Docs</span>
          {title}
        </div>
      </div>

      <div className="doc-layout">
        <aside className="doc-sidebar">
          {headings.length > 0 && (
            <>
              <div className="doc-sidebar-label">On this page</div>
              <nav className="doc-sidebar-nav">
                {headings.map(({ id, text, level }) => (
                  <button
                    key={id}
                    className={`doc-sidebar-item${level === 3 ? ' doc-sidebar-item--sub' : ''}${activeId === id ? ' active' : ''}`}
                    onClick={() => scrollTo(id)}
                  >
                    {text}
                  </button>
                ))}
              </nav>
            </>
          )}
        </aside>

        <main className="doc-main" ref={mainRef}>
          {error && (
            <div className="doc-callout doc-callout--danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <div>Failed to load document: {error}</div>
            </div>
          )}
          {!content && !error && (
            <div className="dv-loading">
              <div className="dv-spinner" />
              Loading…
            </div>
          )}
          {content && (
            <div className="dv-body">
              {renderMarkdown(content)}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
