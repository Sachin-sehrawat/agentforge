import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function groupByDay(events) {
  const groups = [];
  const buckets = {};
  for (const ev of events) {
    const key = new Date(ev.createdAt).toDateString();
    if (!buckets[key]) {
      buckets[key] = [];
      groups.push({ key, dateStr: ev.createdAt, events: buckets[key] });
    }
    buckets[key].push(ev);
  }
  return groups;
}

const EVENT_CONFIG = {
  subscribe:   { label: 'Subscribed',      color: '#6366f1' },
  unsubscribe: { label: 'Unsubscribed',    color: '#9ca3af' },
  favorite:    { label: 'Favorited',       color: '#f59e0b' },
  unfavorite:  { label: 'Unfavorited',     color: '#9ca3af' },
  fork:        { label: 'Forked',          color: '#8b5cf6' },
  export:      { label: 'Exported',        color: '#10b981' },
  rate:        { label: 'Rated',           color: '#f59e0b' },
};

function eventLabel(ev) {
  if (ev.type === 'rate' && ev.meta?.rating != null) return `Rated ${ev.meta.rating}/5`;
  return EVENT_CONFIG[ev.type]?.label ?? ev.type;
}

function eventColor(type) {
  return EVENT_CONFIG[type]?.color ?? '#9ca3af';
}

function EventIcon({ type }) {
  switch (type) {
    case 'subscribe':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case 'unsubscribe':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case 'favorite':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case 'unfavorite':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case 'fork':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
          <line x1="12" y1="12" x2="12" y2="15" />
        </svg>
      );
    case 'rate':
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'export':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
  }
}

function StarRating({ avg }) {
  if (avg === null) return <span className="analytics-no-rating">—</span>;
  const rounded = Math.round(avg * 2) / 2;
  return (
    <span className="analytics-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: rounded >= i - 0.5 ? '#f59e0b' : '#e5e7eb' }}>★</span>
      ))}
      <span className="analytics-stars-num">{avg.toFixed(1)}</span>
    </span>
  );
}

function MetricCard({ label, children }) {
  return (
    <div className="analytics-card">
      <div className="analytics-card-label">{label}</div>
      <div className="analytics-card-value">{children}</div>
    </div>
  );
}

export default function AgentAnalytics({ agentId, agentName, onBack }) {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoadingInit(true);
    setError(null);
    setSummary(null);
    setEvents([]);
    setTotal(0);
    setPage(1);

    Promise.all([
      api.getAgentAnalytics(agentId),
      api.getAgentTimeline(agentId, { limit: 20 }),
    ])
      .then(([summaryData, timelineData]) => {
        setSummary(summaryData);
        setEvents(timelineData.events);
        setTotal(timelineData.total);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingInit(false));
  }, [agentId]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await api.getAgentTimeline(agentId, { page: nextPage, limit: 20 });
      setEvents((prev) => [...prev, ...data.events]);
      setPage(nextPage);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = events.length < total;
  const dayGroups = groupByDay(events);

  if (loadingInit) {
    return (
      <div className="agent-analytics">
        <div className="analytics-loading">Loading analytics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agent-analytics">
        <button className="btn subtle analytics-back" onClick={onBack}>← My Agents</button>
        <p className="agents-error" style={{ marginTop: 24 }}>Failed to load analytics: {error}</p>
      </div>
    );
  }

  return (
    <div className="agent-analytics">
      <button className="btn subtle analytics-back" onClick={onBack}>← My Agents</button>

      <div className="agents-page-header">
        <div>
          <h1 className="agents-page-title">{agentName || 'Untitled'}</h1>
          <p className="agents-page-sub">Analytics overview</p>
        </div>
      </div>

      <div className="analytics-cards">
        <MetricCard label="Subscribers">{summary.subscriberCount}</MetricCard>
        <MetricCard label="Favorites">{summary.favoriteCount}</MetricCard>
        <MetricCard label="Forks">{summary.forkCount}</MetricCard>
        <MetricCard label="Exports">{summary.exportCount}</MetricCard>
        <MetricCard label="Avg Rating">
          <StarRating avg={summary.avgRating} />
        </MetricCard>
        <MetricCard label="Ratings">{summary.ratingCount}</MetricCard>
      </div>

      {summary.subscribers.length > 0 && (
        <div className="analytics-section">
          <h2 className="analytics-section-title">
            Subscribers
            <span className="analytics-section-count">{summary.subscriberCount}</span>
          </h2>
          <div className="analytics-subscriber-list">
            {summary.subscribers.map((sub, i) => (
              <div key={i} className="analytics-subscriber-row">
                <span className="analytics-subscriber-name">{sub.displayName || 'Anonymous'}</span>
                <span className="analytics-subscriber-time">{timeAgo(sub.subscribedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="analytics-section">
        <h2 className="analytics-section-title">
          Activity
          {total > 0 && <span className="analytics-section-count">{total} events</span>}
        </h2>
        {events.length === 0 ? (
          <p className="analytics-empty">No activity recorded yet.</p>
        ) : (
          <div className="analytics-timeline">
            {dayGroups.map((group) => (
              <div key={group.key} className="analytics-day-group">
                <div className="analytics-day-label">{dayLabel(group.dateStr)}</div>
                {group.events.map((ev) => (
                  <div key={ev.id} className="analytics-event-row">
                    <div className="analytics-event-icon" style={{ color: eventColor(ev.type) }}>
                      <EventIcon type={ev.type} />
                    </div>
                    <div className="analytics-event-desc">
                      <span className="analytics-event-label">{eventLabel(ev)}</span>
                      {ev.actorDisplayName && (
                        <span className="analytics-event-actor"> by {ev.actorDisplayName}</span>
                      )}
                    </div>
                    <span className="analytics-event-time">{formatTime(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            ))}
            {hasMore && (
              <button
                className="btn subtle analytics-load-more"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - events.length} remaining)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
