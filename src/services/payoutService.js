import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';
import { postBalancedTransaction } from './ledgerService.js';

export function initiatePayout({ payoutId, makerUserId }, db = null) {
  const database = db || getDatabase();
  const payout = database.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId);
  if (!payout) throw new Error('Payout record not found.');

  if (payout.approval_status !== 'PENDING_APPROVAL') {
    throw new Error(`Payout cannot be initiated in status ${payout.approval_status}.`);
  }

  const maker = database.prepare('SELECT * FROM users WHERE id = ?').get(makerUserId);
  if (!maker || !['OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPER_ADMIN'].includes(maker.role)) {
    throw new Error('Only Operations or Finance administrators can initiate payout processing.');
  }

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE payouts
    SET maker_user_id = ?, maker_initiated_at = ?
    WHERE id = ?
  `).run(makerUserId, now, payoutId);

  const updated = database.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId);

  logAuditEvent({
    actorId: makerUserId,
    action: 'PAYOUT_INITIATED_BY_MAKER',
    objectType: 'payouts',
    objectId: payoutId,
    afterState: updated,
    db: database
  });

  return updated;
}

export function approveAndDisbursePayout({ payoutId, checkerUserId }, db = null) {
  const database = db || getDatabase();
  const payout = database.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId);
  if (!payout) throw new Error('Payout record not found.');

  if (['APPROVED', 'DISBURSED'].includes(payout.approval_status)) {
    throw new Error('Payout has already been approved or disbursed.');
  }

  const checker = database.prepare('SELECT * FROM users WHERE id = ?').get(checkerUserId);
  if (!checker || !['FINANCE_ADMIN', 'SUPER_ADMIN'].includes(checker.role)) {
    throw new Error('Only Finance Admins have statutory authority to approve and disburse payouts.');
  }

  // Separation of duties rule: Maker cannot be Checker unless SUPER_ADMIN override
  if (payout.maker_user_id && payout.maker_user_id === checkerUserId && checker.role !== 'SUPER_ADMIN') {
    throw new Error(
      'Separation of Duties violation: The administrator who initiated this payout (Maker) cannot approve it (Checker).'
    );
  }

  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(payout.cycle_id);
  const now = new Date().toISOString();
  const bankRef = 'IMPS-' + Math.floor(1000000000 + Math.random() * 9000000000);

  database.prepare(`
    UPDATE payouts
    SET checker_user_id = ?,
        checker_approved_at = ?,
        approval_status = 'DISBURSED',
        provider_payout_ref = ?,
        disbursed_at = ?
    WHERE id = ?
  `).run(checkerUserId, now, bankRef, now, payoutId);

  // Post Double-Entry Ledger Transaction:
  // Debit: Prize Money Payable (acc-2001) = net_payout_minor
  // Credit: Chit Pool Bank Account (acc-1001) = net_payout_minor
  postBalancedTransaction({
    groupId: cycle.group_id,
    cycleId: cycle.id,
    sourceType: 'PAYOUT_DISBURSEMENT',
    sourceId: payoutId,
    description: `Disbursement of Cycle #${cycle.sequence_no} prize money to Winner via IMPS Ref ${bankRef}`,
    entries: [
      { accountId: 'acc-2001', entryType: 'DEBIT', amountMinor: payout.net_payout_minor, membershipId: payout.winner_membership_id },
      { accountId: 'acc-1001', entryType: 'CREDIT', amountMinor: payout.net_payout_minor }
    ],
    postedBy: checkerUserId
  }, database);

  // Mark cycle as SETTLED
  database.prepare("UPDATE chit_cycles SET status = 'SETTLED' WHERE id = ?").run(cycle.id);

  const disbursed = database.prepare('SELECT * FROM payouts WHERE id = ?').get(payoutId);

  logAuditEvent({
    actorId: checkerUserId,
    action: 'PAYOUT_APPROVED_AND_DISBURSED',
    objectType: 'payouts',
    objectId: payoutId,
    afterState: disbursed,
    metadata: { bankRef, netPayoutMinor: payout.net_payout_minor },
    db: database
  });

  return disbursed;
}

export function getAllPayouts(db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT p.*, c.sequence_no as cycle_sequence_no, g.name as group_name,
           u.phone as winner_phone, prof.display_name as winner_name,
           m_user.phone as maker_phone, c_user.phone as checker_phone
    FROM payouts p
    JOIN chit_cycles c ON p.cycle_id = c.id
    JOIN chit_groups g ON c.group_id = g.id
    JOIN users u ON p.beneficiary_user_id = u.id
    JOIN user_profiles prof ON u.id = prof.user_id
    LEFT JOIN users m_user ON p.maker_user_id = m_user.id
    LEFT JOIN users c_user ON p.checker_user_id = c_user.id
    ORDER BY p.id DESC
  `).all();
}
