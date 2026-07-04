import React from 'react';
import Hero from './landing/Hero.jsx';

export default function LandingPage({ onGetStarted, onOpenAuth, onBrowseMarketplace }) {
  return (
    <main className="landing-page">
      <Hero
        onStartBuilding={onGetStarted}
        onBrowseMarketplace={onBrowseMarketplace}
      />

      {/* Marketplace preview */}
      <section className="landing-marketplace" />

      {/* Features */}
      <section className="landing-features" />

      {/* Stats */}
      <section className="landing-stats" />

      {/* How it works */}
      <section className="landing-how-it-works" />

      {/* Final CTA */}
      <section className="landing-cta" />
    </main>
  );
}
