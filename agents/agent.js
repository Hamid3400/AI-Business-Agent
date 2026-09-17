const { GoogleGenAI } = require('@google/genai');
const path = require('path');

// Load environment variables from project root .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const restaurantTools = require('../tools/restaurantTools');
const { tools } = require('../tools/toolDeclarations');

// Ensure API Key resolution
// const apiKey = process.env.AI_API_KEY || 'AQ.Ab8RN6JMYDzD9g9eOU1Mbn9JjeXqsp1KBSeWKxJWXctjOvjspg';
// const ai = new GoogleGenAI({ apiKey: apiKey });

const SYSTEM_INSTRUCTION = `
You are Nova Restaurant's AI customer service and sales agent.
Your primary role is to help customers:
- Inspect the menu and find food prices
- Place food orders into the database
- Track existing orders

Rules:
1. Always use tools to fetch actual product data or place orders. Never make up prices or order numbers.
2. Prices are strictly in Nigerian Naira (₦).
3. Be polite, concise, and helpful.
`;

/**
 * Helper to initialize a chat session with automatic fallback models
 */
function createChatWithFallback() {
  const primaryModel = 'gemini-3.6-flash';
  const fallbackModel = 'gemini-3.5-flash';

  try {
    return ai.chats.create({
      model: primaryModel,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools,
      },
    });
  } catch (err) {
    console.warn(`⚠️ Primary model (${primaryModel}) unavailable. Switching to fallback (${fallbackModel})...`);
    return ai.chats.create({
      model: fallbackModel,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools,
      },
    });
  }
}

/**
 * Executes a single conversational turn with tool execution support
 */
async function runAgentTurn(chatSession, userMessage) {
  console.log(`\n👤 Customer: ${userMessage}`);

  let response = await chatSession.sendMessage({ message: userMessage });

  // Tool execution loop: executes database queries when Gemini requests function calls
  while (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    const { name, args } = call;
    console.log(`🤖 Agent executing tool: [${name}] with args:`, JSON.stringify(args));

    let toolResult;
    if (name === 'getProducts') {
      toolResult = await restaurantTools.getProducts();
    } else if (name === 'createOrder') {
      toolResult = await restaurantTools.createOrder(args);
    } else if (name === 'getOrder') {
      toolResult = await restaurantTools.getOrder(args);
    } else {
      toolResult = { error: 'Unknown function' };
    }

    // Send function execution output back to Gemini
    response = await chatSession.sendMessage({
      message: [
        {
          functionResponse: {
            name: name,
            response: toolResult,
          },
        },
      ],
    });
  }

  console.log(`🤖 Agent: ${response.text}`);
  return response.text;
}

/**
 * Interactive test runner for Day 4 validation
 */
async function startChat() {
  const model = createChatWithFallback();

  console.log('--- 🚀 Nova Restaurant AI Agent Online (Day 4) ---');

  // Test conversation flow
  await runAgentTurn(model, 'Hi, what food do you have on the menu?');
  await runAgentTurn(model, 'I want to order 2 Chicken Burgers.');
}

// Guarantee execution when invoked via Node CLI
startChat().catch(console.error);

module.exports = { runAgentTurn, createChatWithFallback };