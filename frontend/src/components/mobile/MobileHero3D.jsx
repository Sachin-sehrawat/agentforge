import React from 'react';

// Lightweight CSS-3D hero visual for the mobile landing page — a small cluster
// of "node" cards (agent / tool / persona) floating in perspective space with
// animated connecting links. Pure CSS transforms, no WebGL/Three.js dependency.
export default function MobileHero3D() {
  return (
    <div className="m-hero3d" aria-hidden="true">
      <div className="m-hero3d-orb m-hero3d-orb--a" />
      <div className="m-hero3d-orb m-hero3d-orb--b" />

      <div className="m-hero3d-stage">
        <div className="m-hero3d-group">
          <svg className="m-hero3d-links" viewBox="0 0 300 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="m-hero3d-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <path className="m-hero3d-link" d="M95 108 C150 108 150 44 210 44" />
            <path className="m-hero3d-link" d="M95 108 C150 108 150 160 205 160" />
          </svg>

          <div className="m-hero3d-node-wrap m-hero3d-node-wrap--agent">
            <div className="m-hero3d-node m-hero3d-node--agent">
              <span className="m-hero3d-node-icon m-hero3d-node-icon--agent">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              Research Agent
            </div>
          </div>

          <div className="m-hero3d-node-wrap m-hero3d-node-wrap--tool">
            <div className="m-hero3d-node m-hero3d-node--tool">
              <span className="m-hero3d-node-icon m-hero3d-node-icon--tool">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              Web Search
            </div>
          </div>

          <div className="m-hero3d-node-wrap m-hero3d-node-wrap--persona">
            <div className="m-hero3d-node m-hero3d-node--persona">
              <span className="m-hero3d-node-icon m-hero3d-node-icon--persona">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </span>
              Persona
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
