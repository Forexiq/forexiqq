const { setCorsHeaders } = require('../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const TD_KEY = process.env.TWELVEDATA_KEY
    const syms = 'EUR/USD,GBP/USD,USD/JPY,XAU/USD,GBP/JPY,AUD/USD,USD/CHF,NZD/USD,USD/CAD,IXIC,DJI,SPX,USOIL,DX-Y.NYB'
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(syms)}&apikey=${TD_KEY}`
    const r = await fetch(url)
    const data = await r.json()
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: 'Price fetch failed' })
  }
}
