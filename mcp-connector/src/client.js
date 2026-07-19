export class AgentForgeClient {
  constructor(baseUrl, token = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async login(email, password) {
    const data = await this._request('POST', '/api/auth/login', { email, password }, false);
    this.token = data.token;
    return data;
  }

  async _request(method, path, body = null, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const init = { method, headers };
    if (body !== null) init.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, init);

    if (!res.ok) {
      let msg;
      try {
        const j = await res.json();
        msg = j.error || j.message || JSON.stringify(j);
      } catch {
        msg = res.statusText;
      }
      throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  }

  get(path) { return this._request('GET', path); }
  post(path, body) { return this._request('POST', path, body); }
  put(path, body) { return this._request('PUT', path, body); }
  patch(path, body) { return this._request('PATCH', path, body); }
  del(path) { return this._request('DELETE', path); }
}
