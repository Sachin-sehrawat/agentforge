import React from 'react';
import { AGENT_ICON } from '../../toolMeta.jsx';

const FEATURES = [
  { heading: 'Visual Builder', desc: 'Assemble agent, tool, and persona nodes on a canvas.' },
  { heading: 'Marketplace', desc: 'Browse and fork agents published by the community.' },
  { heading: 'Skills & Personas', desc: 'Attach reusable skills and curated personas to any agent.' },
  { heading: 'Markdown Export', desc: 'Download a portable, provider-agnostic agent spec.' },
];

// Standalone landing page shown to mobile visitors — a condensed variant of
// the desktop LandingPage with its own compact header instead of the full Topbar.
export default function MobileLandingPage({ onOpenAuth, onBrowseMarketplace }) {
  return (
    <main className="mobile-landing">
      <header className="mobile-landing-header">
        <div className="mobile-landing-brand">
          <span className="brand-mark"><AGENT_ICON /></span>
          AgentForge
        </div>
        <button className="btn subtle mobile-landing-signin" onClick={() => onOpenAuth('login')}>
          Sign in
        </button>
      </header>

      <section className="mobile-landing-hero">
        <div className="mobile-landing-pill">● provider-agnostic agent specs</div>
        <h1 className="mobile-landing-headline">
          Design AI agents visually. Export a spec anyone can run.
        </h1>
        <p className="mobile-landing-sub">
          Build agents from reusable tools, skills, and personas — then
          download a portable Markdown spec.
        </p>
        <div className="mobile-landing-ctas">
          <button className="btn primary mobile-landing-cta" onClick={() => onOpenAuth('signup')}>
            Start building free
          </button>
          <button className="btn subtle mobile-landing-cta" onClick={onBrowseMarketplace}>
            Browse Marketplace
          </button>
        </div>
      </section>

      <section className="mobile-landing-features">
        {FEATURES.map((f) => (
          <div className="mobile-landing-feature" key={f.heading}>
            <h3 className="mobile-landing-feature-heading">{f.heading}</h3>
            <p className="mobile-landing-feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="mobile-landing-footer">
        <button className="btn primary mobile-landing-cta" onClick={() => onOpenAuth('signup')}>
          Get started
        </button>
        <p className="mobile-landing-footer-note">
          Already have an account?{' '}
          <button className="mobile-landing-link" onClick={() => onOpenAuth('login')}>Sign in</button>
        </p>
      </footer>
    </main>
  );
}
