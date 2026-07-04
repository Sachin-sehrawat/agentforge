import { pool } from './db.js';

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '5000', 10);
const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE ?? '5', 10);
const BASE_BACKOFF_MS = parseInt(process.env.WORKER_BASE_BACKOFF_MS ?? '30000', 10);

// Registry of job type handlers. Register with registerHandler(type, fn).
const handlers = new Map();

export function registerHandler(type, fn) {
  handlers.set(type, fn);
}

async function processJob(client, job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    throw new Error(`No handler registered for job type "${job.type}"`);
  }
  // job.attempts is the pre-increment value; the DB was already bumped by 1 before this call.
  const ctx = { jobId: job.id, attemptNo: job.attempts + 1, maxAttempts: job.max_attempts };
  await handler(job.payload, ctx);
}

async function tick() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: jobs } = await client.query(
      `SELECT id, type, payload, attempts, max_attempts
       FROM jobs
       WHERE status IN ('pending', 'processing')
         AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    for (const job of jobs) {
      await client.query(
        `UPDATE jobs SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
         WHERE id = $1`,
        [job.id]
      );
      await client.query('SAVEPOINT before_job');

      try {
        await processJob(client, job);
        await client.query(
          `UPDATE jobs SET status = 'done', updated_at = NOW() WHERE id = $1`,
          [job.id]
        );
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT before_job');
        const newAttempts = job.attempts + 1;
        if (newAttempts >= job.max_attempts) {
          await client.query(
            `UPDATE jobs SET status = 'failed', attempts = $1, updated_at = NOW() WHERE id = $2`,
            [newAttempts, job.id]
          );
          console.error(`[worker] Job ${job.id} (${job.type}) failed permanently after ${newAttempts} attempts:`, err.message);
        } else {
          // Exponential backoff: 2^attempts * base interval
          const backoffMs = Math.pow(2, newAttempts) * BASE_BACKOFF_MS;
          await client.query(
            `UPDATE jobs
             SET status = 'pending',
                 attempts = $1,
                 next_attempt_at = NOW() + ($2 || ' milliseconds')::interval,
                 updated_at = NOW()
             WHERE id = $3`,
            [newAttempts, backoffMs, job.id]
          );
          console.warn(`[worker] Job ${job.id} (${job.type}) attempt ${newAttempts} failed, retry in ${backoffMs}ms:`, err.message);
        }
      }

      await client.query('RELEASE SAVEPOINT before_job');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[worker] Tick error:', err.message);
  } finally {
    client.release();
  }
}

let _timer = null;

export function startWorker() {
  if (process.env.ENABLE_WORKER === 'false') {
    console.log('[worker] Disabled via ENABLE_WORKER=false');
    return;
  }

  console.log(`[worker] Started (poll=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE})`);

  const schedule = () => {
    _timer = setTimeout(async () => {
      try {
        await tick();
      } finally {
        schedule();
      }
    }, POLL_INTERVAL_MS);
    _timer.unref();
  };

  schedule();
}

export function stopWorker() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}
