import pg from 'pg';

const { Pool } = pg;

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '1000', 10);
const QUERY_TIMEOUT_MS = parseInt(process.env.QUERY_TIMEOUT_MS ?? '5000', 10);
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      database: process.env.POSTGRES_DB ?? 'agentforge',
      user: process.env.POSTGRES_USER ?? 'agentforge',
      password: process.env.POSTGRES_PASSWORD ?? 'agentforge',
    };

const pool = new Pool({
  ...poolConfig,
  max: parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
  min: parseInt(process.env.POSTGRES_POOL_MIN ?? '2', 10),
  query_timeout: QUERY_TIMEOUT_MS,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Idle client error:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const ms = Date.now() - start;
    if (ms > SLOW_QUERY_MS) {
      console.warn(`[db] Slow query (${ms}ms): ${text}`);
    }
    return result;
  } catch (err) {
    console.error(`[db] Query failed (${Date.now() - start}ms): ${err.message} | sql: ${text}`);
    throw err;
  }
}

async function healthCheck() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT version() AS version, NOW() AS timestamp');
    return { ok: true, version: rows[0].version, timestamp: rows[0].timestamp };
  } finally {
    client.release();
  }
}

// Retries transient connection errors with exponential back-off.
async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient =
        err.code === 'ECONNREFUSED' ||
        err.code === 'ENOTFOUND' ||
        err.code === '57P01'; // admin shutdown
      if (!transient || attempt === retries) throw err;
      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.warn(`[db] Attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export { pool, query, healthCheck, withRetry };
export default { query, healthCheck, withRetry };
