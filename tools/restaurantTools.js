const db = require('../database/db');

/**
 * Fetch all available menu items from PostgreSQL
 */
async function getProducts() {
  try {
    const res = await db.query(
      'SELECT id, name, price, category FROM products WHERE available = true ORDER BY id ASC'
    );
    return { success: true, products: res.rows };
  } catch (error) {
    console.error('Error fetching products:', error.message);
    return { success: false, error: 'Failed to retrieve menu.' };
  }
}

/**
 * Create an order and record line items in PostgreSQL
 */
async function createOrder({ customer_id = 1, items }) {
  try {
    let total_amount = 0;
    for (const item of items) {
      total_amount += item.quantity * item.unit_price;
    }

    const orderRes = await db.query(
      'INSERT INTO orders (customer_id, status, total_amount) VALUES ($1, $2, $3) RETURNING id',
      [customer_id, 'pending', total_amount]
    );
    const orderId = orderRes.rows[0].id;

    for (const item of items) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [orderId, item.product_id, item.quantity, item.unit_price]
      );
    }

    return {
      success: true,
      order_id: orderId,
      total_amount: total_amount,
      message: `Order #${orderId} created successfully for ₦${total_amount.toLocaleString()}`,
    };
  } catch (error) {
    console.error('Error creating order:', error.message);
    return { success: false, error: 'Failed to create order.' };
  }
}

/**
 * Retrieve order details and items by order ID
 */
async function getOrder({ order_id }) {
  try {
    const res = await db.query(
      `SELECT o.id, o.status, o.total_amount, o.created_at,
              json_agg(json_build_object('product_id', oi.product_id, 'quantity', oi.quantity, 'unit_price', oi.unit_price)) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [order_id]
    );
    if (res.rows.length === 0) return { success: false, message: 'Order not found.' };
    return { success: true, order: res.rows[0] };
  } catch (error) {
    console.error('Error fetching order:', error.message);
    return { success: false, error: 'Failed to retrieve order.' };
  }
}

module.exports = {
  getProducts,
  createOrder,
  getOrder,
};