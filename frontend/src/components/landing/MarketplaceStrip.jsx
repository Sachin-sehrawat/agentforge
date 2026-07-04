import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { TOOL_META } from '../../toolMeta.jsx';

function StripStarRating({ value }) {
  if (!value) return <span className="mp-rating-empty">No ratings</span>;
  return (
    <span className="mp-stars readonly" title={`${Number(value).toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`mp-star${s <= Math.round(value) ? ' filled' : ''}`}>★</span>
      ))}
      <span className="mp-rating-val">{Number(value).toFixed(1)}</span>
    </span>
  );
}

function StripCard({ agent, isAuthenticated, onFork, onOpenAuth }) {
  const [busyFork, setBusyFork] = useState(false);
  const [forkCount, setForkCount] = useState(agent.forkCount || 0);

  async function handleFork() {
    if (!isAuthenticated) { onOpenAuth?.('login'); return; }
    setBusyFork(true);
    try {
      await onFork?.(agent.id);
      setForkCount((n) => n + 1);
    } catch {
      // silent
    } finally {
      setBusyFork(false);
    }
  }

  const tools = agent.tools || [];

  return (
    <div className="marketplace-strip__card">
      <div className="marketplace-strip__card-body">
        <div className="marketplace-strip__card-name">{agent.name || 'Untitled'}</div>
        {agent.persona && (
          <div className="marketplace-strip__card-persona">{agent.persona}</div>
        )}
        <div className="marketplace-strip__card-meta">
          <StripStarRating value={agent.avgRating} />
          {forkCount > 0 && (
            <span className="mp-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
                <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>
                <line x1="12" y1="12" x2="12" y2="15"/>
              </svg>
              {forkCount}
            </span>
          )}
        </div>
        {tools.length > 0 && (
          <div className="agent-card-tools">
            {tools.slice(0, 4).map((id) => {
              const meta = TOOL_META[id];
              return (
                <span
                  key={id}
                  className="agent-card-tool-chip"
                  style={{ '--tool-color': meta ? meta.color : '#999' }}
                  title={meta ? meta.blurb : id}
                >
                  {meta ? meta.label : id}
                </span>
              );
            })}
            {tools.length > 4 && (
              <span className="agent-card-tool-chip more">+{tools.length - 4}</span>
            )}
          </div>
        )}
      </div>
      <div className="marketplace-strip__card-footer">
        <button
          className="btn subtle marketplace-strip__fork-btn"
          onClick={handleFork}
          disabled={busyFork}
          title="Fork this agent"
        >
          Fork
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="marketplace-strip__skeleton">
      <div className="marketplace-strip__skeleton-line marketplace-strip__skeleton-line--title" />
      <div className="marketplace-strip__skeleton-line marketplace-strip__skeleton-line--sub" />
      <div className="marketplace-strip__skeleton-line marketplace-strip__skeleton-line--sub" />
      <div className="marketplace-strip__skeleton-chips">
        <div className="marketplace-strip__skeleton-chip" />
        <div className="marketplace-strip__skeleton-chip" />
      </div>
    </div>
  );
}

export default function MarketplaceStrip({ isAuthenticated, onFork, onOpenAuth, onSwitchToMarketplace }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const carouselRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.listMarketplace({ sort: 'top_rated', pageSize: 6 })
      .then((result) => {
        if (!cancelled) {
          setAgents(result.items?.slice(0, 6) ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Horizontal scroll via mouse wheel
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    function onWheel(e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (failed) return null;
  if (!loading && agents.length === 0) return null;

  return (
    <section className="marketplace-strip">
      <div className="marketplace-strip__header">
        <h2 className="marketplace-strip__title">Featured Agents</h2>
        <button
          className="marketplace-strip__view-all"
          onClick={onSwitchToMarketplace}
        >
          View all agents →
        </button>
      </div>

      <div className="marketplace-strip__carousel" ref={carouselRef}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : agents.map((agent) => (
              <StripCard
                key={agent.id}
                agent={agent}
                isAuthenticated={isAuthenticated}
                onFork={onFork}
                onOpenAuth={onOpenAuth}
              />
            ))
        }
      </div>
    </section>
  );
}
