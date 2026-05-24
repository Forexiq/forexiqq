// api/auth/login.js
// POST /api/auth/login — Login de usuario

const { supabaseAdmin } = require('../../lib/supabase')
const { verifyPassword, generateToken, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user by email
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check if banned
    if (user.is_banned) {
      const banMsg = user.ban_until
        ? `Account banned until ${new Date(user.ban_until).toLocaleDateString()}`
        : 'Account permanently banned'
      return res.status(403).json({ error: banMsg })
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id)

    // Generate token
    const token = generateToken(user)

    // Return safe user (no password hash)
    const { password_hash, ...safeUser } = user

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: safeUser
    })

  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
