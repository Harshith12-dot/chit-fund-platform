import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

export function submitSurety({
  payoutId,
  cycleId,
  membershipId,
  userId,
  suretyType,
  guarantorName,
  guarantorPhone,
  guarantorIdMasked,
  documentRef
}, db = null) {
  const database = db || getDatabase();

  const payout = database.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId);
  if (!payout) throw new Error('Payout record not found.');

  const existing = database.prepare('SELECT * FROM sureties WHERE payout_id = ?').get(payoutId);
  if (existing && existing.status === 'APPROVED') {
    throw new Error('Surety has already been approved for this payout.');
  }

  const suretyId = existing ? existing.id : 'sur-' + randomUUID();
  const now = new Date().toISOString();

  if (existing) {
    database.prepare(`
      UPDATE sureties
      SET surety_type = ?, guarantor_name = ?, guarantor_phone = ?,
          guarantor_id_masked = ?, document_ref = ?, status = 'PENDING_HOST_APPROVAL',
          rejection_reason = NULL, submitted_at = ?
      WHERE id = ?
    `).run(suretyType, guarantorName, guarantorPhone, guarantorIdMasked, documentRef, now, suretyId);
  } else {
    database.prepare(`
      INSERT INTO sureties (
        id, payout_id, cycle_id, membership_id, user_id,
        surety_type, guarantor_name, guarantor_phone, guarantor_id_masked,
        document_ref, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_HOST_APPROVAL', ?)
    `).run(
      suretyId, payoutId, cycleId, membershipId, userId,
      suretyType, guarantorName, guarantorPhone, guarantorIdMasked,
      documentRef, now
    );
  }

  const saved = database.prepare('SELECT * FROM sureties WHERE id = ?').get(suretyId);

  logAuditEvent({
    actorId: userId,
    action: 'SURETY_SUBMITTED',
    objectType: 'sureties',
    objectId: suretyId,
    afterState: saved,
    metadata: { suretyType, guarantorName, payoutId },
    db: database
  });

  return saved;
}

export function getPendingSuretiesForHost(hostUserId, db = null) {
  const database = db || getDatabase();

  return database.prepare(`
    SELECT s.*, p.net_payout_minor, p.gross_amount_minor,
           c.sequence_no, g.id as group_id, g.name as group_name,
           u.phone as member_phone, prof.display_name as member_name
    FROM sureties s
    JOIN payouts p ON s.payout_id = p.id
    JOIN chit_cycles c ON s.cycle_id = c.id
    JOIN chit_groups g ON c.group_id = g.id
    JOIN users u ON s.user_id = u.id
    LEFT JOIN user_profiles prof ON u.id = prof.user_id
    WHERE s.status = 'PENDING_HOST_APPROVAL' AND g.organizer_id = ?
    ORDER BY s.submitted_at DESC
  `).all(hostUserId);
}

export function verifySurety({ suretyId, hostUserId, approved, rejectionReason }, db = null) {
  const database = db || getDatabase();

  const surety = database.prepare(`
    SELECT s.*, g.organizer_id
    FROM sureties s
    JOIN chit_cycles c ON s.cycle_id = c.id
    JOIN chit_groups g ON c.group_id = g.id
    WHERE s.id = ?
  `).get(suretyId);

  if (!surety) throw new Error('Surety record not found.');
  if (surety.organizer_id !== hostUserId) {
    throw new Error('Only the organizer / host of this chit fund can verify this surety.');
  }

  const now = new Date().toISOString();
  const newStatus = approved ? 'APPROVED' : 'REJECTED';

  database.prepare(`
    UPDATE sureties
    SET status = ?, verified_by_host_id = ?, verified_at = ?, rejection_reason = ?
    WHERE id = ?
  `).run(newStatus, hostUserId, now, approved ? null : (rejectionReason || 'Rejected by Host'), suretyId);

  // If approved, update payout status to READY_FOR_DISBURSAL or keep track
  if (approved) {
    database.prepare(`
      UPDATE payouts
      SET approval_status = 'APPROVED'
      WHERE id = ?
    `).run(surety.payout_id);
  }

  const updated = database.prepare('SELECT * FROM sureties WHERE id = ?').get(suretyId);

  logAuditEvent({
    actorId: hostUserId,
    action: approved ? 'SURETY_APPROVED' : 'SURETY_REJECTED',
    objectType: 'sureties',
    objectId: suretyId,
    afterState: updated,
    metadata: { approved, rejectionReason },
    db: database
  });

  return updated;
}

export function getSuretyByPayoutId(payoutId, db = null) {
  const database = db || getDatabase();
  return database.prepare('SELECT * FROM sureties WHERE payout_id = ?').get(payoutId);
}
