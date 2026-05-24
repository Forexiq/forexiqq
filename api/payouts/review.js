// api/payouts/review.js
// POST /api/payouts/review — Admin aprueba o rechaza una verificación de payout

const { supabaseAdmin } = require('../../lib/supabase')
const { requireAdmin, setCorsHeaders } = require('../../lib/auth')

module.exports = async function handler(req, res) {
  setCorsHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const admin = requireAdmin(req)
    if (!admin) return res.status(403).json({ error: 'Admin access required' })

    const { verificationId, action, rejectionReason } = req.body

    if (!verificationId || !action) {
      return res.status(400).json({ error: 'verificationId and action are required' })
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' })
    }
    if (action === 'reject' && !rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' })
    }

    // Get the verification
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('payout_verifications')
      .select('*, users:user_id (*)')
      .eq('id', verificationId)
      .single()

    if (fetchError || !verification) {
      return res.status(404).json({ error: 'Verification not found' })
    }
    if (verification.status !== 'pending' && verification.status !== 'reviewing') {
      return res.status(409).json({ error: 'Verification already processed' })
    }

    // Update verification status
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    await supabaseAdmin
      .from('payout_verifications')
      .update({
        status: newStatus,
        rejection_reason: action === 'reject' ? rejectionReason : null,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', verificationId)

    // If approved: update user's total_payout and payout_verified
    if (action === 'approve') {
      const userId = verification.user_id
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('total_payout')
        .eq('id', userId)
        .single()

      const newTotal = (user?.total_payout || 0) + verification.amount

      // assign_role_by_payout logic (mirrors SQL function)
      let newRole = 'verified'
      if (newTotal >= 500000) newRole = 'elite'
      else if (newTotal >= 200000) newRole = 'diamond'
      else if (newTotal >= 100000) newRole = 'gold'
      else if (newTotal >= 50000) newRole = 'silver'
      else if (newTotal >= 25000) newRole = 'bronze'

      await supabaseAdmin
        .from('users')
        .update({
          total_payout: newTotal,
          payout_verified: true,
          role: newRole
        })
        .eq('id', userId)

      // Audit log
      await supabaseAdmin
        .from('audit_log')
        .insert([{
          action: 'PAYOUT_APPROVED',
          performed_by: admin.id,
          target_user: userId,
          details: {
            amount: verification.amount,
            propFirm: verification.prop_firm,
            newTotal,
            newRole
          }
        }])

      return res.status(200).json({
        message: `Payout approved. User role updated to ${newRole}.`,
        newRole,
        newTotal
      })
    }

    // If rejected: audit log
    await supabaseAdmin
      .from('audit_log')
      .insert([{
        action: 'PAYOUT_REJECTED',
        performed_by: admin.id,
        target_user: verification.user_id,
        details: { reason: rejectionReason, amount: verification.amount }
      }])

    return res.status(200).json({ message: 'Verification rejected. User notified.' })

  } catch (err) {
    console.error('Review payout error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
