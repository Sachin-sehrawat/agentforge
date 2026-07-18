import React, { useEffect, useState } from 'react';

function formatCount(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString();
}

export default function MarketplaceBand({ onBrowseMarketplace }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStats)
      .catch(() => {});
  }, []);

  const agentsPublished = stats ? formatCount(stats.agentsPublished) : '—';
  const forksThisMonth  = stats ? formatCount(stats.forksThisMonth)  : '—';

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
            <span className="marketplace-band__stat-value">{agentsPublished}</span>
            <span className="marketplace-band__stat-label">agents published</span>
          </div>
          <div className="marketplace-band__stat-divider" />
          <div className="marketplace-band__stat">
            <span className="marketplace-band__stat-value">{forksThisMonth}</span>
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
