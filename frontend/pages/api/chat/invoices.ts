import type { NextApiRequest, NextApiResponse } from 'next'

import db from '../../../lib/db'
import { requireAuth } from '../../../lib/session'
import { ensureParticipant, getOrCreateConversation } from '../../../lib/conversations'
import { getServiceFeeRate } from '../../../lib/settings'
import getPspAdapter from '../../../lib/psp'
import { notifyAdminChange } from '../../../lib/notifications'

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
  pspReference: row.psp_reference ? String(row.psp_reference) : null,
  pspStatus: row.psp_status ? String(row.psp_status) : null,
  pspFailureReason: row.psp_failure_reason ? String(row.psp_failure_reason) : null,
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
              service_fee_cents, escrow_cents, refunded_cents, psp_reference, psp_status, psp_failure_reason,
              created_at, accepted_at, released_at, cancelled_at
         FROM chat_invoices WHERE id = ?`
    )
    .get(invoiceId)
  return row ? serializeInvoice(row) : null
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
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
                service_fee_cents, escrow_cents, refunded_cents, psp_reference, psp_status, psp_failure_reason,
                created_at, accepted_at, released_at, cancelled_at
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
      let adapter: ReturnType<typeof getPspAdapter>
      let failureReason = ''
      try {
        adapter = getPspAdapter()
      } catch (error) {
        failureReason =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : 'psp_unavailable'
        db.prepare(
          `UPDATE chat_invoices
              SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).run(failureReason, invoice.id)
        await notifyAdminChange(
          `PSP configuration error while authorising invoice ${invoice.id}: ${failureReason}`,
        )
        res.status(500).json({ error: 'psp_unavailable', reason: failureReason })
        return
      }
      let pspReference = invoice.pspReference ?? undefined
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await adapter.authorise(
            {
              invoiceId: invoice.id,
              amountCents: invoice.amountCents,
              currency: invoice.currency,
              reference: pspReference,
            },
            1,
          )
          if (!result.success) {
            failureReason = result.failureReason ?? 'authorisation_declined'
            throw new Error(failureReason)
          }
          pspReference = result.reference ?? pspReference ?? `inv-${invoice.id}`
          db.prepare(
            `UPDATE chat_invoices
                SET status = 'accepted', service_fee_cents = ?, escrow_cents = ?, accepted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP, psp_reference = ?, psp_status = ?, psp_failure_reason = ''
              WHERE id = ?`,
          ).run(
            serviceFeeCents,
            escrowCents,
            pspReference ?? '',
            result.status ?? 'authorised',
            invoice.id,
          )
          db.prepare(
            'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
          ).run(
            invoice.id,
            user.id,
            'accepted',
            JSON.stringify({
              serviceFeeRate,
              serviceFeeCents,
              escrowCents,
              pspReference: pspReference ?? null,
              pspStatus: result.status ?? 'authorised',
            }),
          )
          const updated = getInvoiceById(invoice.id)
          res.status(200).json({ invoice: updated })
          return
        } catch (error) {
          failureReason =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
              ? error
              : 'psp_authorise_failed'
          if (attempt < 2) {
            await wait((attempt + 1) * 300)
          }
        }
      }
      db.prepare(
        `UPDATE chat_invoices
            SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).run(failureReason, invoice.id)
      await notifyAdminChange(
        `PSP authorisation failed for invoice ${invoice.id}: ${failureReason}`,
      )
      res.status(502).json({ error: 'psp_authorise_failed', reason: failureReason })
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
      let adapter: ReturnType<typeof getPspAdapter>
      let failureReason = ''
      try {
        adapter = getPspAdapter()
      } catch (error) {
        failureReason =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : 'psp_unavailable'
        db.prepare(
          `UPDATE chat_invoices
              SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).run(failureReason, invoice.id)
        await notifyAdminChange(
          `PSP configuration error while capturing invoice ${invoice.id}: ${failureReason}`,
        )
        res.status(500).json({ error: 'psp_unavailable', reason: failureReason })
        return
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await adapter.capture(
            {
              invoiceId: invoice.id,
              amountCents: invoice.escrowCents ?? invoice.amountCents,
              currency: invoice.currency,
              reference: invoice.pspReference ?? undefined,
            },
            1,
          )
          if (!result.success) {
            failureReason = result.failureReason ?? 'capture_declined'
            throw new Error(failureReason)
          }
          db.prepare(
            `UPDATE chat_invoices
                SET status = 'released', released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
                    escrow_cents = 0, psp_status = ?, psp_failure_reason = ''
              WHERE id = ?`,
          ).run(result.status ?? 'captured', invoice.id)
          db.prepare(
            'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
          ).run(
            invoice.id,
            user.id,
            'released',
            JSON.stringify({
              releasedCents: invoice.escrowCents,
              pspReference: invoice.pspReference ?? null,
              pspStatus: result.status ?? 'captured',
            }),
          )
          const updated = getInvoiceById(invoice.id)
          res.status(200).json({ invoice: updated })
          return
        } catch (error) {
          failureReason =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
              ? error
              : 'psp_capture_failed'
          if (attempt < 2) {
            await wait((attempt + 1) * 300)
          }
        }
      }
      db.prepare(
        `UPDATE chat_invoices
            SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).run(failureReason, invoice.id)
      await notifyAdminChange(`PSP capture failed for invoice ${invoice.id}: ${failureReason}`)
      res.status(502).json({ error: 'psp_capture_failed', reason: failureReason })
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
      if (invoice.status === 'accepted' && refundedCents > 0) {
        let adapter: ReturnType<typeof getPspAdapter>
        let failureReason = ''
        try {
          adapter = getPspAdapter()
        } catch (error) {
          failureReason =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
              ? error
              : 'psp_unavailable'
          db.prepare(
            `UPDATE chat_invoices
                SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
          ).run(failureReason, invoice.id)
          await notifyAdminChange(
            `PSP configuration error while refunding invoice ${invoice.id}: ${failureReason}`,
          )
          res.status(500).json({ error: 'psp_unavailable', reason: failureReason })
          return
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const result = await adapter.refund(
              {
                invoiceId: invoice.id,
                amountCents: refundedCents,
                currency: invoice.currency,
                reference: invoice.pspReference ?? undefined,
              },
              1,
            )
            if (!result.success) {
              failureReason = result.failureReason ?? 'refund_declined'
              throw new Error(failureReason)
            }
            db.prepare(
              `UPDATE chat_invoices
                  SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, refunded_cents = ?, escrow_cents = 0,
                      updated_at = CURRENT_TIMESTAMP, psp_status = ?, psp_failure_reason = ''
                WHERE id = ?`,
            ).run(refundedCents, result.status ?? 'refunded', invoice.id)
            db.prepare(
              'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
            ).run(
              invoice.id,
              user.id,
              'cancelled',
              JSON.stringify({
                refundedCents,
                pspReference: invoice.pspReference ?? null,
                pspStatus: result.status ?? 'refunded',
              }),
            )
            const updated = getInvoiceById(invoice.id)
            res.status(200).json({ invoice: updated })
            return
          } catch (error) {
            failureReason =
              error instanceof Error
                ? error.message
                : typeof error === 'string'
                ? error
                : 'psp_refund_failed'
            if (attempt < 2) {
              await wait((attempt + 1) * 300)
            }
          }
        }
        db.prepare(
          `UPDATE chat_invoices
              SET psp_status = 'failed', psp_failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).run(failureReason, invoice.id)
        await notifyAdminChange(`PSP refund failed for invoice ${invoice.id}: ${failureReason}`)
        res.status(502).json({ error: 'psp_refund_failed', reason: failureReason })
        return
      }
      db.prepare(
        `UPDATE chat_invoices
            SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, refunded_cents = ?, escrow_cents = 0,
                updated_at = CURRENT_TIMESTAMP,
                psp_status = CASE WHEN psp_status = '' THEN psp_status ELSE 'voided' END,
                psp_failure_reason = ''
          WHERE id = ?`,
      ).run(refundedCents, invoice.id)
      db.prepare(
        'INSERT INTO chat_invoice_events (invoice_id, actor_id, event_type, payload) VALUES (?, ?, ?, ?)',
      ).run(
        invoice.id,
        user.id,
        'cancelled',
        JSON.stringify({
          refundedCents,
          pspReference: invoice.pspReference ?? null,
          pspStatus: invoice.pspStatus && invoice.pspStatus.length > 0 ? invoice.pspStatus : null,
        }),
      )
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
