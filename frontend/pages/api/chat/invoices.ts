import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'
import { getServiceFeeRate } from '../../../lib/settings'

const serializeInvoice = (row: Record<string, any>) => ({
  id: Number(row.id),
  conversationId: Number(row.conversation_id),
  creatorId: Number(row.creator_id),
  recipientId: Number(row.recipient_id),
  amountCents: Number(row.amount_cents),
  currency: String(row.currency ?? 'AUD'),
  description: String(row.description ?? ''),
  status: String(row.status),
  serviceFeeCents: Number(row.service_fee_cents ?? 0),
  escrowCents: Number(row.escrow_cents ?? 0),
  refundedCents: Number(row.refunded_cents ?? 0),
  createdAt: String(row.created_at ?? ''),
  acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
  releasedAt: row.released_at ? String(row.released_at) : null,
  cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
})

const isAllowedPairing = (
  actorRole: string,
  partnerRole: string,
): boolean => {
  if (actorRole === 'admin') {
    return true
  }
  if (actorRole === 'conveyancer') {
    return partnerRole === 'buyer' || partnerRole === 'seller'
  }
  if (partnerRole === 'conveyancer') {
    return actorRole === 'buyer' || actorRole === 'seller'
  }
  return false
}

const ensureConversation = (userId: number, partnerId: number) => {
  const conversation = getOrCreateConversation(userId, partnerId)
  if (!ensureParticipant(conversation.id, userId)) {
    return null
  }
  return conversation
}

const getInvoiceById = (invoiceId: number) => {
  const row = db
    .prepare(
      `SELECT id, conversation_id, creator_id, recipient_id, amount_cents, currency, description, status,
              service_fee_cents, escrow_cents, refunded_cents, created_at, accepted_at, released_at, cancelled_at
         FROM chat_invoices WHERE id = ?`
    )
    .get(invoiceId)
  return row ? serializeInvoice(row) : null
}

