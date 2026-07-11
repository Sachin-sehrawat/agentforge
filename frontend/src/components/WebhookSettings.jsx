import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const ALL_EVENTS = ['agent.subscribed', 'agent.shared', 'agent.forked'];

// ── Tiny copy-to-clipboard helper ───────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button type="button" className="btn subtle wh-copy-btn" onClick={handleCopy} title="Copy to clipboard">
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ── Secret one-time reveal banner ───────────────────────────────────────────
function SecretBanner({ secret, onDismiss }) {
  return (
    <div className="wh-secret-banner">
      <div className="wh-secret-banner-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <strong>Save this signing secret — it won&rsquo;t be shown again.</strong>
      </div>
      <div className="wh-secret-row">
        <code className="wh-secret-code">{secret}</code>
        <CopyButton text={secret} />
      </div>
      <button type="button" className="btn subtle wh-secret-dismiss" onClick={onDismiss}>
        I&rsquo;ve saved it
      </button>
    </div>
  );
}

// ── Delivery log for one webhook ─────────────────────────────────────────────
function DeliveryLog({ webhookId }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWebhookDeliveries(webhookId, { page: p, limit: 10 });
      setDeliveries((prev) => p === 1 ? data.items : [...prev, ...data.items]);
      setHasMore(data.hasMore);
      setPage(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookId]);

  useEffect(() => {
    load(1);
  }, [load]);

  if (loading && page === 1) return <p className="wh-log-empty">Loading…</p>;
  if (error) return <p className="wh-log-empty wh-log-error">{error}</p>;
  if (deliveries.length === 0) return <p className="wh-log-empty">No delivery attempts yet.</p>;

  return (
    <div className="wh-log">
      <table className="wh-log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Status</th>
            <th>Attempt</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td className="wh-log-time">{new Date(d.createdAt).toLocaleString()}</td>
              <td><code className="wh-log-event">{d.event}</code></td>
              <td>
                {d.statusCode ? (
                  <span className={`wh-log-status ${d.statusCode >= 200 && d.statusCode < 300 ? 'ok' : 'fail'}`}>
                    {d.statusCode}
                  </span>
                ) : (
                  <span className="wh-log-status fail">—</span>
                )}
              </td>
              <td>{d.attempt}</td>
              <td className="wh-log-err">{d.error || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button
          type="button"
          className="btn subtle wh-load-more"
          onClick={() => load(page + 1)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

// ── Single webhook card ──────────────────────────────────────────────────────
function WebhookCard({ webhook, onUpdate, onDelete }) {
  const [logOpen, setLogOpen] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  async function handleToggle() {
    setToggling(true);
    try {
      const updated = await api.updateWebhook(webhook.id, { active: !webhook.active });
      onUpdate(updated);
    } finally {
      setToggling(false);
    }
  }

  async function handleRotate() {
    if (!window.confirm('Generate a new signing secret? Your old secret will stop working immediately.')) return;
    setRotating(true);
    try {
      const updated = await api.rotateWebhookSecret(webhook.id);
      setRotatedSecret(updated.secret);
      onUpdate({ ...webhook, active: updated.active });
    } finally {
      setRotating(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      await api.sendWebhookTest(webhook.id);
      setTestMsg({ ok: true, text: 'Test event queued — check your delivery log in a moment.' });
      // Refresh log if open
      if (logOpen) setLogOpen(false);
      setTimeout(() => { if (logOpen) setLogOpen(true); }, 300);
    } catch (err) {
      setTestMsg({ ok: false, text: err.message });
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(null), 6000);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this webhook? This cannot be undone.')) return;
    await onDelete(webhook.id);
  }

  return (
    <div className={`wh-card${webhook.active ? '' : ' wh-card--inactive'}`}>
      <div className="wh-card-header">
        <div className="wh-card-meta">
          <span className="wh-card-url" title={webhook.url}>{webhook.url}</span>
          <div className="wh-card-events">
            {webhook.events.map((ev) => (
              <span key={ev} className="wh-event-chip">{ev}</span>
            ))}
          </div>
          <span className="wh-card-secret">Secret: <code>{webhook.secret}</code></span>
        </div>
        <div className="wh-card-actions">
          <label className="wh-toggle" title={webhook.active ? 'Disable webhook' : 'Enable webhook'}>
            <input
              type="checkbox"
              checked={webhook.active}
              onChange={handleToggle}
              disabled={toggling}
            />
            <span className="wh-toggle-track" />
            <span className="wh-toggle-label">{webhook.active ? 'Active' : 'Inactive'}</span>
          </label>
          <button
            type="button"
            className="btn subtle"
            onClick={handleRotate}
            disabled={rotating}
            title="Generate a new signing secret"
          >
            {rotating ? 'Rotating…' : 'Rotate secret'}
          </button>
          <button
            type="button"
            className="btn subtle"
            onClick={handleTest}
            disabled={testing || !webhook.active}
            title={webhook.active ? 'Send a test agent.subscribed event' : 'Enable the webhook to send a test'}
          >
            {testing ? 'Sending…' : 'Test'}
          </button>
          <button
            type="button"
            className="btn subtle wh-danger-btn"
            onClick={handleDelete}
            title="Delete webhook"
          >
            Delete
          </button>
        </div>
      </div>

      {rotatedSecret && (
        <SecretBanner secret={rotatedSecret} onDismiss={() => setRotatedSecret(null)} />
      )}

      {testMsg && (
        <div className={`wh-test-msg ${testMsg.ok ? 'wh-test-msg--ok' : 'wh-test-msg--err'}`}>
          {testMsg.text}
        </div>
      )}

      <button
        type="button"
        className="wh-log-toggle"
        onClick={() => setLogOpen((v) => !v)}
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: logOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Delivery log
      </button>

      {logOpen && <DeliveryLog webhookId={webhook.id} />}
    </div>
  );
}

// ── Register form ────────────────────────────────────────────────────────────
function RegisterForm({ onCreated }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState({ 'agent.subscribed': true, 'agent.shared': false, 'agent.forked': false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function toggleEvent(ev) {
    setEvents((prev) => ({ ...prev, [ev]: !prev[ev] }));
  }

  const selectedEvents = ALL_EVENTS.filter((ev) => events[ev]);
  const isValid = url.trim().length > 0 && selectedEvents.length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const webhook = await api.createWebhook({ url: url.trim(), events: selectedEvents });
      setUrl('');
      setEvents({ 'agent.subscribed': true, 'agent.shared': false, 'agent.forked': false });
      onCreated(webhook);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="wh-register-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label className="field-label">Endpoint URL *</label>
        <input
          className="field-input"
          type="url"
          placeholder="https://example.com/webhooks/agentforge"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label">Events *</label>
        <div className="wh-event-checks">
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className="wh-check-label">
              <input
                type="checkbox"
                checked={events[ev]}
                onChange={() => toggleEvent(ev)}
              />
              <code>{ev}</code>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="wh-form-error">{error}</p>}
      <div className="wh-form-footer">
        <button
          type="submit"
          className="btn primary"
          disabled={!isValid || saving}
        >
          {saving ? 'Creating…' : 'Create webhook'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function WebhookSettings({ isAuthenticated, onOpenAuth, onNavigate }) {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newSecret, setNewSecret] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    api.listWebhooks()
      .then(setWebhooks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  function handleCreated(webhook) {
    // Secret is present on creation only; keep it in state to display the banner.
    setNewSecret(webhook.secret);
    setWebhooks((prev) => [{ ...webhook, secret: 'sk_***...' }, ...prev]);
  }

  function handleUpdate(updated) {
    setWebhooks((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
  }

  async function handleDelete(id) {
    await api.deleteWebhook(id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  if (!isAuthenticated) {
    return (
      <div className="wh-page">
        <div className="wh-auth-prompt">
          <p>Sign in to manage webhooks.</p>
          <button className="btn primary" onClick={() => onOpenAuth('login')}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <div>
          <h1 className="wh-page-title">Webhooks</h1>
          <p className="wh-page-desc">
            Receive real-time HTTP POST notifications when events happen on your agents.{' '}
            <button className="wh-docs-link" onClick={() => onNavigate && onNavigate('docs/webhook-signatures')}>
              Signature verification guide →
            </button>
          </p>
        </div>
      </div>

      <section className="wh-section">
        <h2 className="wh-section-title">Register a new webhook</h2>
        <RegisterForm onCreated={handleCreated} />
        {newSecret && (
          <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
        )}
      </section>

      <section className="wh-section">
        <h2 className="wh-section-title">Your webhooks</h2>
        {loading && <p className="wh-log-empty">Loading…</p>}
        {error && <p className="wh-log-empty wh-log-error">{error}</p>}
        {!loading && webhooks.length === 0 && (
          <p className="wh-log-empty">No webhooks registered yet.</p>
        )}
        {webhooks.map((wh) => (
          <WebhookCard
            key={wh.id}
            webhook={wh}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </section>
    </div>
  );
}
