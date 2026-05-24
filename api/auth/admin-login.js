// api/auth/admin-login.js
// POST /api/auth/admin-login — Login exclusivo para administradores

const { supabaseAdmin } = require('../../lib/supabase')
const { verifyPassword, generateToken, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, password, adminKey } = req.body

    if (!email || !password || !adminKey) {
      return res.status(400).json({ error: 'All admin credentials are required' })
    }

    // Verify admin secret key (stored in env, never in DB)
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      // Log failed admin attempt
      console.warn(`[SECURITY] Failed admin login attempt for email: ${email} at ${new Date().toISOString()}`)
      return res.status(401).json({ error: 'Invalid admin key' })
    }

    // Find user and verify it's an admin
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_admin', true)
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'Admin account not found' })
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Log successful admin login in audit table
    await supabaseAdmin
      .from('audit_log')
      .insert([{
        action: 'ADMIN_LOGIN',
        performed_by: user.id,
        details: { email: user.email, timestamp: new Date().toISOString() },
        ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress
      }])

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id)

    const token = generateToken(user)
    const { password_hash, ...safeUser } = user

    return res.status(200).json({
      message: 'Admin login successful',
      token,
      user: safeUser
    })

  } catch (err) {
    console.error('Admin login error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
