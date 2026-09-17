const { GoogleGenAI } = require('@google/genai');
const pool = require('../config/db');
const { sendWithRetry } = require('./retryService');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Instruction / Persona Setup
const systemInstruction = `You are the warm, professional, and highly intelligent AI Assistant for Nova Restaurant. 

PERSONA & BEHAVIOR:
- Be extremely polite, conversational, and helpful. 
- You easily understand text abbreviations (like "pls", "thx", "u", "brb", "rn") and casual slang. Never act confused by informal typing or minor typos.
- Keep responses concise and formatted cleanly for messaging platforms (WhatsApp and Web UI). Use bolding and line breaks effectively.

ORDERING & PAYMENT FLOW:
1. If a customer asks for the menu or food options, use the 'get_menu' tool and present items clearly with their prices.
2. If a customer wants to check availability, use 'check_stock'.
3. When they confirm what they want to buy, call the 'create_order' tool.
4. CRITICAL: When 'create_order' returns the success confirmation and bank account details, YOU MUST display those exact bank details verbatim to the customer.
5. Remind the customer to reply with "Paid" or "Done" once they make the transfer.
6. If a customer says "Paid", "Done", or indicates they transferred funds, thank them warmly and reassure them that the kitchen is preparing their order.

Never invent prices, menu items, or account numbers. Always rely strictly on tool outputs.`;

// Tool Declarations
const getMenuTool = {
  name: 'get_menu',
  description: 'Fetch the active food and drink menu for Nova Restaurant.',
  parameters: {
    type: 'OBJECT',
    properties: {}
  }
};

const createOrderTool = {
  name: 'create_order',
  description: 'Create an order for food or drink items at Nova Restaurant and generate payment instructions.',
  parameters: {
    type: 'OBJECT',
    properties: {
      productName: {
        type: 'STRING',
        description: 'The exact name or close match of the product the customer wants to order.'
      },
      quantity: {
        type: 'INTEGER',
        description: 'The quantity of items to order. Defaults to 1 if unspecified.'
      }
    },
    required: ['productName', 'quantity']
  }
};

const checkStockTool = {
  name: 'check_stock',
  description: 'Check stock availability for a specific food or drink item.',
  parameters: {
    type: 'OBJECT',
    properties: {
      productName: {
        type: 'STRING',
        description: 'The name of the item to check.'
      }
    },
    required: ['productName']
  }
};

const tools = [{
  functionDeclarations: [getMenuTool, createOrderTool, checkStockTool]
}];

// Tool Execution Handlers
async function executeToolCall(functionCall) {
  const { name, args } = functionCall;

  if (name === 'get_menu') {
    const res = await pool.query(
      `SELECT name, description, price, category FROM products WHERE tenant_id = 1 AND is_available = true ORDER BY category, name`
    );
    if (res.rows.length === 0) return "No menu items available right now.";
    return JSON.stringify(res.rows);
  }

  if (name === 'create_order') {
    const { productName, quantity = 1 } = args;

    // Search product in Tenant 1 inventory
    const prodRes = await pool.query(
      `SELECT id, name, price, stock_quantity FROM products WHERE tenant_id = 1 AND LOWER(name) LIKE LOWER($1) AND is_available = true LIMIT 1`,
      [`%${productName}%`]
    );

    if (prodRes.rows.length === 0) {
      return `Sorry, we couldn't find "${productName}" on our menu today.`;
    }

    const product = prodRes.rows[0];

    if (product.stock_quantity < quantity) {
      return `Sorry, we only have ${product.stock_quantity} units of ${product.name} left in stock right now.`;
    }

    const totalPrice = Number(product.price) * quantity;

    // Database transaction: Insert order and order item, deduct stock
    const client = await pool.connect();
    let orderId;
    try {
      await client.query('BEGIN');

      const orderRes = await client.query(
        `INSERT INTO orders (tenant_id, total_amount, status, payment_status) VALUES (1, $1, 'pending', 'pending') RETURNING id`,
        [totalPrice]
      );
      orderId = orderRes.rows[0].id;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [orderId, product.id, quantity, product.price]
      );

      await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [quantity, product.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error("Order Creation Error:", err);
      return "Failed to process order in database. Please try again.";
    } finally {
      client.release();
    }

    return `✅ Order Placed Successfully! (Order #${orderId})
Item: ${quantity}x ${product.name}
Total Amount: ₦${totalPrice.toLocaleString()}
Order Status: Pending Payment

💳 PAYMENT INSTRUCTIONS:
Please transfer exactly ₦${totalPrice.toLocaleString()} to:
Bank: OPay
Account No: 1234567890
Name: Nova Restaurant

Reply with "Paid" or "Done" once the transfer is successful so we can prepare your order!`;
  }

  if (name === 'check_stock') {
    const { productName } = args;
    const res = await pool.query(
      `SELECT name, stock_quantity, price FROM products WHERE tenant_id = 1 AND LOWER(name) LIKE LOWER($1) LIMIT 1`,
      [`%${productName}%`]
    );
    if (res.rows.length === 0) return `Product "${productName}" not found.`;
    const item = res.rows[0];
    return `${item.name} is available. Current stock: ${item.stock_quantity} units (₦${Number(item.price).toLocaleString()} each).`;
  }

  throw new Error(`Unknown function call: ${name}`);
}

// Main AI Agent Execution Function
async function processAgentMessage(userMessage, conversationHistory = []) {
  const contents = [
    ...conversationHistory,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  // Primary Agent Call with Retry/Fallback Support
  let response = await sendWithRetry(async (modelName) => {
    return await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        tools: tools,
        temperature: 0.3
      }
    });
  });

  // Function Call Loop
  let functionCalls = response.functionCalls;
  while (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0];
    const toolResult = await executeToolCall(call);

    contents.push({
      role: 'model',
      parts: [{ functionCall: call }]
    });

    contents.push({
      role: 'user',
      parts: [{
        functionResponse: {
          name: call.name,
          response: { result: toolResult }
        }
      }]
    });

    response = await sendWithRetry(async (modelName) => {
      return await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          tools: tools,
          temperature: 0.3
        }
      });
    });

    functionCalls = response.functionCalls;
  }

  return response.text;
}

module.exports = {
  processAgentMessage
};