import React from 'react';
import { AGENT_ICON } from '../../toolMeta.jsx';
import MobileHero3D from './MobileHero3D.jsx';
import FeatureGrid from '../landing/FeatureGrid.jsx';
import IntegrationsSection from '../landing/IntegrationsSection.jsx';
import HowItWorks from '../landing/HowItWorks.jsx';
import StatsBar from '../landing/StatsBar.jsx';
import Testimonials from '../landing/Testimonials.jsx';
import MarketplaceBand from '../landing/MarketplaceBand.jsx';
import MarketplaceStrip from '../landing/MarketplaceStrip.jsx';

// Standalone landing page shown to mobile visitors. Reuses the desktop
// landing page's content sections (they already carry mobile-responsive
// styling) around a bespoke compact header and an animated 3D hero, so
// mobile visitors get the same depth of context as desktop without the
// builder-only calls to action.
export default function MobileLandingPage({ onOpenAuth, onBrowseMarketplace, onGetStarted, isAuthenticated, onFork, onOpenSettings }) {
  return (
    <main className="mobile-landing">
      <header className="mobile-landing-header">
        <div className="mobile-landing-brand">
          <span className="brand-mark"><AGENT_ICON /></span>
          AgentForge
        </div>
        <button
          className="btn subtle mobile-landing-signin"
          onClick={isAuthenticated ? onGetStarted : () => onOpenAuth('login')}
        >
          {isAuthenticated ? 'My agents' : 'Sign in'}
        </button>
      </header>

      <section className="mobile-landing-hero">
        <div className="mobile-landing-pill">● provider-agnostic agent specs</div>
        <h1 className="mobile-landing-headline">
          Design AI agents visually. Export a spec anyone can run.
        </h1>
        <p className="mobile-landing-sub">
          Drag agent, tool, and persona nodes onto a canvas, wire them
          together, and download a portable Markdown spec — no code, no
          lock-in, no provider lock either.
        </p>

        <MobileHero3D />

        <div className="mobile-landing-ctas">
          <button
            className="btn primary mobile-landing-cta"
            onClick={isAuthenticated ? onGetStarted : () => onOpenAuth('signup')}
          >
            {isAuthenticated ? 'Go to my agents' : 'Start building free'}
          </button>
          <button className="btn subtle mobile-landing-cta" onClick={onBrowseMarketplace}>
            Browse Marketplace
          </button>
        </div>
      </section>

      <section className="landing-section landing-section--stats mobile-landing-section">
        <StatsBar />
      </section>

      <section className="landing-section landing-section--panel mobile-landing-section">
        <FeatureGrid />
      </section>

      <section className="landing-section landing-section--bg mobile-landing-section">
        <HowItWorks />
      </section>

      <section className="landing-section landing-section--panel mobile-landing-section">
        <IntegrationsSection onOpenIntegrations={onOpenSettings} />
      </section>

      <MarketplaceBand onBrowseMarketplace={onBrowseMarketplace} />

      <section className="landing-section landing-section--panel mobile-landing-section">
        <MarketplaceStrip
          isAuthenticated={isAuthenticated}
          onFork={onFork}
          onOpenAuth={onOpenAuth}
          onSwitchToMarketplace={onBrowseMarketplace}
        />
      </section>

      <section className="landing-section landing-section--bg mobile-landing-section">
        <Testimonials />
      </section>

      <section className="mobile-landing-final-cta">
        <div className="mobile-landing-final-cta-orb" />
        <h2 className="mobile-landing-final-cta-heading">
          {isAuthenticated ? 'Pick up where you left off' : 'Ready to design your first agent?'}
        </h2>
        <p className="mobile-landing-final-cta-sub">
          {isAuthenticated
            ? 'Your agents, the marketplace, and the full skill & persona library are all in your pocket.'
            : 'Free to start. Export as many specs as you like.'}
        </p>
        <button
          className="btn primary mobile-landing-cta"
          onClick={isAuthenticated ? onGetStarted : () => onOpenAuth('signup')}
        >
          {isAuthenticated ? 'Explore agents' : 'Start building free'}
        </button>
      </section>

      <footer className="mobile-landing-footer">
        <div className="mobile-landing-footer-brand">
          <span className="brand-mark"><AGENT_ICON /></span>
          AgentForge
        </div>
        <p className="mobile-landing-footer-desc">
          Design AI agents visually. Export provider-agnostic specs.
        </p>
        <nav className="mobile-landing-footer-links">
          <button className="mobile-landing-link" onClick={onBrowseMarketplace}>Marketplace</button>
          <span className="mobile-landing-footer-dot">·</span>
          {isAuthenticated ? (
            <button className="mobile-landing-link" onClick={onGetStarted}>My agents</button>
          ) : (
            <>
              <button className="mobile-landing-link" onClick={() => onOpenAuth('signup')}>Sign up</button>
              <span className="mobile-landing-footer-dot">·</span>
              <button className="mobile-landing-link" onClick={() => onOpenAuth('login')}>Sign in</button>
            </>
          )}
        </nav>
        <p className="mobile-landing-footer-copy">&copy; 2026 AgentForge. All rights reserved.</p>
      </footer>
    </main>
  );
}
