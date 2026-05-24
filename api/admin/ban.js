// api/admin/ban.js
// POST /api/admin/ban — Banear usuario (solo admins)
// DELETE /api/admin/ban — Levantar ban

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAdmin, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Require admin
  const admin = requireAdmin(req)
  if (!admin) return res.status(403).json({ error: 'Admin access required' })

  // BAN USER
  if (req.method === 'POST') {
    try {
      const { userId, reason, duration } = req.body

      if (!userId || !reason || !duration) {
        return res.status(400).json({ error: 'userId, reason and duration are required' })
      }

      // Can't ban another admin
      const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('id, name, username, is_admin')
        .eq('id', userId)
        .single()

      if (!targetUser) return res.status(404).json({ error: 'User not found' })
      if (targetUser.is_admin) return res.status(403).json({ error: 'Cannot ban an admin' })

      // Calculate ban_until
      let ban_until = null
      let is_permanent = false

      const durations = {
        '24h':  24 * 60 * 60 * 1000,
        '7d':   7  * 24 * 60 * 60 * 1000,
        '30d':  30 * 24 * 60 * 60 * 1000,
        'perm': null
      }

      if (duration === 'perm') {
        is_permanent = true
      } else {
        const ms = durations[duration]
        if (!ms) return res.status(400).json({ error: 'Invalid duration' })
        ban_until = new Date(Date.now() + ms).toISOString()
      }

      // Update user
      await supabaseAdmin
        .from('users')
        .update({
          is_banned: true,
          ban_reason: reason,
          ban_until: ban_until
        })
        .eq('id', userId)

      // Log in bans table
      await supabaseAdmin
        .from('bans_log')
        .insert([{
          user_id: userId,
          banned_by: admin.id,
          reason,
          duration,
          ban_until,
          is_permanent
        }])

      // Audit log
      await supabaseAdmin
        .from('audit_log')
        .insert([{
          action: 'USER_BANNED',
          performed_by: admin.id,
          target_user: userId,
          details: { reason, duration, ban_until },
          ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
        }])

      return res.status(200).json({
        message: `User @${targetUser.username} banned successfully`,
        ban_until,
        is_permanent
      })

    } catch (err) {
      console.error('Ban error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // LIFT BAN
  if (req.method === 'DELETE') {
    try {
      const { userId } = req.body

      if (!userId) return res.status(400).json({ error: 'userId is required' })

      await supabaseAdmin
        .from('users')
        .update({ is_banned: false, ban_reason: null, ban_until: null })
        .eq('id', userId)

      // Update ban log
      await supabaseAdmin
        .from('bans_log')
        .update({ lifted_at: new Date().toISOString(), lifted_by: admin.id })
        .eq('user_id', userId)
        .is('lifted_at', null)

      // Audit log
      await supabaseAdmin
        .from('audit_log')
        .insert([{
          action: 'BAN_LIFTED',
          performed_by: admin.id,
          target_user: userId,
          ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
        }])

      return res.status(200).json({ message: 'Ban lifted successfully' })

    } catch (err) {
      console.error('Lift ban error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
