import pg from 'pg';
const { Pool } = pg;

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'agentforge',
      user: process.env.POSTGRES_USER || 'agentforge',
      password: process.env.POSTGRES_PASSWORD || 'agentforge',
    };

const pool = new Pool(config);

export default pool;
