import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';
import { postBalancedTransaction } from './ledgerService.js';

export function createPaymentIntent({
  obligationId,
  payerUserId,
  paymentMethod = 'UPI_QR',
  collectorId = null,
  idempotencyKey = null
}, db = null) {
  const database = db || getDatabase();
  const obligation = database.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get(obligationId);
  if (!obligation) throw new Error('Contribution obligation not found.');

  if (obligation.status === 'PAID') {
    throw new Error('This obligation has already been paid in full.');
  }

  const key = idempotencyKey || 'idemp-' + randomUUID();

  // Check existing intent by idempotency key
  const existing = database.prepare('SELECT * FROM payment_intents WHERE idempotency_key = ?').get(key);
  if (existing) {
    return existing;
  }

  const intentId = 'pi-' + randomUUID();
  const now = new Date().toISOString();
  const amountMinor = obligation.net_payable_minor - obligation.amount_paid_minor;

  database.prepare(`
    INSERT INTO payment_intents (
      id, obligation_id, payer_user_id, amount_minor, payment_method,
      collector_id, provider_ref, idempotency_key, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'CREATED', ?)
  `).run(
    intentId,
    obligationId,
    payerUserId,
    amountMinor,
    paymentMethod,
    collectorId,
    key,
    now
  );

  const intent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);

  return {
    intent,
    upiPayload: {
      pa: 'indiranagar.chitfund@upi',
      pn: 'Indiranagar Local Chit Fund',
      am: (amountMinor / 100).toFixed(2),
      cu: 'INR',
      tn: `Chit Contribution Obligation #${obligation.id.slice(0, 8)}`,
      tr: intentId
    }
  };
}

export function processPaymentWebhook({
  intentId,
  providerRef,
  status = 'SUCCESS',
  idempotencyKey = null
}, db = null) {
  const database = db || getDatabase();

  // Retrieve payment intent
  let intent = null;
  if (idempotencyKey) {
    intent = database.prepare('SELECT * FROM payment_intents WHERE idempotency_key = ?').get(idempotencyKey);
  }
  if (!intent && intentId) {
    intent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);
  }

  if (!intent) {
    throw new Error('Payment intent not found.');
  }

  // Idempotency: If already settled as SUCCESS, return immediately to prevent double-posting
  if (intent.status === 'SUCCESS') {
    return {
      message: 'Payment was already processed idempotently.',
      paymentIntent: intent,
      isDuplicate: true
    };
  }

  const now = new Date().toISOString();
  const finalRef = providerRef || 'UPI-REF-' + Math.floor(1000000000 + Math.random() * 9000000000);

  if (status !== 'SUCCESS') {
    database.prepare(`
      UPDATE payment_intents
      SET status = 'FAILED', provider_ref = ?
      WHERE id = ?
    `).run(finalRef, intent.id);
    return { message: 'Payment marked as failed.', paymentIntent: intent, isDuplicate: false };
  }

  // Mark payment intent as SUCCESS
  database.prepare(`
    UPDATE payment_intents
    SET status = 'SUCCESS', provider_ref = ?, settled_at = ?
    WHERE id = ?
  `).run(finalRef, now, intent.id);

  // Update Obligation
  const obligation = database.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get(intent.obligation_id);
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(obligation.cycle_id);
  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(obligation.membership_id);

  const newAmountPaid = obligation.amount_paid_minor + intent.amount_minor;
  const isPaidInFull = newAmountPaid >= obligation.net_payable_minor;

  database.prepare(`
    UPDATE contribution_obligations
    SET amount_paid_minor = ?,
        status = ?,
        paid_at = ?
    WHERE id = ?
  `).run(
    newAmountPaid,
    isPaidInFull ? 'PAID' : 'PARTIAL',
    now,
    obligation.id
  );

  // Post Balanced Double-Entry Transaction to Ledger:
  // Debit: Chit Pool Bank Account (acc-1001) = amountMinor
  // Credit: Member Receivables (acc-1002) = amountMinor (assigned to member)
  postBalancedTransaction({
    groupId: cycle.group_id,
    cycleId: cycle.id,
    sourceType: 'CONTRIBUTION_PAYMENT',
    sourceId: intent.id,
    description: `Contribution payment for Cycle #${cycle.sequence_no} by Slot #${membership.slot_number} via ${intent.payment_method}`,
    entries: [
      { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: intent.amount_minor },
      { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: intent.amount_minor, membershipId: membership.id }
    ],
    postedBy: intent.payer_user_id
  }, database);

  // Resolve any existing delinquency for this obligation
  database.prepare(`
    UPDATE delinquencies
    SET status = 'RESOLVED', resolved_at = ?
    WHERE obligation_id = ? AND status != 'RESOLVED'
  `).run(now, obligation.id);

  const updatedIntent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intent.id);

  logAuditEvent({
    actorId: intent.payer_user_id,
    action: 'PAYMENT_SETTLED',
    objectType: 'payment_intents',
    objectId: intent.id,
    afterState: updatedIntent,
    metadata: {
      amountMinor: intent.amount_minor,
      obligationId: obligation.id,
      providerRef: finalRef
    },
    db: database
  });

  return {
    message: 'Payment settled successfully and posted to balanced ledger.',
    paymentIntent: updatedIntent,
    isDuplicate: false
  };
}

