import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const STEPS = [
  {
    number: '01',
    label: 'Build on the canvas',
    desc: 'Drag-and-drop agent nodes, connect tools, and configure behavior visually — no config files or boilerplate.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M10 6.5h4M17.5 10v4M14 17.5h-4M6.5 14v-4" />
      </svg>
    ),
  },
  {
    number: '02',
    label: 'Publish to marketplace',
    desc: 'Share your agent with the community in one click — public, unlisted, or scoped to your team.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L4.5 7.5v9L12 22l7.5-5.5v-9L12 2z" />
        <path d="M12 2v20M4.5 7.5L12 13l7.5-5.5" />
      </svg>
    ),
  },
  {
    number: '03',
    label: 'Fork & remix',
    desc: 'Find an agent you love, fork it in one click, and make it yours — build on the community's best work.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <path d="M6 8v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8" />
        <line x1="12" y1="13" x2="12" y2="16" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const [sectionRef, inView] = useInViewport({ threshold: 0.2 });

  return (
    <section
      className={`how-it-works${inView ? ' how-it-works--visible' : ''}`}
      ref={sectionRef}
    >
      <h2 className="how-it-works__heading">How it works</h2>
      <p className="how-it-works__sub">From idea to live agent in three steps.</p>

      <div className="how-it-works__track">
        {/* Connecting SVG line — draws in when section enters the viewport */}
        <svg
          className={`how-it-works__connector${inView ? ' how-it-works__connector--animate' : ''}`}
          viewBox="0 0 600 4"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="hiw-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <line
            x1="0"
            y1="2"
            x2="600"
            y2="2"
            stroke="url(#hiw-line-grad)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        {STEPS.map((step) => (
          <div key={step.number} className="how-it-works__step">
            <div className="how-it-works__icon-wrap">
              <div className="how-it-works__icon">{step.icon}</div>
            </div>
            <span className="how-it-works__step-num">Step {step.number}</span>
            <h3 className="how-it-works__step-label">{step.label}</h3>
            <p className="how-it-works__step-desc">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
