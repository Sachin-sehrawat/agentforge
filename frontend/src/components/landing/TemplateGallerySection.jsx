import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const TEMPLATES = [
  {
    name: 'Researcher',
    desc: 'Web search, cites sources, shows step-by-step reasoning.',
    tools: ['Web Search', 'Citations', 'Reasoning'],
    accent: '#6366f1',
  },
  {
    name: 'Customer Service',
    desc: 'HTTP request lookups with a formal, concise communication style.',
    tools: ['HTTP Request', 'Formal Tone'],
    accent: '#f97316',
  },
  {
    name: 'Code Assistant',
    desc: 'Runs code, reasons step-by-step before producing output.',
    tools: ['Code Runner', 'Reasoning'],
    accent: '#8b5cf6',
  },
  {
    name: 'Data Analyst',
    desc: 'Calculator and code runner for transformation and statistics.',
    tools: ['Calculator', 'Code Runner'],
    accent: '#f59e0b',
  },
  {
    name: 'Blank',
    desc: 'An empty canvas — start your custom agent from scratch.',
    tools: ['—'],
    accent: '#9ca3af',
  },
];

export default function TemplateGallerySection({ onStartBuilding }) {
  const [ref, inView] = useInViewport({ threshold: 0.1 });

  return (
    <section
      className={`template-gallery-section${inView ? ' template-gallery-section--visible' : ''}`}
      ref={ref}
    >
      <div className="template-gallery-section__header">
        <div className="template-gallery-section__eyebrow">TEMPLATE GALLERY</div>
        <h2 className="template-gallery-section__heading">
          Start from a production-ready agent
        </h2>
      </div>
      <div className="template-gallery-section__grid">
        {TEMPLATES.map((t, i) => (
          <div
            key={t.name}
            className="template-card"
            style={{ '--template-accent': t.accent, '--stagger': i }}
          >
            <div className="template-card__accent-bar" />
            <div className="template-card__body">
              <h3 className="template-card__name">{t.name}</h3>
              <p className="template-card__desc">{t.desc}</p>
              <div className="template-card__tools">
                {t.tools.map((tool) => (
                  <span key={tool} className="template-card__tool-chip">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
