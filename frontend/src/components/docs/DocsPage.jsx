import React, { useState } from 'react';
import DocViewer from './DocViewer.jsx';

// ── Category definitions ─────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    color: '#6366f1',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
      </svg>
    ),
  },
  {
    id: 'api',
    label: 'API Reference',
    color: '#06b6d4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
  {
    id: 'auth',
    label: 'Auth & Security',
    color: '#8b5cf6',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    id: 'database',
    label: 'Database & Migration',
    color: '#f59e0b',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
  },
  {
    id: 'features',
    label: 'Features',
    color: '#10b981',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
  {
    id: 'operations',
    label: 'Operations',
    color: '#f97316',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    id: 'reference',
    label: 'Reference',
    color: '#6b7280',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
];

// ── Doc metadata ─────────────────────────────────────────────────────────────
const DOCS = [
  // Getting Started
  {
    file: 'docker-setup.md',
    title: 'Docker Setup',
    desc: 'Run the full stack locally with Docker Compose — PostgreSQL, MongoDB, and backend in a single command.',
    category: 'getting-started',
    readMin: 5,
    tags: ['Docker', 'Local Dev'],
  },
  {
    file: 'deployment-guide.md',
    title: 'Deployment Guide',
    desc: 'Production deployment procedures including environment variables, database initialization, and health verification.',
    category: 'getting-started',
    readMin: 8,
    tags: ['Production', 'Environment'],
  },

  // API Reference
  {
    file: 'api.md',
    title: 'API Reference',
    desc: 'Complete REST API — agents, skills, marketplace, webhooks, GitHub sync, quotas, audit log, and admin endpoints.',
    category: 'api',
    readMin: 20,
    tags: ['REST', 'Endpoints'],
  },
  {
    file: 'api-examples.md',
    title: 'API Examples',
    desc: 'Practical code examples covering agent CRUD, export pipelines, webhook registration, and quota management.',
    category: 'api',
    readMin: 10,
    tags: ['Examples', 'curl'],
  },
  {
    file: 'audit-log.md',
    title: 'Audit Log',
    desc: 'Admin-only append-only event log for tracking all write operations across agents, skills, and user management.',
    category: 'api',
    readMin: 4,
    tags: ['Admin', 'Events'],
  },

  // Auth & Security
  {
    file: 'auth.md',
    title: 'Authentication',
    desc: 'JWT-based auth with 15-minute access tokens, signup/login flows, password hashing with Argon2.',
    category: 'auth',
    readMin: 6,
    tags: ['JWT', 'Tokens'],
  },
  {
    file: 'frontend-auth.md',
    title: 'Frontend Auth',
    desc: 'How the React frontend manages auth state, in-memory token storage, and protected view patterns.',
    category: 'auth',
    readMin: 5,
    tags: ['React', 'Context'],
  },
  {
    file: 'webhook-signatures.md',
    title: 'Webhook Signatures',
    desc: 'HMAC-SHA256 verification for webhook deliveries — how to validate that payloads come from AgentForge.',
    category: 'auth',
    readMin: 5,
    tags: ['HMAC', 'Security'],
    inAppView: 'docs/webhook-signatures',
  },

  // Database & Migration
  {
    file: 'database-schema.md',
    title: 'Database Schema',
    desc: '16 PostgreSQL tables and 6 MongoDB collections — full schema with columns, constraints, and index definitions.',
    category: 'database',
    readMin: 12,
    tags: ['PostgreSQL', 'MongoDB'],
  },
  {
    file: 'migration-overview.md',
    title: 'Migration Overview',
    desc: 'Architecture evolution from SQLite to PostgreSQL + MongoDB with phase-by-phase breakdown and key decisions.',
    category: 'database',
    readMin: 8,
    tags: ['Architecture', 'History'],
  },
  {
    file: 'migration-guide.md',
    title: 'Migration Guide',
    desc: 'Step-by-step SQLite → PostgreSQL migration with dry-run, execution, verification, and rollback procedures.',
    category: 'database',
    readMin: 6,
    tags: ['Migration', 'SQLite'],
  },
  {
    file: 'migration-checklist.md',
    title: 'Migration Checklist',
    desc: 'Operator checklist for migration day — pre-checks, execution steps, post-verification, and rollback criteria.',
    category: 'database',
    readMin: 4,
    tags: ['Checklist', 'Ops'],
  },

  // Features
  {
    file: 'github-integration.md',
    title: 'GitHub Integration',
    desc: 'OAuth 2.0 flow for connecting GitHub accounts and syncing agent definitions to repositories.',
    category: 'features',
    readMin: 7,
    tags: ['GitHub', 'OAuth'],
  },
  {
    file: 'quota-policy.md',
    title: 'Quota Policy',
    desc: 'Per-user daily export and save quotas with free/paid tier differentiation and enforcement middleware.',
    category: 'features',
    readMin: 5,
    tags: ['Quotas', 'Tiers'],
  },
  {
    file: 'quota-scaling.md',
    title: 'Quota Scaling',
    desc: 'Strategy for scaling quota enforcement as user volume grows — counters, caching, and tier transitions.',
    category: 'features',
    readMin: 4,
    tags: ['Scaling', 'Performance'],
  },

  // Operations
  {
    file: 'runbook.md',
    title: 'Operations Runbook',
    desc: 'Day-to-day procedures: health checks, restarts, log access, and incident response workflows.',
    category: 'operations',
    readMin: 8,
    tags: ['Runbook', 'Health'],
  },
  {
    file: 'disaster-recovery.md',
    title: 'Disaster Recovery',
    desc: 'Backup procedures, retention policies, and step-by-step recovery scenarios for all data stores.',
    category: 'operations',
    readMin: 10,
    tags: ['Backup', 'RTO/RPO'],
  },
  {
    file: 'production-deployment-runbook.md',
    title: 'Production Runbook',
    desc: 'Authoritative step-by-step guide for shipping releases to production with rollback decision criteria.',
    category: 'operations',
    readMin: 7,
    tags: ['Release', 'Production'],
  },
  {
    file: 'cicd-pipeline.md',
    title: 'CI/CD Pipeline',
    desc: 'Continuous integration and deployment configuration — automated tests, builds, and production releases.',
    category: 'operations',
    readMin: 6,
    tags: ['CI/CD', 'GitHub Actions'],
  },
  {
    file: 'zero-downtime-deployment.md',
    title: 'Zero-Downtime Deploy',
    desc: 'Blue-green and rolling deployment strategies to update AgentForge without service interruption.',
    category: 'operations',
    readMin: 6,
    tags: ['Blue-Green', 'Deploy'],
  },
  {
    file: 'testing-guide.md',
    title: 'Testing Guide',
    desc: 'Test suite structure, ≥90% coverage requirements, and how to run unit and integration tests.',
    category: 'operations',
    readMin: 5,
    tags: ['Testing', 'Vitest'],
  },
  {
    file: 'performance-report.md',
    title: 'Performance Report',
    desc: 'Benchmark results and performance characteristics for key endpoints, database queries, and exports.',
    category: 'operations',
    readMin: 5,
    tags: ['Benchmarks', 'Metrics'],
  },

  // Reference
  {
    file: 'pr-127-github-oauth.md',
    title: 'GitHub OAuth PR Notes',
    desc: 'Design notes and implementation decisions from the GitHub OAuth integration pull request.',
    category: 'reference',
    readMin: 3,
    tags: ['GitHub', 'Design Notes'],
  },
];

// ── DocCard component ────────────────────────────────────────────────────────
function DocCard({ doc, catColor, onOpen }) {
  return (
    <button className="docs-card" onClick={onOpen} style={{ '--card-accent': catColor }}>
      <div className="docs-card-body">
        <h3 className="docs-card-title">{doc.title}</h3>
        <p className="docs-card-desc">{doc.desc}</p>
      </div>
      <div className="docs-card-footer">
        <div className="docs-card-tags">
          {doc.tags.map(t => <span key={t} className="docs-card-tag">{t}</span>)}
        </div>
        <span className="docs-card-read">{doc.readMin} min</span>
      </div>
      <div className="docs-card-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    </button>
  );
}

// ── DocsPage ─────────────────────────────────────────────────────────────────
export default function DocsPage({ onBack, onNavigate }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [query, setQuery] = useState('');

  if (selectedDoc) {
    return (
      <DocViewer
        filename={selectedDoc.file}
        title={selectedDoc.title}
        onBack={() => setSelectedDoc(null)}
      />
    );
  }

  const q = query.toLowerCase().trim();
  const filtered = DOCS.filter(d => {
    const matchCat = activeCategory === 'all' || d.category === activeCategory;
    const matchQ = !q || d.title.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const groupedByCat = CATEGORIES.map(cat => ({
    cat,
    docs: filtered.filter(d => d.category === cat.id),
  })).filter(({ docs }) => docs.length > 0);

  const totalDocs = DOCS.length;

  return (
    <div className="docs-hub">
      {/* Hero */}
      <div className="docs-hero">
        <div className="docs-hero-inner">
          <div className="docs-hero-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <div>
            <h1 className="docs-hero-title">AgentForge Documentation</h1>
            <p className="docs-hero-sub">{totalDocs} guides covering API, database, deployment, security, and operations</p>
          </div>
        </div>
        <div className="docs-search-wrap">
          <svg className="docs-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="docs-search"
            placeholder="Search docs…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="docs-search-clear" onClick={() => setQuery('')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      <div className="docs-layout">
        {/* Sidebar */}
        <aside className="docs-sidebar">
          <div className="docs-sidebar-label">Categories</div>
          <nav className="docs-sidebar-nav">
            <button
              className={`docs-sidebar-item${activeCategory === 'all' ? ' active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              <span className="docs-sidebar-item-dot" style={{ background: '#6b7280' }} />
              All docs
              <span className="docs-sidebar-count">{DOCS.length}</span>
            </button>
            {CATEGORIES.map(cat => {
              const count = DOCS.filter(d => d.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`docs-sidebar-item${activeCategory === cat.id ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <span className="docs-sidebar-item-dot" style={{ background: cat.color }} />
                  {cat.label}
                  <span className="docs-sidebar-count">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="docs-main">
          {filtered.length === 0 && (
            <div className="docs-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p>No docs match <strong>"{query}"</strong></p>
              <button className="docs-clear-btn" onClick={() => setQuery('')}>Clear search</button>
            </div>
          )}

          {activeCategory === 'all' && !q
            ? CATEGORIES.map(cat => {
                const catDocs = DOCS.filter(d => d.category === cat.id);
                return (
                  <section key={cat.id} className="docs-section" id={`cat-${cat.id}`}>
                    <div className="docs-section-header" style={{ '--sec-color': cat.color }}>
                      <span className="docs-section-icon">{cat.icon}</span>
                      <h2 className="docs-section-title">{cat.label}</h2>
                      <span className="docs-section-count">{catDocs.length}</span>
                    </div>
                    <div className="docs-grid">
                      {catDocs.map(doc => (
                        <DocCard
                          key={doc.file}
                          doc={doc}
                          catColor={cat.color}
                          onOpen={() => {
                            if (doc.inAppView) {
                              onNavigate(doc.inAppView);
                            } else {
                              setSelectedDoc(doc);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            : groupedByCat.map(({ cat, docs }) => (
                <section key={cat.id} className="docs-section" id={`cat-${cat.id}`}>
                  <div className="docs-section-header" style={{ '--sec-color': cat.color }}>
                    <span className="docs-section-icon">{cat.icon}</span>
                    <h2 className="docs-section-title">{cat.label}</h2>
                    <span className="docs-section-count">{docs.length}</span>
                  </div>
                  <div className="docs-grid">
                    {docs.map(doc => (
                      <DocCard
                        key={doc.file}
                        doc={doc}
                        catColor={cat.color}
                        onOpen={() => {
                          if (doc.inAppView) {
                            onNavigate(doc.inAppView);
                          } else {
                            setSelectedDoc(doc);
                          }
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))
          }
        </main>
      </div>
    </div>
  );
}
