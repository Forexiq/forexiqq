// api/auth/register.js
// POST /api/auth/register — Registro de nuevo usuario

const { supabaseAdmin } = require('../../lib/supabase')
const { hashPassword, generateToken, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { name, username, email, password, country } = req.body

    // Validations
    if (!name || !username || !email || !password || !country) {
      return res.status(400).json({ error: 'All fields are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' })
    }

    const cleanUsername = username.startsWith('@') ? username : '@' + username

    // Check if email already exists
    const { data: existingEmail } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingEmail) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    // Check if username already exists
    const { data: existingUsername } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', cleanUsername.toLowerCase())
      .single()

    if (existingUsername) {
      return res.status(409).json({ error: 'Username already taken' })
    }

    // Hash password
    const password_hash = await hashPassword(password)

    // Generate avatar colors
    const colors = [
      { bg: '#1e2a3d', tc: '#60a5fa' },
      { bg: '#1a2e1a', tc: '#4ade80' },
      { bg: '#2d2418', tc: '#fbbf24' },
      { bg: '#2d1d2d', tc: '#c084fc' },
      { bg: '#1a1f2e', tc: '#818cf8' },
    ]
    const color = colors[Math.floor(Math.random() * colors.length)]

    // Create user in database
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert([{
        name: name.trim(),
        username: cleanUsername.toLowerCase(),
        email: email.toLowerCase(),
        password_hash,
        country,
        role: 'standard',
        is_admin: false,
        avatar_color: color.bg,
        avatar_text_color: color.tc,
        total_payout: 0,
        payout_verified: false
      }])
      .select()
      .single()

    if (error) {
      console.error('DB insert error:', error)
      return res.status(500).json({ error: 'Error creating account' })
    }

    // Generate JWT token
    const token = generateToken(user)

    // Return user data (without password hash)
    const { password_hash: _, ...safeUser } = user

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: safeUser
    })

  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
