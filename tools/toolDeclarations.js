const { Type } = require('@google/genai');

/**
 * Tool: getProducts
 * Fetches the active menu items, prices, and categories from PostgreSQL.
 */
const getProductsDeclaration = {
  name: 'getProducts',
  description: 'Fetch the active restaurant menu containing products, prices, and categories.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

/**
 * Tool: createOrder
 * Inserts a new customer order and order items into the database.
 */
const createOrderDeclaration = {
  name: 'createOrder',
  description: 'Create a new customer order in the database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      customer_id: {
        type: Type.INTEGER,
        description: 'The numeric ID of the customer placing the order. Default is 1 if unspecified.',
      },
      items: {
        type: Type.ARRAY,
        description: 'List of product items and quantities being ordered.',
        items: {
          type: Type.OBJECT,
          properties: {
            product_id: { 
              type: Type.INTEGER, 
              description: 'Unique numeric database product ID.' 
            },
            quantity: { 
              type: Type.INTEGER, 
              description: 'Quantity of items ordered.' 
            },
            unit_price: { 
              type: Type.NUMBER, 
              description: 'Unit price of single product item in Nigerian Naira (₦).' 
            },
          },
          required: ['product_id', 'quantity', 'unit_price'],
        },
      },
    },
    required: ['items'],
  },
};

/**
 * Tool: getOrder
 * Look up order status and item breakdown by unique Order ID.
 */
const getOrderDeclaration = {
  name: 'getOrder',
  description: 'Retrieve order details and status by numeric order ID.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      order_id: { 
        type: Type.INTEGER, 
        description: 'The unique numeric order ID.' 
      },
    },
    required: ['order_id'],
  },
};

/**
 * Tool: transferToSupport
 * Escalates conversation to live customer support for human assistance.
 */
const transferToSupportDeclaration = {
  name: 'transferToSupport',
  description: 'Escalate the conversation to a human customer support agent when requested or when complex issues arise.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { 
        type: Type.STRING, 
        description: 'The specific reason or complaint requiring human intervention.' 
      },
    },
    required: ['reason'],
  },
};

module.exports = {
  tools: [
    {
      functionDeclarations: [
        getProductsDeclaration,
        createOrderDeclaration,
        getOrderDeclaration,
        transferToSupportDeclaration,
      ],
    },
  ],
};