import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb://localhost:27017/agentforge');
await c.connect();
const db = c.db();
console.log('db:', db.databaseName);
try {
  const result = await db.collection('builtin_skills').findOne({});
  console.log('find ok:', result);
} catch(e) {
  console.log('find error code:', e.code, 'codeName:', e.codeName);
  console.log('message:', e.message);
}
await c.close();
