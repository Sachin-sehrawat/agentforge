import React from 'react';
import useInViewport from '../../hooks/useInViewport.js';

const TESTIMONIALS = [
  {
    quote: 'We shipped our support agent spec in an afternoon — no engineer needed until deploy.',
    name: 'Priya N.',
    role: 'Ops Lead, Fintech startup',
    initials: 'PN',
    accent: '#6366f1',
  },
  {
    quote: 'The marketplace saved us weeks. Forked a research agent and had it customized same day.',
    name: 'Marcus T.',
    role: 'Product Manager',
    initials: 'MT',
    accent: '#8b5cf6',
  },
  {
    quote: "Finally a spec format our whole team can read — not just the engineers who built it.",
    name: 'Sofia R.',
    role: 'Eng Manager',
    initials: 'SR',
    accent: '#f97316',
  },
];

export default function Testimonials() {
  const [ref, inView] = useInViewport({ threshold: 0.15 });

  return (
    <section
      className={`testimonials${inView ? ' testimonials--visible' : ''}`}
      ref={ref}
    >
      <h2 className="testimonials__heading">
        Loved by builders who aren&rsquo;t engineers (and ones who are)
      </h2>
      <div className="testimonials__grid">
        {TESTIMONIALS.map((q, i) => (
          <div
            key={q.name}
            className="testimonial-card"
            style={{ '--stagger': i }}
          >
            <p className="testimonial-card__quote">&ldquo;{q.quote}&rdquo;</p>
            <div className="testimonial-card__author">
              <div
                className="testimonial-card__avatar"
                style={{ background: q.accent }}
              >
                {q.initials}
              </div>
              <div>
                <div className="testimonial-card__name">{q.name}</div>
                <div className="testimonial-card__role">{q.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
