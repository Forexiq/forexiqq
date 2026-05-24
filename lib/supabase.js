// lib/supabase.js
// Cliente de Supabase para el backend (usa SERVICE KEY — nunca en el frontend)

const { createClient } = require('@supabase/supabase-js')

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env variables')
}

// Service key — bypasses RLS, solo para el backend
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

module.exports = { supabaseAdmin }
