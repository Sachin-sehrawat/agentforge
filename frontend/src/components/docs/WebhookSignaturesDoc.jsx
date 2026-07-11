import React, { useState, useEffect, useRef } from 'react';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className="doc-code-copy" onClick={handle} title="Copy code">
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
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}

function CodeBlock({ lang, children }) {
  return (
    <div className="doc-code-block">
      <div className="doc-code-header">
        <span className="doc-code-lang">{lang}</span>
        <CopyButton text={children.trim()} />
      </div>
      <pre className="doc-code-pre"><code>{children.trim()}</code></pre>
    </div>
  );
}

function InlineCode({ children }) {
  return <code className="doc-inline-code">{children}</code>;
}

function Section({ id, children }) {
  return <section id={id} className="doc-section">{children}</section>;
}

const NAV_ITEMS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'request-format', label: 'Request format' },
  { id: 'supported-events', label: 'Supported events' },
  { id: 'verification-examples', label: 'Verification examples' },
  { id: 'retries', label: 'Retries & auto-disabling' },
  { id: 'testing', label: 'Testing' },
  { id: 'secret-rotation', label: 'Secret rotation' },
];

export default function WebhookSignaturesDoc({ onBack }) {
  const [activeId, setActiveId] = useState('how-it-works');
  const observerRef = useRef(null);

  useEffect(() => {
    const sections = NAV_ITEMS.map(({ id }) => document.getElementById(id)).filter(Boolean);
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    sections.forEach((s) => observerRef.current.observe(s));
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="doc-page">
      {/* Top bar */}
      <div className="doc-topbar">
        <button className="doc-back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Developer settings
        </button>
        <div className="doc-topbar-title">
          <span className="doc-topbar-badge">Docs</span>
          Webhook Signature Verification
        </div>
      </div>

      <div className="doc-layout">
        {/* Sidebar */}
        <aside className="doc-sidebar">
          <div className="doc-sidebar-label">On this page</div>
          <nav className="doc-sidebar-nav">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                className={`doc-sidebar-item${activeId === id ? ' active' : ''}`}
                onClick={() => scrollTo(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="doc-main">
          <div className="doc-hero">
            <div className="doc-hero-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="doc-title">Webhook Signature Verification</h1>
              <p className="doc-lead">
                Every webhook delivery from AgentForge includes an{' '}
                <InlineCode>X-AgentForge-Signature</InlineCode> header that lets you verify the
                request came from us and was not tampered with in transit.
              </p>
            </div>
          </div>

          {/* How it works */}
          <Section id="how-it-works">
            <h2 className="doc-h2">How it works</h2>
            <div className="doc-steps">
              <div className="doc-step">
                <div className="doc-step-num">1</div>
                <div className="doc-step-body">
                  When you register a webhook, AgentForge generates a random 32-byte{' '}
                  <strong>signing secret</strong> and returns it <strong>once</strong> in the API
                  response. Store it securely — you cannot retrieve it later (only rotate it).
                </div>
              </div>
              <div className="doc-step">
                <div className="doc-step-num">2</div>
                <div className="doc-step-body">
                  For each delivery, AgentForge computes an HMAC-SHA256 signature over the raw JSON
                  request body using your secret and sends it as:
                  <div className="doc-code-block doc-code-block--sm">
                    <pre className="doc-code-pre"><code>X-AgentForge-Signature: sha256=&lt;hex-digest&gt;</code></pre>
                  </div>
                </div>
              </div>
              <div className="doc-step">
                <div className="doc-step-num">3</div>
                <div className="doc-step-body">
                  Your endpoint must recompute the HMAC and compare it to the header value using a{' '}
                  <strong>constant-time comparison</strong> to prevent timing attacks.
                </div>
              </div>
            </div>
          </Section>

          {/* Request format */}
          <Section id="request-format">
            <h2 className="doc-h2">Request format</h2>
            <CodeBlock lang="JSON">{`{
  "event": "agent.subscribed",
  "agentId": "3fa8b2c1-...",
  "timestamp": "2026-07-04T12:00:00.000Z",
  "deliveryId": "8d4e1f9a-..."
}`}</CodeBlock>
            <p className="doc-p">Other headers sent with every delivery:</p>
            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Header</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><InlineCode>X-AgentForge-Event</InlineCode></td>
                    <td>Event type, e.g. <InlineCode>agent.subscribed</InlineCode></td>
                  </tr>
                  <tr>
                    <td><InlineCode>X-AgentForge-Delivery</InlineCode></td>
                    <td>UUID unique to this delivery attempt</td>
                  </tr>
                  <tr>
                    <td><InlineCode>X-AgentForge-Signature</InlineCode></td>
                    <td><InlineCode>sha256=&lt;hmac-hex&gt;</InlineCode></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Supported events */}
          <Section id="supported-events">
            <h2 className="doc-h2">Supported events</h2>
            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Fired when</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><InlineCode>agent.subscribed</InlineCode></td>
                    <td>Another user subscribes to one of your public agents</td>
                  </tr>
                  <tr>
                    <td><InlineCode>agent.shared</InlineCode></td>
                    <td>You make one of your agents public</td>
                  </tr>
                  <tr>
                    <td><InlineCode>agent.forked</InlineCode></td>
                    <td>Another user forks one of your public agents</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Verification examples */}
          <Section id="verification-examples">
            <h2 className="doc-h2">Verification examples</h2>

            <h3 className="doc-h3">Node.js</h3>
            <CodeBlock lang="JavaScript">{`import crypto from 'node:crypto';

function verifySignature(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // rawBody must be the raw Buffer/string, not re-serialized JSON
    .digest('hex');

  const received = signatureHeader.replace(/^sha256=/, '');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received, 'hex')
  );
}

// Express example
app.post('/webhooks/agentforge', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-agentforge-signature'] ?? '';
  if (!verifySignature(req.body, sig, process.env.AGENTFORGE_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  const payload = JSON.parse(req.body.toString());
  console.log('Event:', payload.event);
  res.sendStatus(200);
});`}</CodeBlock>

            <h3 className="doc-h3">Python</h3>
            <CodeBlock lang="Python">{`import hmac
import hashlib

def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    received = signature_header.replace('sha256=', '', 1)
    return hmac.compare_digest(expected, received)

# Flask example
from flask import Flask, request, abort
import os

app = Flask(__name__)

@app.route('/webhooks/agentforge', methods=['POST'])
def webhook():
    sig = request.headers.get('X-AgentForge-Signature', '')
    if not verify_signature(request.get_data(), sig, os.environ['AGENTFORGE_WEBHOOK_SECRET']):
        abort(401)
    payload = request.get_json()
    print('Event:', payload['event'])
    return '', 200`}</CodeBlock>

            <h3 className="doc-h3">Go</h3>
            <CodeBlock lang="Go">{`import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "strings"
)

func verifySignature(body []byte, sigHeader, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))
    received := strings.TrimPrefix(sigHeader, "sha256=")
    return hmac.Equal([]byte(expected), []byte(received))
}`}</CodeBlock>
          </Section>

          {/* Retries */}
          <Section id="retries">
            <h2 className="doc-h2">Retries and auto-disabling</h2>
            <div className="doc-callout doc-callout--warn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                If all retry attempts fail, the webhook is <strong>automatically disabled</strong> to
                protect your endpoint. Re-enable it from the Developer settings page.
              </span>
            </div>
            <p className="doc-p">
              AgentForge retries failed deliveries with exponential backoff. A delivery is considered
              successful when your endpoint returns any <InlineCode>2xx</InlineCode> HTTP status
              within <strong>10 seconds</strong>.
            </p>
          </Section>

          {/* Testing */}
          <Section id="testing">
            <h2 className="doc-h2">Testing</h2>
            <div className="doc-callout doc-callout--info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                Use the <strong>Test</strong> button on any active webhook in the Developer settings
                page to immediately enqueue a sample <InlineCode>agent.subscribed</InlineCode>{' '}
                delivery. The result appears in the webhook's delivery log within a few seconds.
              </span>
            </div>
          </Section>

          {/* Secret rotation */}
          <Section id="secret-rotation">
            <h2 className="doc-h2">Secret rotation</h2>
            <p className="doc-p">
              If your signing secret is ever compromised, use the <strong>Rotate secret</strong>{' '}
              button in the Developer settings page. A new secret is generated and shown once.
            </p>
            <div className="doc-callout doc-callout--danger">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                Update your endpoint's environment variable <strong>before</strong> dismissing the
                banner — the old secret stops working <strong>immediately</strong> after rotation.
              </span>
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
