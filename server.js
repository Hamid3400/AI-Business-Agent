// Bypass local SSL certificate issues for Telegram API calls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const https = require('https');
const twilio = require('twilio');
const { GoogleGenAI } = require('@google/genai');

// --- Phase 3: Security Imports ---
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const restaurantTools = require('./tools/restaurantTools');
const { tools } = require('./tools/toolDeclarations');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Phase 3: Security Middlewares ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    }
  })
);

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please wait a minute before trying again.' }
});

app.use('/api/', apiLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini API Client
const apiKey = process.env.AI_API_KEY || 'YOUR_GEMINI_API_KEY';
const ai = new GoogleGenAI({ apiKey: apiKey });

// Enhanced Persona with Informal Slang Handling & Payment Guidance
const SYSTEM_INSTRUCTION = `
You are Nova Restaurant's warm, professional, and highly intelligent AI customer service and sales agent.

PERSONA & BEHAVIOR:
- Be extremely polite, conversational, and helpful.
- You easily understand text abbreviations (like "pls", "thx", "u", "brb", "rn") and casual slang. Never act confused by informal typing or minor typos.
- Keep responses concise and formatted cleanly for messaging platforms (WhatsApp, Web UI, Telegram). Use bolding and line breaks effectively.

RULES & PAYMENT FLOW:
1. Always use tools to fetch menu data or insert orders into PostgreSQL. Never invent prices or order numbers.
2. Prices are strictly in Nigerian Naira (₦).
3. When an order is placed via 'createOrder', ensure the bank transfer details returned by the tool are displayed clearly to the customer.
4. Tell the customer to reply with "Paid" or "Done" once they complete the bank transfer so the kitchen can begin preparing their order.
5. If a customer requests human support, complaints, or complex issues, invoke 'transferToSupport'.
`;

const sessions = new Map();

/**
 * Creates or retrieves a Gemini chat session with active model fallbacks
 */
function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    // Updated to use gemini-3.6-flash as requested by the API error log
    const modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash'];
    let chat = null;

    for (const modelName of modelsToTry) {
      try {
        chat = ai.chats.create({
          model: modelName,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: tools,
          },
        });
        break;
      } catch (err) {
        continue;
      }
    }
    sessions.set(sessionId, chat);
  }
  return sessions.get(sessionId);
}

/**
 * Executes a Gemini API call with Exponential Backoff Retry for 429 limits
 */
async function sendWithRetry(chatSession, payload, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await chatSession.sendMessage(payload);
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries - 1) {
        attempt++;
        const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`⚠️ Rate limit hit (429). Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delayMs)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Core Agent Loop: Processes messages and manages function tool execution
 */
async function processUserMessage(sessionId, messageText) {
  let chatSession = getOrCreateSession(sessionId);
  let response;

  try {
    response = await sendWithRetry(chatSession, { message: messageText });
  } catch (err) {
    if (err.status === 429) {
      console.warn('⚠️ Quota exhausted. Re-initializing session on fallback model...');
      chatSession = ai.chats.create({
        model: 'gemini-3.6-flash',
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools: tools },
      });
      sessions.set(sessionId, chatSession);
      response = await sendWithRetry(chatSession, { message: messageText });
    } else {
      throw err;
    }
  }

  // Tool execution loop
  while (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    const { name, args } = call;

    let toolResult;
    if (name === 'getProducts') {
      toolResult = await restaurantTools.getProducts();
    } else if (name === 'createOrder') {
      toolResult = await restaurantTools.createOrder(args);
    } else if (name === 'getOrder') {
      toolResult = await restaurantTools.getOrder(args);
    } else if (name === 'transferToSupport') {
      toolResult = {
        status: 'Transferred',
        support_phone: '+234 800 668 2243',
        department: 'Live Escalations Team',
      };
    } else {
      toolResult = { error: 'Unknown function' };
    }

    response = await sendWithRetry(chatSession, {
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

  return response.text;
}

// --- Web UI Endpoint ---
app.post('/api/chat', async (req, res) => {
  const { sessionId = 'web_default', message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const reply = await processUserMessage(sessionId, message);
    res.json({ reply });
  } catch (error) {
    console.error('Web UI Error:', error);
    res.status(500).json({ error: error.message || 'Server error. Check terminal.' });
  }
});

// --- Phase 2: Multilingual Twilio Voice Webhooks ---
app.post('/api/voice/incoming', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/api/voice/prompt',
    method: 'POST',
  });

  gather.say({ language: 'en-NG' }, 'Welcome to Nova Restaurant. For English, press 1.');
  gather.say({ language: 'fr-FR' }, 'Pour le français, appuyez sur 2.');
  twiml.redirect('/api/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/api/voice/prompt', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digit = req.body.Digits;

  let lang = 'en-NG';
  let promptText = 'What would you like to order today?';

  if (digit === '2') {
    lang = 'fr-FR';
    promptText = "Que souhaitez-vous commander aujourd'hui ?";
  }

  const gather = twiml.gather({
    input: ['speech'],
    language: lang,
    action: `/api/voice/respond?lang=${lang}`,
    method: 'POST',
    speechTimeout: 'auto',
  });

  gather.say({ language: lang }, promptText);
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/api/voice/respond', async (req, res) => {
  const userSpeech = req.body.SpeechResult;
  const callSid = req.body.CallSid || 'voice_session';
  const lang = req.query.lang || 'en-NG';
  const twiml = new twilio.twiml.VoiceResponse();

  if (userSpeech) {
    try {
      const langInstruction = lang === 'fr-FR' ? ' (IMPORTANT: Reply entirely in French)' : '';
      const aiReply = await processUserMessage(`voice_${callSid}`, userSpeech + langInstruction);
      twiml.say({ language: lang }, aiReply);
    } catch (err) {
      console.error('Voice AI Error:', err);
      twiml.say(
        { language: lang },
        lang === 'fr-FR' ? "Désolé, une erreur s'est produite." : "Sorry, we could not process your order right now."
      );
    }
  } else {
    twiml.say(
      { language: lang },
      lang === 'fr-FR' ? "Je n'ai pas compris." : "I didn't catch that."
    );
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- WhatsApp Messaging Webhook ---
app.post('/api/whatsapp/webhook', async (req, res) => {
  const incomingMsg = req.body.Body || '';
  const fromWhatsAppNumber = req.body.From || 'unknown_wa';
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const aiReply = await processUserMessage(`wa_${fromWhatsAppNumber}`, incomingMsg);
    twiml.message(aiReply);
  } catch (err) {
    twiml.message('Sorry, Nova Restaurant AI is currently busy. Please try again in a moment.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// --- Telegram Bot Channel ---
if (process.env.TELEGRAM_BOT_TOKEN) {
  const customAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, { telegram: { agent: customAgent } });

  bot.start((ctx) => ctx.reply('👋 Welcome to Nova Restaurant! Ask for our menu or place an order.'));
  bot.on('text', async (ctx) => {
    try {
      const reply = await processUserMessage(`telegram_${ctx.chat.id}`, ctx.message.text);
      await ctx.reply(reply);
    } catch (error) {
      console.error('Telegram Bot Error:', error);
      await ctx.reply('Sorry, I encountered an error. Please try again.');
    }
  });

  bot.launch()
    .then(() => console.log('🤖 Telegram Bot Connected & Listening'))
    .catch((err) => console.warn('⚠️ Telegram Connection Warning:', err.message));
}

app.listen(PORT, () => {
  console.log(`🚀 Nova Express Server running on http://localhost:${PORT}`);
});