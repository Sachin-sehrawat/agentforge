import React from 'react';

export default function MarketplaceBand({ onBrowseMarketplace }) {
  return (
    <div className="marketplace-band">
      <div className="marketplace-band__inner">
        <div className="marketplace-band__eyebrow">MARKETPLACE</div>
        <h2 className="marketplace-band__heading">
          Publish, fork, and remix agents from the community
        </h2>
        <p className="marketplace-band__desc">
          Every agent you publish is instantly forkable — subscribe to the ones you rely on
          and track their version history.
        </p>
        <div className="marketplace-band__stats">
          <div className="marketplace-band__stat">
            <span className="marketplace-band__stat-value">2,400+</span>
            <span className="marketplace-band__stat-label">agents published</span>
          </div>
          <div className="marketplace-band__stat-divider" />
          <div className="marketplace-band__stat">
            <span className="marketplace-band__stat-value">18k</span>
            <span className="marketplace-band__stat-label">forks this month</span>
          </div>
        </div>
        <button className="marketplace-band__cta" onClick={onBrowseMarketplace}>
          Browse the marketplace →
        </button>
      </div>
    </div>
  );
}
