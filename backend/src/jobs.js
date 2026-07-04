import db from './db.js';

export async function enqueueJob(type, payload) {
  const { rows } = await db.query(
    `INSERT INTO jobs (type, payload) VALUES ($1, $2) RETURNING id`,
    [type, JSON.stringify(payload)]
  );
  return rows[0].id;
}
