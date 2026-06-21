import { MongoClient } from 'mongodb';
// Try connecting to admin db to list users
const c = new MongoClient('mongodb://localhost:27017/admin');
await c.connect();
const db = c.db('admin');
try {
  const users = await db.command({ usersInfo: 1 });
  console.log(JSON.stringify(users.users.map(u => ({ user: u.user, db: u.db, roles: u.roles })), null, 2));
} catch(e) {
  console.log('error:', e.code, e.message);
}
await c.close();
