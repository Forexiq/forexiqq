// api/users/profile.js
// GET /api/users/profile — Perfil del usuario autenticado
// GET /api/users/profile?id=xxx — Perfil público de otro usuario

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAuth, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const authUser = requireAuth(req)
    if (!authUser) return res.status(401).json({ error: 'Authentication required' })

    const targetId = req.query.id || authUser.id

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, name, username, country, role, is_admin,
        avatar_color, avatar_text_color,
        total_payout, payout_verified,
        forum_posts, likes_received,
        created_at, last_login
      `)
      .eq('id', targetId)
      .single()

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Get their recent forum posts
    const { data: posts } = await supabaseAdmin
      .from('forum_posts')
      .select('id, title, tag, likes, created_at')
      .eq('user_id', targetId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(5)

    return res.status(200).json({
      user,
      recent_posts: posts || []
    })

  } catch (err) {
    console.error('Profile error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
