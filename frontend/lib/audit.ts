import db from './db'
import type { SessionUser } from './session'

export type AuditAction = {
  action: string
  entity: string
  entityId: string | number
  metadata?: Record<string, unknown>
}

export const recordAuditEvent = (user: SessionUser, event: AuditAction): void => {
  db.prepare(
    'INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, metadata) VALUES (?, ?, ?, ?, ?)' 
  ).run(user.id, event.action, event.entity, String(event.entityId), JSON.stringify(event.metadata ?? {}))
}
