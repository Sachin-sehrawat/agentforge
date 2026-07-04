import db from '../db.js';
import { QUOTA } from '../quotaConfig.js';

// Returns midnight UTC of the next day as an ISO string.
function nextMidnightUTC() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/**
 * Factory that returns Express middleware enforcing daily quotas for `action`.
 * Anonymous requests (no req.user) are always passed through — quota applies
 * to authenticated users only.
 */
export function enforceQuota(action) {
  return async (req, res, next) => {
    // Anonymous — not subject to per-user quota.
    if (!req.user) return next();

    const userId = req.user.userId;

    try {
      const { rows: userRows } = await db.query(
        'SELECT tier FROM users WHERE id = $1',
        [userId]
      );
      const tier = userRows[0]?.tier ?? 'free';

      const limit = QUOTA[tier]?.[action] ?? QUOTA.free[action];

      // Paid (or unlimited) tier: no counting needed.
      if (limit === Infinity) return next();

      // Atomically increment counter and get the new value.
      const { rows } = await db.query(
        `INSERT INTO usage_counters (user_id, action, period, count)
         VALUES ($1, $2, CURRENT_DATE, 1)
         ON CONFLICT (user_id, action, period)
         DO UPDATE SET count = usage_counters.count + 1
         RETURNING count`,
        [userId, action]
      );

      const used = rows[0].count;

      if (used > limit) {
        return res.status(429).json({
          error: `Daily ${action} limit reached`,
          limit,
          used,
          resetsAt: nextMidnightUTC(),
          tier,
        });
      }

      next();
    } catch (err) {
      // Quota check failure should not block the user — log and continue.
      console.error(`[quota] check failed for user ${userId} action ${action}:`, err.message);
      next();
    }
  };
}
