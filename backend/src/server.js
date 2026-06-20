import 'dotenv/config';
import { app } from './app.js';
import db from './db.js';
import { connect as mongoConnect } from './mongo.js';
import { setup as mongoSetup } from './mongo-init.js';

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`AgentForge backend running at http://localhost:${PORT}`);
  try {
    await db.healthCheck();
    console.log('[db] PostgreSQL connection established');
  } catch (err) {
    console.error('[db] WARNING: Cannot reach PostgreSQL —', err.message);
    console.error('[db] Run `docker-compose up -d` from the project root to start the database.');
  }
  try {
    await mongoConnect();
    await mongoSetup();
    console.log('[mongo] MongoDB connection established and collections ready');
  } catch (err) {
    console.error('[mongo] WARNING: Cannot reach MongoDB —', err.message);
    console.error('[mongo] Preferences, workspace, and draft endpoints will return 503 until MongoDB is available.');
  }
});
