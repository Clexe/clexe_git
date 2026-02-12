const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

let pool = null;

function getPool() {
  if (!pool) {
    if (!config.database.url) {
      throw new Error('DATABASE_URL is required. Set it in your environment variables.');
    }
    pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: config.database.url.includes('localhost') ? false : { rejectUnauthorized: false },
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected PostgreSQL pool error');
    });

    logger.info('PostgreSQL pool created');
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

async function getClient() {
  const p = getPool();
  return p.connect();
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

module.exports = { getPool, query, getClient, closeDb };
