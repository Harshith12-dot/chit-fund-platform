import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';
import { postBalancedTransaction } from './ledgerService.js';

export function createSupportCase({
  raisedByUserId,
  groupId = null,
  cycleId = null,
  category = 'GENERAL_SUPPORT',
  title,
  description
}, db = null) {
  const database = db || getDatabase();
  const caseId = 'cas-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO support_cases (
      id, raised_by_user_id, group_id, cycle_id, category, title, description,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
  `).run(
    caseId,
    raisedByUserId,
    groupId,
    cycleId,
    category,
    title,
    description,
    now
  );

  const newCase = database.prepare('SELECT * FROM support_cases WHERE id = ?').get(caseId);

  logAuditEvent({
    actorId: raisedByUserId,
    action: 'DISPUTE_OR_TICKET_RAISED',
    objectType: 'support_cases',
    objectId: caseId,
    afterState: newCase,
    metadata: { category, title },
    db: database
  });

  return newCase;
}

export function resolveSupportCase({
  caseId,
  resolvedByUserId,
  decision, // RESOLVED, CLOSED
  resolutionNotes,
  compensatingAmountMinor = 0,
  compensatingGroupId = null,
  compensatingMembershipId = null
}, db = null) {
  const database = db || getDatabase();
  const existing = database.prepare('SELECT * FROM support_cases WHERE id = ?').get(caseId);
  if (!existing) throw new Error('Case not found.');

  const now = new Date().toISOString();
  let compensatingTxId = null;

  // If a monetary refund/correction is required, do NOT alter past records:
  // Post an immutable compensating double-entry reversal!
  if (compensatingAmountMinor > 0 && compensatingGroupId) {
    const compTx = postBalancedTransaction({
      groupId: compensatingGroupId,
      sourceType: 'COMPENSATING_REVERSAL',
      sourceId: caseId,
      description: `Compensating reversal for Dispute #${caseId.slice(0, 8)}: ${resolutionNotes}`,
      entries: [
        { accountId: 'acc-1002', entryType: 'DEBIT', amountMinor: compensatingAmountMinor, membershipId: compensatingMembershipId },
        { accountId: 'acc-1001', entryType: 'CREDIT', amountMinor: compensatingAmountMinor }
      ],
      postedBy: resolvedByUserId
    }, database);
    compensatingTxId = compTx.transactionId;
  }

  database.prepare(`
    UPDATE support_cases
    SET status = ?, assigned_agent_id = ?, resolution_notes = ?, compensating_transaction_id = ?, resolved_at = ?
    WHERE id = ?
  `).run(
    decision,
    resolvedByUserId,
    resolutionNotes,
    compensatingTxId,
    now,
    caseId
  );

  const updatedCase = database.prepare('SELECT * FROM support_cases WHERE id = ?').get(caseId);

  logAuditEvent({
    actorId: resolvedByUserId,
    action: 'DISPUTE_RESOLVED',
    objectType: 'support_cases',
    objectId: caseId,
    beforeState: existing,
    afterState: updatedCase,
    metadata: { decision, resolutionNotes, compensatingTxId },
    db: database
  });

  return updatedCase;
}

export function getAllSupportCases(db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT s.*, u.phone as raised_by_phone, p.display_name as raised_by_name,
           g.name as group_name
    FROM support_cases s
    JOIN users u ON s.raised_by_user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN chit_groups g ON s.group_id = g.id
    ORDER BY s.created_at DESC
  `).all();
}
