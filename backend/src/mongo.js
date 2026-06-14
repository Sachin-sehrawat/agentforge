import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/agentforge';

let client = null;
let _db = null;

export async function connect() {
  client = new MongoClient(uri);
  await client.connect();
  _db = client.db();
}

export function db() {
  if (!_db) throw new Error('MongoDB not connected — call connect() first');
  return _db;
}

export default {
  async healthCheck() {
    if (!_db) throw new Error('MongoDB not connected');
    await _db.command({ ping: 1 });
    return { ok: true };
  },
};
