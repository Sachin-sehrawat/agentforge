import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock token module before importing middleware
// ---------------------------------------------------------------------------

const mockVerifyToken = vi.fn();

vi.mock('../src/auth/token.js', () => ({
  verifyToken: mockVerifyToken,
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
}));

const { requireAuth, optionalAuth } = await import('../src/middleware/auth.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(authHeader) {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
  };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  it('calls next() and attaches req.user when token is valid', () => {
    const payload = { userId: 'user-1', iat: 0, exp: 9999999999 };
    mockVerifyToken.mockReturnValueOnce(payload);

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(payload);
    expect(res._status).toBeNull();
  });

  it('returns 401 with { error } when Authorization header is missing', () => {
    const req = makeReq(null);
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Authorization header required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with { error } when scheme is not Bearer', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Authorization header required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with { error } when token is invalid', () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('invalid signature'); });

    const req = makeReq('Bearer bad-token');
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with { error } when token is expired', () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('jwt expired'); });

    const req = makeReq('Bearer expired-token');
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes the token string (without Bearer prefix) to verifyToken', () => {
    mockVerifyToken.mockReturnValueOnce({ userId: 'u' });

    const req = makeReq('Bearer my-jwt-string');
    requireAuth(req, makeRes(), vi.fn());

    expect(mockVerifyToken).toHaveBeenCalledWith('my-jwt-string');
  });

  it('error response always has the { error } shape', () => {
    const req = makeReq(null);
    const res = makeRes();
    requireAuth(req, res, vi.fn());

    expect(res._body).toHaveProperty('error');
    expect(typeof res._body.error).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth', () => {
  it('calls next() and attaches req.user when token is valid', () => {
    const payload = { userId: 'user-2', iat: 0, exp: 9999999999 };
    mockVerifyToken.mockReturnValueOnce(payload);

    const req = makeReq('Bearer valid-token');
    const res = makeRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(payload);
    expect(res._status).toBeNull();
  });

  it('calls next() anonymously (no req.user) when header is absent', () => {
    const req = makeReq(null);
    const res = makeRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
    expect(res._status).toBeNull();
  });

  it('calls next() anonymously when scheme is not Bearer', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = makeRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('calls next() anonymously (no req.user) when token is invalid', () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('invalid signature'); });

    const req = makeReq('Bearer bad-token');
    const res = makeRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
    expect(res._status).toBeNull();
  });

  it('calls next() anonymously (no req.user) when token is expired', () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('jwt expired'); });

    const req = makeReq('Bearer expired-token');
    const res = makeRes();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });

  it('never sends a response — neither 401 nor any other status', () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('bad'); });

    const req = makeReq('Bearer bad');
    const res = makeRes();
    optionalAuth(req, res, vi.fn());

    expect(res._status).toBeNull();
    expect(res._body).toBeNull();
  });
});
