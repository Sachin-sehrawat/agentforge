import React from 'react';

export default function LandingFooter({ onGetStarted, onBrowseMarketplace }) {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__columns">
          <div className="landing-footer__brand-col">
            <div className="landing-footer__brand">
              <div className="landing-footer__brand-mark" />
              <span className="landing-footer__brand-name">AgentForge</span>
            </div>
            <p className="landing-footer__brand-desc">
              Design AI agents visually. Export provider-agnostic specs.
            </p>
          </div>

          <div className="landing-footer__link-col">
            <div className="landing-footer__col-heading">Product</div>
            <button className="landing-footer__link" onClick={onGetStarted}>Builder</button>
            <button className="landing-footer__link" onClick={onGetStarted}>Templates</button>
            <button className="landing-footer__link" onClick={onBrowseMarketplace}>Marketplace</button>
          </div>

          <div className="landing-footer__link-col">
            <div className="landing-footer__col-heading">Resources</div>
            <a href="#" className="landing-footer__link">Docs</a>
            <a href="#" className="landing-footer__link">Skills library</a>
            <a href="#" className="landing-footer__link">Changelog</a>
          </div>

          <div className="landing-footer__link-col">
            <div className="landing-footer__col-heading">Company</div>
            <a href="#" className="landing-footer__link">About</a>
            <a href="#" className="landing-footer__link">Contact</a>
          </div>
        </div>

        <div className="landing-footer__bottom">
          &copy; 2026 AgentForge. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
