import { MongoClient } from 'mongodb';
const uris = [
  'mongodb://admin:adminpassword@localhost:27017/agentforge?authSource=admin',
  'mongodb://admin:adminpassword@127.0.0.1:27017/agentforge?authSource=admin',
  'mongodb://admin:adminpassword@localhost:27017/?authSource=admin',
];
for (const uri of uris) {
  const c = new MongoClient(uri);
  try {
    await c.connect();
    const db = c.db('agentforge');
    const result = await db.collection('builtin_skills').findOne({});
    console.log('OK:', uri.replace(/:[^:@]+@/, ':<redacted>@'), '-> find result:', result);
    await c.close();
  } catch(e) {
    console.log('FAIL:', uri.replace(/:[^:@]+@/, ':<redacted>@'), '->', e.message);
    try { await c.close(); } catch {}
  }
}
