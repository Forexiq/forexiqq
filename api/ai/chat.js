// api/ai/chat.js
// POST /api/ai/chat — Proxy seguro para la API de Anthropic
// La API key NUNCA llega al frontend — solo vive aquí en el servidor

const Anthropic = require('@anthropic-ai/sdk')
const { requireAuth, setCorsHeaders } = require('../../lib/auth')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are ForexIQ AI, an expert forex and financial markets trading assistant embedded in a professional trading intelligence platform called ForexIQ.

You specialize in:
- Analyzing market impact of economic news on forex pairs (EUR/USD, GBP/USD, USD/JPY, XAU/USD, DXY, GBP/JPY, AUD/USD, USD/CAD, NZD/USD, USD/CHF, EUR/GBP)
- Interpreting economic calendar events: NFP, CPI, FOMC, GDP, PMI, central bank decisions (Fed, ECB, BoE, BoJ, RBA, SNB)
- Analyzing geopolitical events and their forex market impact (wars, trade deals, sanctions, diplomatic agreements, oil shocks)
- Providing actionable trade analysis with specific pip targets, key support/resistance levels, and direction bias
- Discussing trading strategies, risk management, and prop trading

Always be:
- Concise and specific: give pip targets, key levels, direction bias, and the main pairs affected
- Actionable: tell traders what to watch, where to enter, where to put their stop loss
- Honest about uncertainty: if you're not sure, say so and explain the key factors to watch

You are FULLY MULTILINGUAL: detect the language the user writes in and ALWAYS reply in that exact language. If the user writes in Spanish, reply in Spanish. If in French, reply in French. Never switch languages unless asked.

Never say you cannot access real-time data — work with the context provided and give your best analysis based on the information in the conversation.`

// Rate limiting (simple in-memory, upgrade to Redis for production)
const rateLimits = new Map()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX = 20 // max 20 requests per minute per user

function checkRateLimit(userId) {
  const now = Date.now()
  const userLimits = rateLimits.get(userId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW }

  if (now > userLimits.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (userLimits.count >= RATE_LIMIT_MAX) {
    return false
  }

  userLimits.count++
  rateLimits.set(userId, userLimits)
  return true
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Require authentication
    const authUser = requireAuth(req)
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Check rate limit
    if (!checkRateLimit(authUser.id)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
    }

    const { messages, language } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    // Sanitize messages (only allow user/assistant roles, string content)
    const sanitized = messages
      .filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-20) // Keep last 20 messages max to control token usage

    if (sanitized.length === 0) {
      return res.status(400).json({ error: 'No valid messages' })
    }

    // Add language instruction if specified
    const langInstructions = {
      es: 'Respond in Spanish.',
      fr: 'Respond in French.',
      de: 'Respond in German.',
      pt: 'Respond in Portuguese.',
      it: 'Respond in Italian.',
      zh: 'Respond in Chinese.',
      ar: 'Respond in Arabic.',
      ja: 'Respond in Japanese.',
      ru: 'Respond in Russian.',
      ko: 'Respond in Korean.',
      tr: 'Respond in Turkish.'
    }

    let systemPrompt = SYSTEM_PROMPT
    if (language && langInstructions[language]) {
      systemPrompt += `\n\nIMPORTANT: ${langInstructions[language]}`
    }

    // Call Anthropic API
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: sanitized
    })

    const text = response.content?.[0]?.text || 'Unable to generate response.'

    return res.status(200).json({
      response: text,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      }
    })

  } catch (err) {
    console.error('AI chat error:', err)

    if (err.status === 401) {
      return res.status(500).json({ error: 'AI service configuration error' })
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'AI service temporarily busy. Please try again.' })
    }

    return res.status(500).json({ error: 'AI service error. Please try again.' })
  }
}