const handler = (req: NextApiRequest, res: NextApiResponse): void => {
  const user = requireAuth(req, res)
  if (!user) {
    return
  }

  if (req.method === 'GET') {
    const partnerId = req.query.partnerId ? Number(req.query.partnerId) : undefined
    const conversationId = req.query.conversationId ? Number(req.query.conversationId) : undefined

    if ((!partnerId || Number.isNaN(partnerId)) && (!conversationId || Number.isNaN(conversationId))) {
      res.status(400).json({ error: 'invalid_partner' })
      return
    }

    let conversation
    if (conversationId && Number.isFinite(conversationId)) {
      const row = db
        .prepare('SELECT id, participant_a, participant_b FROM conversations WHERE id = ?')
        .get(conversationId) as { id: number; participant_a: number; participant_b: number } | undefined
      if (!row || (row.participant_a !== user.id && row.participant_b !== user.id)) {
        res.status(404).json({ error: 'conversation_not_found' })
        return
      }
      conversation = { id: row.id }
    } else if (partnerId) {
      const partner = db
        .prepare('SELECT id, role FROM users WHERE id = ?')
        .get(partnerId) as { id: number; role: string } | undefined
      if (!partner) {
        res.status(404).json({ error: 'partner_not_found' })
        return
      }
      if (!isAllowedPairing(user.role, partner.role)) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      conversation = ensureConversation(user.id, partner.id)
      if (!conversation) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
    }

    if (!conversation) {
      res.status(400).json({ error: 'conversation_missing' })
      return
    }

    const invoices = db
      .prepare(
        `SELECT id, conversation_id, creator_id, recipient_id, amount_cents, currency, description, status,
                service_fee_cents, escrow_cents, refunded_cents, created_at, accepted_at, released_at, cancelled_at
           FROM chat_invoices WHERE conversation_id = ? ORDER BY created_at ASC`
      )
      .all(conversation.id) as Array<Record<string, any>>

    res.status(200).json({ invoices: invoices.map(serializeInvoice) })
    return
  }

  if (req.method === 'POST') {
    const { partnerId, amount, currency, description } = req.body as {
      partnerId?: number
      amount?: number
      currency?: string
      description?: string
    }

    if (!partnerId || Number.isNaN(Number(partnerId))) {
      res.status(400).json({ error: 'invalid_partner' })
      return
    }

    const partner = db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .get(Number(partnerId)) as { id: number; role: string } | undefined
    if (!partner) {
      res.status(404).json({ error: 'partner_not_found' })
      return
    }

    if (!isAllowedPairing(user.role, partner.role)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    if (user.role !== 'conveyancer' && user.role !== 'admin') {
      res.status(403).json({ error: 'creator_not_allowed' })
      return
    }

    const amountNumber = typeof amount === 'number' ? amount : Number(amount)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      res.status(400).json({ error: 'invalid_amount' })
      return
    }
    const amountCents = Math.round(amountNumber * 100)
    if (amountCents <= 0) {
      res.status(400).json({ error: 'invalid_amount' })
      return
    }

    const conversation = ensureConversation(user.id, partner.id)
    if (!conversation) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    const stmt = db.prepare(
      `INSERT INTO chat_invoices (conversation_id, creator_id, recipient_id, amount_cents, currency, description, status)
       VALUES (?, ?, ?, ?, ?, ?, 'sent')`
    )
    const info = stmt.run(conversation.id, user.id, partner.id, amountCents, currency ?? 'AUD', description ?? '')
    const invoiceId = Number(info.lastInsertRowid)

    db.prepare(
      'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
    ).run(invoiceId, user.id, 'created', JSON.stringify({ amountCents }))

    const invoice = getInvoiceById(invoiceId)
    res.status(201).json({ invoice })
    return
  }

  if (req.method === 'PUT') {
    const { invoiceId, action } = req.body as { invoiceId?: number; action?: string }
    if (!invoiceId || Number.isNaN(Number(invoiceId))) {
      res.status(400).json({ error: 'invalid_invoice' })
      return
    }

    const invoice = getInvoiceById(Number(invoiceId))
    if (!invoice) {
      res.status(404).json({ error: 'invoice_not_found' })
      return
    }

    if (!ensureParticipant(invoice.conversationId, user.id)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }

    if (action === 'accept') {
      if (invoice.status !== 'sent') {
        res.status(409).json({ error: 'invalid_state' })
        return
      }
      if (invoice.recipientId !== user.id) {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      const serviceFeeRate = getServiceFeeRate()
      const serviceFeeCents = Math.max(0, Math.round(invoice.amountCents * serviceFeeRate))
      const escrowCents = Math.max(0, invoice.amountCents - serviceFeeCents)
      db.prepare(
        `UPDATE chat_invoices
            SET status = 'accepted', service_fee_cents = ?, escrow_cents = ?, accepted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).run(serviceFeeCents, escrowCents, invoice.id)
      db.prepare(
        'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
      ).run(invoice.id, user.id, 'accepted', JSON.stringify({ serviceFeeRate, serviceFeeCents, escrowCents }))
      const updated = getInvoiceById(invoice.id)
      res.status(200).json({ invoice: updated })
      return
    }

    if (action === 'release') {
      if (invoice.status !== 'accepted') {
        res.status(409).json({ error: 'invalid_state' })
        return
      }
      if (invoice.creatorId !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      db.prepare(
        `UPDATE chat_invoices
            SET status = 'released', released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, escrow_cents = 0
          WHERE id = ?`,
      ).run(invoice.id)
      db.prepare(
        'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
      ).run(invoice.id, user.id, 'released', JSON.stringify({ releasedCents: invoice.escrowCents }))
      const updated = getInvoiceById(invoice.id)
      res.status(200).json({ invoice: updated })
      return
    }

    if (action === 'cancel') {
      if (invoice.status !== 'sent' && invoice.status !== 'accepted') {
        res.status(409).json({ error: 'invalid_state' })
        return
      }
      if (invoice.creatorId !== user.id && invoice.recipientId !== user.id && user.role !== 'admin') {
        res.status(403).json({ error: 'forbidden' })
        return
      }
      const refundedCents = invoice.status === 'accepted'
        ? Math.max(0, invoice.escrowCents || invoice.amountCents - invoice.serviceFeeCents)
        : 0
      db.prepare(
        `UPDATE chat_invoices
            SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, refunded_cents = ?, escrow_cents = 0,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).run(refundedCents, invoice.id)
      db.prepare(
        'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
      ).run(invoice.id, user.id, 'cancelled', JSON.stringify({ refundedCents }))
      const updated = getInvoiceById(invoice.id)
      res.status(200).json({ invoice: updated })
      return
    }

    res.status(400).json({ error: 'unsupported_action' })
    return
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT'])
  res.status(405).end('Method Not Allowed')
}

export default handler
