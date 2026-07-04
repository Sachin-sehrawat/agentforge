# Webhook Signature Verification

Every webhook delivery from AgentForge includes an `X-AgentForge-Signature` header that lets you verify the request came from us and was not tampered with in transit.

## How it works

1. When you register a webhook, AgentForge generates a random 32-byte **signing secret** and returns it **once** in the API response. Store it securely — you cannot retrieve it later (only rotate it).
2. For each delivery, AgentForge computes an HMAC-SHA256 signature over the raw JSON request body using your secret and sends it as:

   ```
   X-AgentForge-Signature: sha256=<hex-digest>
   ```

3. Your endpoint must recompute the HMAC and compare it to the header value using a **constant-time comparison** to prevent timing attacks.

## Request format

```json
{
  "event": "agent.subscribed",
  "agentId": "3fa8b2c1-...",
  "timestamp": "2026-07-04T12:00:00.000Z",
  "deliveryId": "8d4e1f9a-..."
}
```

Other headers sent with every delivery:

| Header | Description |
|---|---|
| `X-AgentForge-Event` | Event type, e.g. `agent.subscribed` |
| `X-AgentForge-Delivery` | UUID unique to this delivery attempt |
| `X-AgentForge-Signature` | `sha256=<hmac-hex>` |

## Supported events

| Event | Fired when |
|---|---|
| `agent.subscribed` | Another user subscribes to one of your public agents |
| `agent.shared` | You make one of your agents public |
| `agent.forked` | Another user forks one of your public agents |

## Verification examples

### Node.js

```js
import crypto from 'node:crypto';

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
});
```

### Python

```python
import hmac
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
    return '', 200
```

### Go

```go
import (
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
}
```

## Retries and auto-disabling

AgentForge retries failed deliveries with exponential backoff. If all attempts fail, the webhook is **automatically disabled** to protect your endpoint from continued traffic. You can re-enable it from the Developer settings page.

A delivery is considered successful when your endpoint returns any `2xx` HTTP status within 10 seconds.

## Testing

Use the **Test** button on any active webhook in the Developer settings page to immediately enqueue a sample `agent.subscribed` delivery. The result appears in the webhook's delivery log within a few seconds.

## Secret rotation

If your signing secret is ever compromised, use the **Rotate secret** button in the Developer settings page. A new secret is generated and shown once. Update your endpoint's environment variable before dismissing the banner — the old secret stops working immediately after rotation.