export function recordCollectorCashPayment({
  obligationId,
  collectorUserId,
  notes = ''
}, db = null) {
  const database = db || getDatabase();

  const collector = database.prepare('SELECT * FROM users WHERE id = ?').get(collectorUserId);
  if (!collector || !['COLLECTOR', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(collector.role)) {
    throw new Error('Only authorized field collectors or operations admins can record offline cash payments.');
  }

  const obligation = database.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get(obligationId);
  if (!obligation) throw new Error('Obligation not found.');

  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(obligation.membership_id);

  // Create payment intent for cash receipt
  const receiptNumber = 'RCPT-' + Math.floor(100000 + Math.random() * 900000);
  const { intent } = createPaymentIntent({
    obligationId,
    payerUserId: membership.user_id,
    paymentMethod: 'CASH_FIELD_AGENT',
    collectorId: collectorUserId,
    idempotencyKey: receiptNumber
  }, database);

  // Process the settlement
  return processPaymentWebhook({
    intentId: intent.id,
    providerRef: receiptNumber,
    status: 'SUCCESS'
  }, database);
}

export function submitMemberOfflineCashRequest({ obligationId, payerUserId, notes = '' }, db = null) {
  const database = db || getDatabase();
  const obligation = database.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get(obligationId);
  if (!obligation) throw new Error('Contribution obligation not found.');

  if (obligation.status === 'PAID') {
    throw new Error('This obligation has already been paid in full.');
  }

  const intentId = 'pi-offline-' + randomUUID();
  const key = 'IDEMP-OFFLINE-' + randomUUID();
  const now = new Date().toISOString();
  const amountMinor = obligation.net_payable_minor - obligation.amount_paid_minor;

  database.prepare(`
    INSERT INTO payment_intents (
      id, obligation_id, payer_user_id, amount_minor, payment_method,
      collector_id, verified_by_host_id, offline_notes, provider_ref, idempotency_key, status, created_at
    ) VALUES (?, ?, ?, ?, 'OFFLINE_DIRECT_HOST', NULL, NULL, ?, NULL, ?, 'PENDING_HOST_VERIFICATION', ?)
  `).run(
    intentId,
    obligationId,
    payerUserId,
    amountMinor,
    notes,
    key,
    now
  );

  const intent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);

  logAuditEvent({
    actorId: payerUserId,
    action: 'OFFLINE_PAYMENT_SUBMITTED_FOR_VERIFICATION',
    objectType: 'payment_intents',
    objectId: intentId,
    metadata: { obligationId, amountMinor, notes },
    db: database
  });

  return intent;
}

