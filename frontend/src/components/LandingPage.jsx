import React from 'react';
import Hero from './landing/Hero.jsx';
import MarketplaceStrip from './landing/MarketplaceStrip.jsx';
import FeatureGrid from './landing/FeatureGrid.jsx';

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
      <section className="landing-stats" />

      {/* How it works */}
      <section className="landing-how-it-works" />

      {/* Final CTA */}
      <section className="landing-cta" />
    </main>
  );
}
