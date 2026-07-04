import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { TOOL_META } from '../toolMeta.jsx';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'popular', label: 'Most Favorited' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'most_forked', label: 'Most Forked' },
];

const ALL_TOOL_IDS = Object.keys(TOOL_META);

// Star rating display — read-only or interactive
function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const active = hover || value || 0;

  if (readonly) {
    if (!value) return <span className="mp-rating-empty">No ratings</span>;
    return (
      <span className="mp-stars readonly" title={`${Number(value).toFixed(1)} / 5`}>
        {stars.map((s) => (
          <span key={s} className={`mp-star${s <= Math.round(value) ? ' filled' : ''}`}>★</span>
        ))}
        <span className="mp-rating-val">{Number(value).toFixed(1)}</span>
      </span>
    );
  }

  return (
    <span
      className="mp-stars interactive"
      onMouseLeave={() => setHover(0)}
    >
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          className={`mp-star btn-reset${s <= active ? ' filled' : ''}`}
          onMouseEnter={() => setHover(s)}
          onClick={() => onChange?.(s)}
          title={`Rate ${s} star${s !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function MarketplaceCard({ agent, categoriesMap = {}, isAuthenticated, onView, onSubscribe, onFavorite, onFork, onRate, onOpenAuth }) {
  const [localAgent, setLocalAgent] = useState(agent);
  const [busySubscribe, setBusySubscribe] = useState(false);
  const [busyFavorite, setBusyFavorite] = useState(false);
  const [busyFork, setBusyFork] = useState(false);

  // Sync when parent refreshes
  useEffect(() => {
    setLocalAgent(agent);
  }, [agent]);

  const toolCount = (localAgent.tools || []).length;
  const isOwn = Boolean(localAgent.isOwner);

  async function handleSubscribe() {
    if (!isAuthenticated) { onOpenAuth('login'); return; }
    const wasSubscribed = localAgent.isSubscribed;
    setLocalAgent((p) => ({ ...p, isSubscribed: !wasSubscribed }));
    setBusySubscribe(true);
    try {
      await onSubscribe(localAgent, !wasSubscribed);
    } catch {
      setLocalAgent((p) => ({ ...p, isSubscribed: wasSubscribed }));
    } finally {
      setBusySubscribe(false);
    }
  }

  async function handleFavorite() {
    if (!isAuthenticated) { onOpenAuth('login'); return; }
    const wasFav = localAgent.isFavorited;
    const delta = wasFav ? -1 : 1;
    setLocalAgent((p) => ({
      ...p,
      isFavorited: !wasFav,
      favoriteCount: (p.favoriteCount || 0) + delta,
    }));
    setBusyFavorite(true);
    try {
      await onFavorite(localAgent.id, !wasFav);
    } catch {
      setLocalAgent((p) => ({
        ...p,
        isFavorited: wasFav,
        favoriteCount: (p.favoriteCount || 0) - delta,
      }));
    } finally {
      setBusyFavorite(false);
    }
  }

  async function handleFork() {
    if (!isAuthenticated) { onOpenAuth('login'); return; }
    setBusyFork(true);
    try {
      const forked = await onFork(localAgent.id);
      setLocalAgent((p) => ({ ...p, forkCount: (p.forkCount || 0) + 1 }));
      return forked;
    } catch {
      // silent
    } finally {
      setBusyFork(false);
    }
  }

  async function handleRate(rating) {
    if (!isAuthenticated) { onOpenAuth('login'); return; }
    try {
      const result = await onRate(localAgent.id, rating);
      if (result?.avgRating != null) {
        setLocalAgent((p) => ({
          ...p,
          avgRating: result.avgRating,
          ratingCount: result.ratingCount ?? p.ratingCount,
          myRating: rating,
        }));
      } else {
        setLocalAgent((p) => ({ ...p, myRating: rating }));
      }
    } catch {
      // silent
    }
  }

  return (
    <div className="agent-card mp-card">
      <div className="agent-card-body">
        <div className="mp-card-header">
          <div className="agent-card-name">{localAgent.name || 'Untitled'}</div>
          {localAgent.ownerDisplayName && (
            <span className="mp-owner">by {localAgent.ownerDisplayName}</span>
          )}
        </div>

        {localAgent.persona && (
          <div className="agent-card-persona">{localAgent.persona}</div>
        )}

        {localAgent.categoryId && categoriesMap[localAgent.categoryId] && (
          <span
            className="agent-card-stat"
            style={{ '--stat-color': categoriesMap[localAgent.categoryId].color || '#64748b' }}
          >
            {categoriesMap[localAgent.categoryId].label}
          </span>
        )}

        <div className="mp-card-meta">
          <StarRating value={localAgent.avgRating} readonly />
          {localAgent.ratingCount > 0 && (
            <span className="mp-meta-count">({localAgent.ratingCount})</span>
          )}
          {localAgent.forkCount > 0 && (
            <span className="mp-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/>
                <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/>
                <line x1="12" y1="12" x2="12" y2="15"/>
              </svg>
              {localAgent.forkCount}
            </span>
          )}
          {localAgent.favoriteCount > 0 && (
            <span className="mp-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill={localAgent.isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {localAgent.favoriteCount}
            </span>
          )}
        </div>

        {toolCount > 0 && (
          <div className="agent-card-tools">
            {localAgent.tools.slice(0, 5).map((id) => {
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
            {localAgent.tools.length > 5 && (
              <span className="agent-card-tool-chip more">+{localAgent.tools.length - 5}</span>
            )}
          </div>
        )}

        {!isOwn && isAuthenticated && (
          <div className="mp-card-rate">
            <span className="mp-rate-label">Your rating:</span>
            <StarRating
              value={localAgent.myRating || 0}
              onChange={handleRate}
            />
          </div>
        )}
      </div>

      <div className="agent-card-footer">
        <div className="agent-card-actions">
          <button className="btn primary" onClick={() => onView(localAgent.id)}>
            View
          </button>
          {!isOwn && (
            <button
              className="btn subtle"
              onClick={handleSubscribe}
              disabled={busySubscribe}
              title={localAgent.isSubscribed ? 'Remove from My Agents' : 'Add to My Agents'}
            >
              {localAgent.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            </button>
          )}
          {!isOwn && (
            <button
              className={`btn subtle mp-btn-fav${localAgent.isFavorited ? ' active' : ''}`}
              onClick={handleFavorite}
              disabled={busyFavorite}
              title={localAgent.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {localAgent.isFavorited ? '♥' : '♡'}
            </button>
          )}
          {!isOwn && (
            <button
              className="btn subtle"
              onClick={handleFork}
              disabled={busyFork}
              title="Fork this agent"
            >
              Fork
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketplacePage({
  isAuthenticated,
  onView,
  onFork,
  onOpenAuth,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [minRating, setMinRating] = useState(0);
  const [selectedTools, setSelectedTools] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const toolPickerRef = useRef(null);

  const searchTimerRef = useRef(null);
  const categoriesMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Fetch categories once on mount
  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => {});
  }, []);

  // Debounce search input 350ms
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Close tool picker on outside click
  useEffect(() => {
    if (!toolPickerOpen) return;
    const handler = (e) => {
      if (toolPickerRef.current && !toolPickerRef.current.contains(e.target)) {
        setToolPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [toolPickerOpen]);

  const fetchPage = useCallback(async (pg, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listMarketplace({
        q: debouncedSearch,
        sort,
        minRating,
        tools: selectedTools,
        categoryId: selectedCategoryId || undefined,
        page: pg,
        pageSize: 20,
      });
      setItems((prev) => append ? [...prev, ...result.items] : result.items);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setPage(pg);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sort, minRating, selectedTools, selectedCategoryId]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  function handleLoadMore() {
    fetchPage(page + 1, true);
  }

  async function handleSubscribe(agent, subscribing) {
    if (subscribing) {
      await api.subscribeAgent(agent.id);
      setItems((prev) => prev.map((a) => a.id === agent.id ? { ...a, isSubscribed: true } : a));
    } else {
      await api.unsubscribeAgent(agent.id);
      setItems((prev) => prev.map((a) => a.id === agent.id ? { ...a, isSubscribed: false } : a));
    }
  }

  async function handleFavorite(id, favoriting) {
    if (favoriting) {
      await api.favoriteAgent(id);
    } else {
      await api.unfavoriteAgent(id);
    }
    api.bustMarketplaceCache();
  }

  async function handleFork(id) {
    return onFork?.(id);
  }

  async function handleRate(id, rating) {
    const result = await api.rateAgent(id, rating);
    api.bustMarketplaceCache();
    return result;
  }

  function toggleTool(toolId) {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }

  const activeToolLabels = selectedTools
    .map((id) => TOOL_META[id]?.label || id)
    .join(', ');

  return (
    <div className="agents-page mp-page">
      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">Marketplace</h1>
          <p className="agents-page-sub">
            {total > 0
              ? `${total} public agent${total !== 1 ? 's' : ''}`
              : loading
              ? 'Loading…'
              : 'Discover and subscribe to agents built by the community.'}
          </p>
        </div>
        <div className="agents-page-header-actions">
          <div className="filter-wrap filter-wrap--header">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="filter-input"
              type="text"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="filter-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mp-filters">
        <div className="mp-filter-group">
          <label className="mp-filter-label">Sort</label>
          <select
            className="mp-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="mp-filter-group" ref={toolPickerRef}>
          <label className="mp-filter-label">Tools</label>
          <button
            type="button"
            className={`mp-select mp-tool-btn${selectedTools.length ? ' has-value' : ''}`}
            onClick={() => setToolPickerOpen((v) => !v)}
          >
            {selectedTools.length ? activeToolLabels : 'Any tools'}
            <svg className="mp-select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {toolPickerOpen && (
            <div className="mp-tool-picker">
              <div className="mp-tool-picker-header">
                <span>Filter by tool</span>
                {selectedTools.length > 0 && (
                  <button className="mp-clear-link" onClick={() => setSelectedTools([])}>Clear</button>
                )}
              </div>
              <div className="mp-tool-picker-list">
                {ALL_TOOL_IDS.map((id) => {
                  const meta = TOOL_META[id];
                  return (
                    <label key={id} className="mp-tool-option">
                      <input
                        type="checkbox"
                        checked={selectedTools.includes(id)}
                        onChange={() => toggleTool(id)}
                      />
                      <span
                        className="mp-tool-swatch"
                        style={{ background: meta?.color || '#999' }}
                      />
                      {meta?.label || id}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <div className="mp-filter-group">
            <label className="mp-filter-label">Category</label>
            <select
              className="mp-select"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="">Any category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mp-filter-group mp-rating-filter">
          <label className="mp-filter-label">
            Min rating
            {minRating > 0 && <span className="mp-rating-badge">{minRating}+★</span>}
          </label>
          <input
            type="range"
            className="mp-slider"
            min="0"
            max="5"
            step="0.5"
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
          />
        </div>

        {(debouncedSearch || selectedTools.length > 0 || minRating > 0 || sort !== 'recent' || selectedCategoryId) && (
          <button
            className="mp-clear-filters"
            onClick={() => {
              setSearch('');
              setDebouncedSearch('');
              setSelectedTools([]);
              setMinRating(0);
              setSort('recent');
              setSelectedCategoryId('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      {error && <p className="agents-error">Failed to load: {error}</p>}

      {!error && !loading && items.length === 0 && (
        <div className="agents-empty">
          <div className="agents-empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="22" cy="22" r="14" />
              <line x1="32" y1="32" x2="42" y2="42" />
            </svg>
          </div>
          <p className="agents-empty-text">No agents match your filters.</p>
          <button className="btn subtle" onClick={() => {
            setSearch('');
            setDebouncedSearch('');
            setSelectedTools([]);
            setMinRating(0);
            setSort('recent');
            setSelectedCategoryId('');
          }}>
            Clear filters
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="agents-grid">
          {items.map((agent) => (
            <MarketplaceCard
              key={agent.id}
              agent={agent}
              categoriesMap={categoriesMap}
              isAuthenticated={isAuthenticated}
              onView={onView}
              onSubscribe={handleSubscribe}
              onFavorite={handleFavorite}
              onFork={handleFork}
              onRate={handleRate}
              onOpenAuth={onOpenAuth}
            />
          ))}
        </div>
      )}

      {loading && (
        <div className="agents-loading" style={{ marginTop: items.length ? 24 : 0 }}>
          Loading…
        </div>
      )}

      {hasMore && !loading && (
        <div className="mp-load-more">
          <button className="btn subtle" onClick={handleLoadMore}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
