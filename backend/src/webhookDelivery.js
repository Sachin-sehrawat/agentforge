import crypto from 'node:crypto';
import db from './db.js';
import { isPrivateHostname } from './tools/httpRequest.js';
import { registerHandler } from './worker.js';

const DELIVERY_TIMEOUT_MS = parseInt(process.env.WEBHOOK_DELIVERY_TIMEOUT_MS ?? '10000', 10);

async function handleWebhookDelivery(payload, { jobId, attemptNo, maxAttempts } = {}) {
  const { webhookId, event, agentId } = payload;

  const { rows } = await db.query(
    'SELECT id, url, secret, active FROM webhooks WHERE id = $1',
    [webhookId]
  );

  // Webhook deleted or deactivated since enqueue — skip without retry.
  if (!rows[0] || !rows[0].active) return;

  const webhook = rows[0];

  // Re-run SSRF check at delivery time to defend against DNS rebinding.
  let parsed;
  try {
    parsed = new URL(webhook.url);
  } catch {
    await disableWebhook(webhookId, `Invalid URL: ${webhook.url}`);
    return;
  }

  if (isPrivateHostname(parsed.hostname)) {
    const errMsg = `SSRF: hostname resolved to a private address at delivery time`;
    await logDelivery(webhookId, jobId, event, agentId, null, attemptNo, null, errMsg);
    await disableWebhook(webhookId, errMsg);
    console.warn(`[webhook] ${errMsg} — disabled webhook ${webhookId}`);
    return;
  }

  const deliveryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ event, agentId, timestamp, deliveryId });

  const sig = crypto
    .createHmac('sha256', webhook.secret)
    .update(body)
    .digest('hex');

  let statusCode = null;
  let fetchError = null;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AgentForge-Event': event,
        'X-AgentForge-Delivery': deliveryId,
        'X-AgentForge-Signature': `sha256=${sig}`,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    statusCode = res.status;
    if (!res.ok) {
      fetchError = `HTTP ${res.status}`;
    }
  } catch (err) {
    fetchError = err.message;
  }

  await logDelivery(webhookId, jobId, event, agentId, deliveryId, attemptNo, statusCode, fetchError);

  if (fetchError) {
    // On final attempt: auto-disable the webhook.
    if (attemptNo >= maxAttempts) {
      await disableWebhook(webhookId, `auto-disabled after ${maxAttempts} failed delivery attempts`);
      console.warn(`[webhook] Auto-disabled webhook ${webhookId} after ${maxAttempts} failed attempts`);
    }
    throw new Error(fetchError);
  }
}

async function logDelivery(webhookId, jobId, event, agentId, deliveryId, attempt, statusCode, error) {
  try {
    await db.query(
      `INSERT INTO webhook_deliveries
         (webhook_id, job_id, event, agent_id, delivery_id, attempt, status_code, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [webhookId, jobId ?? null, event, agentId ?? null, deliveryId ?? crypto.randomUUID(), attempt ?? 1, statusCode, error ?? null]
    );
  } catch (err) {
    console.error('[webhook] Failed to log delivery attempt:', err.message);
  }
}

async function disableWebhook(webhookId, reason) {
  try {
    await db.query('UPDATE webhooks SET active = false WHERE id = $1', [webhookId]);
  } catch (err) {
    console.error(`[webhook] Failed to disable webhook ${webhookId}:`, err.message);
  }
}

export function registerWebhookDeliveryHandler() {
  registerHandler('webhook_delivery', handleWebhookDelivery);
}
