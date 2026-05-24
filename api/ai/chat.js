const { requireAuth, setCorsHeaders } = require('../../lib/auth')

const SYSTEM_PROMPT = `You are ForexIQ AI, an expert forex trading assistant. Analyze news impact on forex pairs (EUR/USD, GBP/USD, USD/JPY, XAU/USD, DXY, AUD/USD). Give pip targets, key levels, direction bias. Detect user language and always reply in that language.`

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const authUser = requireAuth(req)
    if (!authUser) return res.status(401).json({ error: 'Authentication required' })

    const { messages, language } = req.body
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages required' })
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) return res.status(500).json({ error: 'AI not configured' })

    const langMap = { es:'Responde en español.', fr:'Réponds en français.', de:'Antworte auf Deutsch.', pt:'Responde em português.', it:'Rispondi in italiano.', zh:'用中文回复。', ar:'أجب باللغة العربية.', ja:'日本語で答えてください。', ru:'Отвечай на русском.' }
    const langNote = language && langMap[language] ? langMap[language] : ''
    const system = SYSTEM_PROMPT + (langNote ? ' ' + langNote : '')

    const geminiContents = messages
      .filter(m => ['user','assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

    if (!geminiContents.length) return res.status(400).json({ error: 'No valid messages' })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
        })
      }
    )

    const data = await geminiRes.json()
    if (!geminiRes.ok) {
      console.error('Gemini error:', data)
      return res.status(500).json({ error: 'AI service error. Please try again.' })
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate response.'
    return res.status(200).json({ response: text })

  } catch (err) {
    console.error('AI chat error:', err)
    return res.status(500).json({ error: 'AI service error. Please try again.' })
  }
}
