const db = require('./db');

async function runTenantMigration() {
  console.log('🔄 Running Multi-Tenant Schema Migration on nova_db...');
  try {
    // 1. Create Tenants Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS tenants (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          subdomain VARCHAR(50) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✅ Table "tenants" created.');

    // 2. Seed Initial Restaurant Tenants
    await db.query(`
      INSERT INTO tenants (id, name, subdomain) VALUES 
      (1, 'Nova Restaurant', 'nova'),
      (2, 'Mama Cass Bistro', 'mamacass')
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('  ✅ Default tenants seeded (Nova Restaurant ID: 1).');

    // 3. Add tenant_id Columns to Products and Orders
    await db.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) DEFAULT 1;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id) DEFAULT 1;
    `);
    console.log('  ✅ Foreign keys "tenant_id" added to products and orders tables.');

    // 4. Update Existing Products to Tenant 1
    await db.query(`UPDATE products SET tenant_id = 1 WHERE tenant_id IS NULL;`);
    console.log('  ✅ Existing products linked to Nova Restaurant.');

    console.log('🎉 Multi-Tenant Migration Completed Successfully!\n');
  } catch (err) {
    console.error('❌ Migration Failed:', err.message);
  } finally {
    process.exit();
  }
}

runTenantMigration();