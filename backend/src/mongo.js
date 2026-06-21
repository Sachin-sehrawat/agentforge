import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agentbuilder';
const DB_NAME = new URL(MONGO_URI).pathname.slice(1) || 'agentbuilder';

let client = null;
let db = null;

export async function connect() {
  if (client) return db;
  client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export function getDb() {
  if (!db) throw new Error('MongoDB not connected');
  return db;
}

export async function healthCheck() {
  if (!db) return { ok: false, error: 'Not connected' };
  try {
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default { connect, getDb, healthCheck };
