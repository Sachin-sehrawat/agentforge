import React from 'react';
import Hero from './landing/Hero.jsx';
import MarketplaceStrip from './landing/MarketplaceStrip.jsx';
import StatsBar from './landing/StatsBar.jsx';
import FeatureGrid from './landing/FeatureGrid.jsx';
import FinalCta from './landing/FinalCta.jsx';

export default function LandingPage({ onGetStarted, onOpenAuth, onBrowseMarketplace, isAuthenticated, onFork }) {
  return (
    <main className="landing-page">
      <Hero
        onStartBuilding={onGetStarted}
        onBrowseMarketplace={onBrowseMarketplace}
      />

      {/* Marketplace preview */}
      <section className="landing-marketplace">
        <MarketplaceStrip
          isAuthenticated={isAuthenticated}
          onFork={onFork}
          onOpenAuth={onOpenAuth}
          onSwitchToMarketplace={onBrowseMarketplace}
        />
      </section>

      {/* Features */}
      <section className="landing-features">
        <FeatureGrid />
      </section>

      {/* Stats */}
      <section className="landing-stats">
        <StatsBar />
      </section>

      {/* How it works */}
      <section className="landing-how-it-works" />

      {/* Final CTA */}
      <section className="landing-cta">
        <FinalCta
          isAuthenticated={isAuthenticated}
          onGetStarted={onGetStarted}
          onOpenAuth={onOpenAuth}
        />
      </section>
    </main>
  );
}
