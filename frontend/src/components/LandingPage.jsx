import React from 'react';

export default function LandingPage({ onGetStarted, onOpenAuth }) {
  return (
    <main className="landing-page">
      {/* Hero */}
      <section className="landing-hero" />

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
