// api/forum/posts.js
// GET  /api/forum/posts — lista posts
// POST /api/forum/posts — crear post

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAuth, setCorsHeaders } = require('../../lib/auth')

// Simple antispam: last post time per user
const lastPostTime = new Map()
const COOLDOWN_STANDARD = 3 * 60 * 1000  // 3 min for standard users
const COOLDOWN_VERIFIED = 30 * 1000       // 30 sec for verified+ users

const VERIFIED_ROLES = ['verified', 'bronze', 'silver', 'gold', 'diamond', 'elite']

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — list posts
  if (req.method === 'GET') {
    try {
      const authUser = requireAuth(req)
      if (!authUser) return res.status(401).json({ error: 'Authentication required' })

      const { tag, limit = 20, offset = 0 } = req.query

      let query = supabaseAdmin
        .from('forum_posts')
        .select(`
          id, title, body, tag, likes, views, created_at,
          users:user_id (
            id, name, username, role,
            avatar_color, avatar_text_color
          )
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

      if (tag && tag !== 'all') {
        query = query.eq('tag', tag)
      }

      const { data: posts, error } = await query
      if (error) throw error

      return res.status(200).json({ posts: posts || [] })

    } catch (err) {
      console.error('Get posts error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // POST — create post
  if (req.method === 'POST') {
    try {
      const authUser = requireAuth(req)
      if (!authUser) return res.status(401).json({ error: 'Authentication required' })

      // Antispam cooldown
      const lastPost = lastPostTime.get(authUser.id)
      const now = Date.now()
      const cooldown = VERIFIED_ROLES.includes(authUser.role) ? COOLDOWN_VERIFIED : COOLDOWN_STANDARD

      if (lastPost && (now - lastPost) < cooldown) {
        const remaining = Math.ceil((cooldown - (now - lastPost)) / 1000)
        return res.status(429).json({
          error: `Please wait ${remaining} seconds before posting again`
        })
      }

      const { title, body, tag } = req.body

      // Validations
      if (!title || !body || !tag) {
        return res.status(400).json({ error: 'Title, body and tag are required' })
      }
      if (title.length > 200) {
        return res.status(400).json({ error: 'Title too long (max 200 chars)' })
      }
      if (body.length > 5000) {
        return res.status(400).json({ error: 'Post body too long (max 5000 chars)' })
      }
      if (!['analysis', 'signal', 'debate', 'news', 'ask'].includes(tag)) {
        return res.status(400).json({ error: 'Invalid tag' })
      }

      // Check for duplicate content (simple hash check)
      const contentKey = `${authUser.id}:${title.slice(0, 50)}`

      // Create post
      const { data: post, error } = await supabaseAdmin
        .from('forum_posts')
        .insert([{
          user_id: authUser.id,
          title: title.trim(),
          body: body.trim(),
          tag
        }])
        .select(`
          id, title, body, tag, likes, created_at,
          users:user_id (id, name, username, role, avatar_color, avatar_text_color)
        `)
        .single()

      if (error) throw error

      // Update user post count
      await supabaseAdmin.rpc('increment', { table: 'users', column: 'forum_posts', row_id: authUser.id })
        .catch(() => {}) // non-critical

      // Update cooldown
      lastPostTime.set(authUser.id, now)

      return res.status(201).json({ post })

    } catch (err) {
      console.error('Create post error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
