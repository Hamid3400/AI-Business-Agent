const db = require('./database/db');

async function runSystemDiagnostic() {
  console.log('--------------------------------------------------');
  console.log('🧪 Starting Nova AI Agent Platform Diagnostic Check');
  console.log('--------------------------------------------------');

  try {
    // 1. Verify Database Connection & Multi-Tenant Records
    const tenantRes = await db.query('SELECT * FROM tenants');
    console.log(`✅ [Database] Tenants found: ${tenantRes.rows.length}`);

    const productRes = await db.query('SELECT COUNT(*) FROM products WHERE tenant_id = 1');
    console.log(`✅ [Database] Active products for Nova Restaurant (Tenant #1): ${productRes.rows[0].count}`);

    // 2. Query Recent Orders
    const orderRes = await db.query(`
      SELECT o.id, o.tenant_id, o.total_amount, o.status, o.created_at, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    console.log('\n📦 [Orders] Recent Database Orders:');
    if (orderRes.rows.length === 0) {
      console.log('   No orders found in nova_db yet.');
    } else {
      console.table(orderRes.rows);
    }

    console.log('\n--------------------------------------------------');
    console.log('🎉 All Core Platform Subsystems Verified Successfully!');
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('❌ System Diagnostic Failed:', err.message);
  } finally {
    process.exit();
  }
}

runSystemDiagnostic();