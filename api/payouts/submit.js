// api/payouts/submit.js
// POST /api/payouts/submit — Usuario solicita verificación de payout
// GET  /api/payouts/submit — Admin ve todas las solicitudes pendientes

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAuth, requireAdmin, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // USER: Submit payout verification request
  if (req.method === 'POST') {
    try {
      const authUser = requireAuth(req)
      if (!authUser) return res.status(401).json({ error: 'Authentication required' })

      const { propFirm, amount, payoutDate, paymentMethod, documentUrls } = req.body

      if (!propFirm || !amount || !payoutDate) {
        return res.status(400).json({ error: 'Prop firm, amount and date are required' })
      }
      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' })
      }

      // Check for pending verification already
      const { data: existing } = await supabaseAdmin
        .from('payout_verifications')
        .select('id, status')
        .eq('user_id', authUser.id)
        .eq('status', 'pending')
        .single()

      if (existing) {
        return res.status(409).json({
          error: 'You already have a pending verification. Please wait for it to be reviewed.'
        })
      }

      const { data: verification, error } = await supabaseAdmin
        .from('payout_verifications')
        .insert([{
          user_id: authUser.id,
          prop_firm: propFirm,
          amount: parseFloat(amount),
          payout_date: payoutDate,
          payment_method: paymentMethod,
          document_urls: documentUrls || [],
          status: 'pending'
        }])
        .select()
        .single()

      if (error) throw error

      // Audit log
      await supabaseAdmin
        .from('audit_log')
        .insert([{
          action: 'PAYOUT_VERIFICATION_SUBMITTED',
          performed_by: authUser.id,
          details: { amount, propFirm, payoutDate }
        }])

      return res.status(201).json({
        message: 'Verification submitted successfully. Review takes 24-72 hours.',
        verification
      })

    } catch (err) {
      console.error('Submit payout error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  // ADMIN: Get all pending verifications
  if (req.method === 'GET') {
    try {
      const admin = requireAdmin(req)
      if (!admin) return res.status(403).json({ error: 'Admin access required' })

      const status = req.query.status || 'pending'

      const { data: verifications, error } = await supabaseAdmin
        .from('payout_verifications')
        .select(`
          *,
          users:user_id (id, name, username, role, avatar_color, avatar_text_color, total_payout)
        `)
        .eq('status', status)
        .order('created_at', { ascending: true })

      if (error) throw error

      return res.status(200).json({ verifications: verifications || [] })

    } catch (err) {
      console.error('Get verifications error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
