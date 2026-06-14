import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- pg mock ---------------------------------------------------------------

const mockRelease = vi.fn();
const mockClientQuery = vi.fn();
const mockPoolQuery = vi.fn();
const mockConnect = vi.fn(() => Promise.resolve({ query: mockClientQuery, release: mockRelease }));
const mockOn = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      this.query = mockPoolQuery;
      this.connect = mockConnect;
      this.on = mockOn;
    }),
  },
}));

// Import after mock is registered
const { query, healthCheck, withRetry } = await import('../src/db.js');

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('query()', () => {
  it('returns the pool result on success', async () => {
    const fakeResult = { rows: [{ id: '1' }], rowCount: 1 };
    mockPoolQuery.mockResolvedValueOnce(fakeResult);

    const result = await query('SELECT * FROM agents WHERE id = $1', ['1']);

    expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = $1', ['1']);
    expect(result).toBe(fakeResult);
  });

  it('re-throws and logs on query error', async () => {
    const err = new Error('connection refused');
    mockPoolQuery.mockRejectedValueOnce(err);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(query('SELECT 1')).rejects.toThrow('connection refused');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Query failed'));

    consoleSpy.mockRestore();
  });

  it('logs a warning for slow queries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPoolQuery.mockImplementationOnce(
      () => new Promise((r) => setTimeout(() => r({ rows: [] }), 1100))
    );

    // Override threshold to 0 so any query counts as slow
    const origEnv = process.env.SLOW_QUERY_THRESHOLD_MS;
    process.env.SLOW_QUERY_THRESHOLD_MS = '0';

    await query('SELECT 1');

    process.env.SLOW_QUERY_THRESHOLD_MS = origEnv;
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Slow query/));
    warnSpy.mockRestore();
  }, 3000);
});

describe('healthCheck()', () => {
  it('returns ok:true with version and timestamp on success', async () => {
    const now = new Date();
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ version: 'PostgreSQL 14.0', timestamp: now }],
    });

    const result = await healthCheck();

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockClientQuery).toHaveBeenCalledWith('SELECT version() AS version, NOW() AS timestamp');
    expect(mockRelease).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, version: 'PostgreSQL 14.0', timestamp: now });
  });

  it('releases the client even when the query throws', async () => {
    mockClientQuery.mockRejectedValueOnce(new Error('db down'));

    await expect(healthCheck()).rejects.toThrow('db down');
    expect(mockRelease).toHaveBeenCalledOnce();
  });
});

describe('withRetry()', () => {
  it('returns the result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValueOnce('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on transient ECONNREFUSED and succeeds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transientErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const fn = vi.fn()
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, 3);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result).toBe('recovered');
    warnSpy.mockRestore();
  });

  it('throws immediately on non-transient errors without retrying', async () => {
    const fatalErr = Object.assign(new Error('syntax error'), { code: '42601' });
    const fn = vi.fn().mockRejectedValue(fatalErr);

    await expect(withRetry(fn, 3)).rejects.toThrow('syntax error');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('throws after exhausting all retries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transientErr = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const fn = vi.fn().mockRejectedValue(transientErr);

    await expect(withRetry(fn, 3)).rejects.toThrow('refused');
    expect(fn).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });
});
