const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Explicitly ensure User2026 is passed if environment injection fails
const dbPassword = process.env.DB_PASSWORD || 'User2026';

const poolConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'nova_db',
  password: String(dbPassword).trim(),
  port: parseInt(process.env.DB_PORT || '5432', 10),
};

const pool = new Pool(poolConfig);

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database Connection Error:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL (nova_db)');
    release();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};