import React from 'react';
import Hero from './landing/Hero.jsx';
import FeatureGrid from './landing/FeatureGrid.jsx';
import TemplateGallerySection from './landing/TemplateGallerySection.jsx';
import MarketplaceBand from './landing/MarketplaceBand.jsx';
import MarketplaceStrip from './landing/MarketplaceStrip.jsx';
import StatsBar from './landing/StatsBar.jsx';
import HowItWorks from './landing/HowItWorks.jsx';
import Testimonials from './landing/Testimonials.jsx';
import FinalCta from './landing/FinalCta.jsx';
import LandingFooter from './landing/LandingFooter.jsx';

export default function LandingPage({ onGetStarted, onOpenAuth, onBrowseMarketplace, isAuthenticated, onFork }) {
  return (
    <main className="landing-page">
      <Hero
        onStartBuilding={onGetStarted}
        onBrowseMarketplace={onBrowseMarketplace}
      />

      {/* Features */}
      <section className="landing-section landing-section--panel">
        <FeatureGrid />
      </section>

      {/* Template gallery */}
      <section className="landing-section landing-section--bg">
        <TemplateGallerySection onStartBuilding={onGetStarted} />
      </section>

      {/* Marketplace gradient band */}
      <MarketplaceBand onBrowseMarketplace={onBrowseMarketplace} />

      {/* Marketplace preview */}
      <section className="landing-section landing-section--panel">
        <MarketplaceStrip
          isAuthenticated={isAuthenticated}
          onFork={onFork}
          onOpenAuth={onOpenAuth}
          onSwitchToMarketplace={onBrowseMarketplace}
        />
      </section>

      {/* Stats */}
      <section className="landing-section landing-section--stats">
        <StatsBar />
      </section>

      {/* How it works */}
      <section className="landing-section landing-section--panel">
        <HowItWorks />
      </section>

      {/* Testimonials */}
      <section className="landing-section landing-section--bg">
        <Testimonials />
      </section>

      {/* Final CTA */}
      <FinalCta
        isAuthenticated={isAuthenticated}
        onGetStarted={onGetStarted}
        onOpenAuth={onOpenAuth}
      />

      {/* Footer */}
      <LandingFooter
        onGetStarted={onGetStarted}
        onBrowseMarketplace={onBrowseMarketplace}
      />
    </main>
  );
}
