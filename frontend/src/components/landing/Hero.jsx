import React from 'react';

export default function Hero({ onStartBuilding, onBrowseMarketplace }) {
  return (
    <section className="hero">
      <div className="hero-bg-grid" />
      <div className="hero-orb hero-orb--indigo" />
      <div className="hero-orb hero-orb--violet" />

      <div className="hero-inner">
        <div className="hero-text">
          <h1 className="hero-headline">
            Build agents.<br />
            Share them.<br />
            Fork what you love.
          </h1>
          <p className="hero-sub">
            AgentForge is a visual drag-and-drop builder for AI agents — design
            your workflow on the canvas, then publish it to the marketplace for
            others to discover and fork.
          </p>
          <div className="hero-ctas">
            <button className="hero-cta-primary" onClick={onStartBuilding}>
              Start Building →
            </button>
            <button className="hero-cta-ghost" onClick={onBrowseMarketplace}>
              Browse Marketplace
            </button>
          </div>
        </div>

        <div className="hero-canvas-mock" aria-hidden="true">
          <svg
            className="hero-mock-svg"
            viewBox="0 0 500 270"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Agent → Tool 1 */}
            <path
              d="M 205 126 C 257 126 257 61 310 61"
              stroke="var(--accent)"
              strokeWidth="2"
              fill="none"
              strokeOpacity="0.65"
            />
            {/* Agent → Tool 2 */}
            <path
              d="M 205 126 C 257 126 257 196 310 196"
              stroke="var(--accent-violet)"
              strokeWidth="2"
              fill="none"
              strokeOpacity="0.65"
            />
            {/* Port dots */}
            <circle cx="205" cy="126" r="4" fill="var(--accent)" fillOpacity="0.85" />
            <circle cx="310" cy="61"  r="4" fill="var(--accent)" fillOpacity="0.85" />
            <circle cx="310" cy="196" r="4" fill="var(--accent-violet)" fillOpacity="0.85" />
          </svg>

          {/* Agent Node */}
          <div className="hero-node-card hero-node-card--agent">
            <div className="hero-node-header">
              <div className="hero-node-icon hero-node-icon--agent">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <span className="hero-node-title">Research Agent</span>
            </div>
            <div className="hero-node-body">
              <div className="hero-node-row">
                <span className="hero-node-label">Persona</span>
                <span className="hero-node-value">Expert researcher</span>
              </div>
              <div className="hero-node-row">
                <span className="hero-node-label">Tools</span>
                <span className="hero-node-chips">
                  <span className="hero-node-chip">Web Search</span>
                  <span className="hero-node-chip">Read File</span>
                </span>
              </div>
            </div>
          </div>

          {/* Tool Node 1 — Web Search */}
          <div className="hero-node-card hero-node-card--tool hero-node-card--tool-1">
            <div className="hero-node-header">
              <div className="hero-node-icon hero-node-icon--tool1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <span className="hero-node-title">Web Search</span>
            </div>
          </div>

          {/* Tool Node 2 — Read File */}
          <div className="hero-node-card hero-node-card--tool hero-node-card--tool-2">
            <div className="hero-node-header">
              <div className="hero-node-icon hero-node-icon--tool2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <span className="hero-node-title">Read File</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