export function getPendingHostVerifications(hostUserId = null, db = null) {
  const database = db || getDatabase();
  let query = `
    SELECT pi.*, o.cycle_id, o.net_payable_minor,
           c.sequence_no as cycle_sequence_no,
           g.id as group_id, g.name as group_name, g.organizer_id,
           u.phone as payer_phone, prof.display_name as payer_name,
           m.slot_number
    FROM payment_intents pi
    JOIN contribution_obligations o ON pi.obligation_id = o.id
    JOIN chit_cycles c ON o.cycle_id = c.id
    JOIN chit_groups g ON c.group_id = g.id
    JOIN group_memberships m ON o.membership_id = m.id
    JOIN users u ON pi.payer_user_id = u.id
    JOIN user_profiles prof ON u.id = prof.user_id
    WHERE pi.status = 'PENDING_HOST_VERIFICATION'
  `;

  const params = [];
  if (hostUserId) {
    query += ` AND (g.organizer_id = ? OR EXISTS (SELECT 1 FROM users WHERE id = ? AND role IN ('OPERATIONS_ADMIN', 'SUPER_ADMIN')))`;
    params.push(hostUserId, hostUserId);
  }

  query += ` ORDER BY pi.created_at ASC`;
  return database.prepare(query).all(...params);
}

export function verifyAndClearOfflineCash({ intentId, hostUserId }, db = null) {
  const database = db || getDatabase();
  const intent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);
  if (!intent) throw new Error('Payment intent not found.');

  if (intent.status === 'SUCCESS') {
    throw new Error('This payment has already been verified and settled.');
  }

  const obligation = database.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get(intent.obligation_id);
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(obligation.cycle_id);
  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);
  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(obligation.membership_id);

  // Validate Host authority
  const host = database.prepare('SELECT * FROM users WHERE id = ?').get(hostUserId);
  if (!host || (host.id !== group.organizer_id && !['OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(host.role))) {
    throw new Error('Only the designated Chit Host or Operations Admin can verify and mark this offline payment as completed.');
  }

  const now = new Date().toISOString();
  const receiptNo = 'CASH-RCPT-' + Math.floor(100000 + Math.random() * 900000);

  // Update intent
  database.prepare(`
    UPDATE payment_intents
    SET status = 'SUCCESS',
        verified_by_host_id = ?,
        provider_ref = ?,
        settled_at = ?
    WHERE id = ?
  `).run(hostUserId, receiptNo, now, intentId);

  // Update obligation
  const newAmountPaid = obligation.amount_paid_minor + intent.amount_minor;
  database.prepare(`
    UPDATE contribution_obligations
    SET amount_paid_minor = ?,
        status = 'PAID',
        paid_at = ?
    WHERE id = ?
  `).run(newAmountPaid, now, obligation.id);

  // Post Balanced Double-Entry Transaction to General Ledger
  postBalancedTransaction({
    groupId: group.id,
    cycleId: cycle.id,
    sourceType: 'CONTRIBUTION_PAYMENT',
    sourceId: intent.id,
    description: `Verified offline cash payment for Cycle #${cycle.sequence_no} by Slot #${membership.slot_number} (Confirmed by Host: ${host.phone})`,
    entries: [
      { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: intent.amount_minor },
      { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: intent.amount_minor, membershipId: membership.id }
    ],
    postedBy: hostUserId
  }, database);

  // Resolve any existing delinquency
  database.prepare(`
    UPDATE delinquencies
    SET status = 'RESOLVED', resolved_at = ?
    WHERE obligation_id = ? AND status != 'RESOLVED'
  `).run(now, obligation.id);

  const updatedIntent = database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);

  logAuditEvent({
    actorId: hostUserId,
    action: 'OFFLINE_PAYMENT_VERIFIED_AND_CLEARED_BY_HOST',
    objectType: 'payment_intents',
    objectId: intentId,
    afterState: updatedIntent,
    metadata: { receiptNo, amountMinor: intent.amount_minor, membershipId: membership.id },
    db: database
  });

  return {
    success: true,
    message: 'Offline cash payment verified and cleared successfully. Digital receipt issued and ledger balanced.',
    receiptNo,
    paymentIntent: updatedIntent
  };
}
