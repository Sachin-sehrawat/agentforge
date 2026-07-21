import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const INTEGRATIONS = [
  {
    key: 'github',
    heading: 'GitHub Sync',
    desc: 'Push any agent to a repository you own as Markdown or JSON — pick the repo, branch, and path per agent.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 98 96" fill="white" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
        />
      </svg>
    ),
  },
  {
    key: 'claude-mcp',
    heading: 'Claude Integration (MCP)',
    desc: 'Connect AgentForge to Claude over the Model Context Protocol — list, create, edit, and fork agents from a conversation.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M2 14h2M20 14h2M9 12v2M15 12v2" />
      </svg>
    ),
  },
];

export default function IntegrationsSection({ onOpenIntegrations }) {
  const [ref, inView] = useInViewport();

  return (
    <section className="feature-grid-section integrations-section" ref={ref}>
      <div className="feature-grid-section__eyebrow">INTEGRATIONS</div>
      <h2 className="feature-grid-section__heading">Bring your own tools</h2>
      <p className="feature-grid-section__sub">
        AgentForge plugs into the platforms you already use.
      </p>
      <div className={`feature-grid integrations-grid${inView ? ' feature-grid--visible' : ''}`}>
        {INTEGRATIONS.map((f, i) => (
          <div
            key={f.key}
            className="feature-card"
            style={{ '--stagger': i }}
          >
            <div className="feature-card__icon">
              {f.icon}
            </div>
            <h3 className="feature-card__heading">{f.heading}</h3>
            <p className="feature-card__desc">{f.desc}</p>
          </div>
        ))}
      </div>
      {onOpenIntegrations && (
        <button className="integrations-section__cta" onClick={onOpenIntegrations}>
          View integration setup →
        </button>
      )}
    </section>
  );
}
