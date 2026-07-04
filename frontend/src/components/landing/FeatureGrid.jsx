import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const FEATURES = [
  {
    key: 'visual-builder',
    heading: 'Visual Builder',
    desc: 'Drag-and-drop canvas to assemble agent nodes, tools, and connections.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M10 6.5h4M17.5 10v4M14 17.5h-4M6.5 14v-4" />
      </svg>
    ),
  },
  {
    key: 'marketplace',
    heading: 'Marketplace',
    desc: 'Publish agents publicly, browse community creations, and fork what you love.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
        <circle cx="9" cy="19" r="1.5" />
        <circle cx="19" cy="19" r="1.5" />
        <path d="M7 13l-1.6-8" />
      </svg>
    ),
  },
  {
    key: 'skills-system',
    heading: 'Skills System',
    desc: 'Attach reusable, typed skills to any agent — search, code execution, and more.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
  },
  {
    key: 'persona-library',
    heading: 'Persona Library',
    desc: 'Pick from curated personas or craft your own to shape agent tone and expertise.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    key: 'template-gallery',
    heading: 'Template Gallery',
    desc: 'Start fast with production-ready agent templates for common workflows.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M7 8h4M7 12h10" />
      </svg>
    ),
  },
  {
    key: 'markdown-export',
    heading: 'Markdown Export',
    desc: 'Download any agent as a portable Markdown spec — provider-agnostic by design.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 13l2 2 4-4" />
      </svg>
    ),
  },
];

export default function FeatureGrid() {
  const [ref, inView] = useInViewport();

  return (
    <section className="feature-grid-section" ref={ref}>
      <h2 className="feature-grid-section__heading">Everything you need to build great agents</h2>
      <p className="feature-grid-section__sub">
        One canvas. Six superpowers.
      </p>
      <div className={`feature-grid${inView ? ' feature-grid--visible' : ''}`}>
        {FEATURES.map((f, i) => (
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
    </section>
  );
}
