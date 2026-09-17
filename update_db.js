require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'nova_db',
  password: process.env.PGPASSWORD || 'postgres',
  port: process.env.PGPORT || 5432,
});

async function updateDatabase() {
  try {
    await pool.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
    `);
    console.log("✅ Database upgraded: 'payment_status' column added!");
  } catch (err) {
    console.error("Database update failed:", err);
  } finally {
    await pool.end();
    process.exit();
  }
}

updateDatabase();
