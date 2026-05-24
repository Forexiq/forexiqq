// api/users/leaderboard.js
// GET /api/users/leaderboard?period=lifetime|monthly|weekly

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAuth, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const authUser = requireAuth(req)
    if (!authUser) return res.status(401).json({ error: 'Authentication required' })

    const period = req.query.period || 'lifetime'

    let query = supabaseAdmin
      .from('users')
      .select(`
        id, name, username, country, role,
        avatar_color, avatar_text_color,
        total_payout, payout_verified,
        forum_posts, created_at
      `)
      .eq('payout_verified', true)
      .eq('is_banned', false)
      .order('total_payout', { ascending: false })
      .limit(50)

    // For monthly/weekly we'd filter by payout verifications date
    // For simplicity using total_payout; in production, join with payout_verifications
    if (period === 'monthly') {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      // In production: filter payout_verifications by created_at >= monthStart
    }

    const { data: users, error } = await query

    if (error) throw error

    return res.status(200).json({
      period,
      users: users || [],
      total: users?.length || 0
    })

  } catch (err) {
    console.error('Leaderboard error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
