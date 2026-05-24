// lib/auth.js
// Utilidades de autenticación: JWT + bcrypt

const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 12

// Hash password
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

// Compare password with hash
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// Generate JWT token (expires in 7 days)
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      is_admin: user.is_admin
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (err) {
    return null
  }
}

// Middleware: extract user from Authorization header
function requireAuth(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.split(' ')[1]
  return verifyToken(token)
}

// Middleware: require admin role
function requireAdmin(req) {
  const user = requireAuth(req)
  if (!user || !user.is_admin) return null
  return user
}

// CORS headers helper
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  requireAuth,
  requireAdmin,
  setCorsHeaders
}
