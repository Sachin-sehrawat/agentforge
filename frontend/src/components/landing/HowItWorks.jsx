import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const STEPS = [
  {
    number: '01',
    label: 'Design on the canvas',
    desc: 'Drag agent, tool, and persona nodes; wire connections that define behavior — no config files or boilerplate.',
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
    label: 'Attach skills & personas',
    desc: 'Pick from the library or write your own — reasoning, tone, and tool access all in one place.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    number: '03',
    label: 'Export as Markdown',
    desc: 'One click produces a portable, human-readable .md spec any provider can run — zero lock-in.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 13l2 2 4-4" />
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
      <div className="how-it-works__eyebrow">HOW IT WORKS</div>
      <h2 className="how-it-works__heading">Three steps from idea to spec</h2>
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
