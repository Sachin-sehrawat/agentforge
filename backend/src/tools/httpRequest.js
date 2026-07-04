const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254']);

export function isPrivateHostname(hostname) {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

/**
 * Makes an HTTP request to a public URL and returns status + body text.
 * Requests to localhost / private network ranges are blocked.
 *
 * @param {{url: string, method?: string, headers?: object, body?: object}} input
 */
export async function runHttpRequest({ url, method = 'GET', headers = {}, body }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Invalid URL.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Only http and https URLs are allowed.' };
  }

  if (isPrivateHostname(parsed.hostname)) {
    return { error: 'Requests to local or private network addresses are blocked.' };
  }

  try {
    const res = await fetch(parsed.toString(), {
      method: (method || 'GET').toUpperCase(),
      headers: { Accept: 'application/json, text/plain, */*', ...headers },
      body: body && !['GET', 'HEAD'].includes((method || 'GET').toUpperCase())
        ? JSON.stringify(body)
        : undefined,
      signal: AbortSignal.timeout(8000),
    });

    const text = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      body: text.length > 4000 ? text.slice(0, 4000) + '\n...[truncated]' : text,
    };
  } catch (err) {
    return { error: `Request failed: ${err.message}` };
  }
}
