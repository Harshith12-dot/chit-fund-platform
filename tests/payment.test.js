import test from 'node:test';
import assert from 'node:assert';
import { resetDatabaseForTest } from '../src/db/index.js';
import { createPaymentIntent, processPaymentWebhook, recordCollectorCashPayment, submitMemberOfflineCashRequest, getPendingHostVerifications, verifyAndClearOfflineCash } from '../src/services/paymentService.js';
import { getGroupReconciliation } from '../src/services/ledgerService.js';

test('Payment Gateway, Webhooks & Idempotency', async (t) => {
  const db = resetDatabaseForTest();
  const now = new Date().toISOString();

  // Seed Users, Group, Cycle, Obligation
  db.prepare(`
    INSERT INTO users (id, phone, role, status, created_at)
    VALUES ('u-payer', '9111111111', 'MEMBER', 'ACTIVE', ?),
           ('u-coll', '9222222222', 'COLLECTOR', 'ACTIVE', ?)
  `).run(now, now);

  db.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version, status, created_at
    ) VALUES ('grp-pay', 'u-payer', 'loc-1', 'Payment Test Group', 50000000, 2500000, 20, 5, 1, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO group_memberships (id, group_id, user_id, slot_number, role, status, has_won_auction, accepted_rules_version, joined_at)
    VALUES ('m-pay', 'grp-pay', 'u-payer', 1, 'MEMBER', 'ACTIVE', 0, '1.0', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO chit_cycles (id, group_id, sequence_no, due_at, auction_at, status, created_at)
    VALUES ('cyc-pay', 'grp-pay', 1, ?, ?, 'OPEN_FOR_PAYMENT', ?)
  `).run(now, now, now);

  db.prepare(`
    INSERT INTO contribution_obligations (
      id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
      penalty_minor, net_payable_minor, amount_paid_minor, due_at, status
    ) VALUES ('obl-pay-1', 'cyc-pay', 'm-pay', 2500000, 0, 0, 2500000, 0, ?, 'PENDING')
  `).run(now);

  let intentId = null;
  const idempotencyKey = 'IDEMP-TEST-KEY-123';

  await t.test('Creates payment intent with UPI QR parameters', () => {
    const res = createPaymentIntent({
      obligationId: 'obl-pay-1',
      payerUserId: 'u-payer',
      paymentMethod: 'UPI_QR',
      idempotencyKey
    }, db);

    assert.ok(res.intent.id);
    assert.strictEqual(res.intent.amount_minor, 2500000);
    assert.strictEqual(res.upiPayload.cu, 'INR');
    assert.strictEqual(res.upiPayload.am, '25000.00');
    intentId = res.intent.id;
  });

  await t.test('Processes first payment webhook successfully & posts to ledger', () => {
    const res = processPaymentWebhook({
      intentId,
      providerRef: 'BANK-REF-9999',
      status: 'SUCCESS'
    }, db);

    assert.strictEqual(res.isDuplicate, false);
    assert.strictEqual(res.paymentIntent.status, 'SUCCESS');

    // Verify obligation status is now PAID
    const obl = db.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get('obl-pay-1');
    assert.strictEqual(obl.status, 'PAID');
    assert.strictEqual(obl.amount_paid_minor, 2500000);

    // Verify double-entry ledger is balanced
    const recon = getGroupReconciliation('grp-pay', db);
    assert.strictEqual(recon.isFullyBalanced, true);
    assert.strictEqual(recon.totalTransactions, 1);
  });

  await t.test('Idempotency: Re-delivery of identical webhook does NOT double-post or alter ledger', () => {
    const res = processPaymentWebhook({
      intentId,
      providerRef: 'BANK-REF-9999',
      status: 'SUCCESS'
    }, db);

    // Must be recognized as duplicate
    assert.strictEqual(res.isDuplicate, true);

    // Transaction count in ledger MUST still be 1 (no double ledger entry!)
    const recon = getGroupReconciliation('grp-pay', db);
    assert.strictEqual(recon.totalTransactions, 1);
    assert.strictEqual(recon.totalSystemDebit, 2500000);
    assert.strictEqual(recon.isFullyBalanced, true);
  });

  await t.test('Field Agent assisted cash payment is recorded on the same ledger', () => {
    // Add second member for cycle
    db.prepare(`
      INSERT INTO users (id, phone, role, status, created_at)
      VALUES ('u-payer-2', '9333333333', 'MEMBER', 'ACTIVE', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO group_memberships (id, group_id, user_id, slot_number, role, status, has_won_auction, accepted_rules_version, joined_at)
      VALUES ('m-pay-2', 'grp-pay', 'u-payer-2', 2, 'MEMBER', 'ACTIVE', 0, '1.0', ?)
    `).run(now);

    // Create second member's obligation
    db.prepare(`
      INSERT INTO contribution_obligations (
        id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
        penalty_minor, net_payable_minor, amount_paid_minor, due_at, status
      ) VALUES ('obl-pay-2', 'cyc-pay', 'm-pay-2', 2500000, 0, 0, 2500000, 0, ?, 'PENDING')
    `).run(now);

    const cashRes = recordCollectorCashPayment({
      obligationId: 'obl-pay-2',
      collectorUserId: 'u-coll',
      notes: 'Received in person at market'
    }, db);

    assert.strictEqual(cashRes.paymentIntent.status, 'SUCCESS');
    assert.strictEqual(cashRes.paymentIntent.payment_method, 'CASH_FIELD_AGENT');

    // Both cash and digital transactions reconcile onto single balanced ledger
    const recon = getGroupReconciliation('grp-pay', db);
    assert.strictEqual(recon.totalTransactions, 2);
    assert.strictEqual(recon.totalSystemDebit, 5000000);
    assert.strictEqual(recon.isFullyBalanced, true);
  });

  await t.test('Host Offline Cash Verification: Member submits cash -> Host verifies & clears dues', () => {
    // Add third member and obligation
    db.prepare(`
      INSERT INTO users (id, phone, role, status, created_at)
      VALUES ('u-payer-3', '9444444444', 'MEMBER', 'ACTIVE', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
      VALUES ('u-payer-3', 'Test Payer 3', ?, ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO group_memberships (id, group_id, user_id, slot_number, role, status, has_won_auction, accepted_rules_version, joined_at)
      VALUES ('m-pay-3', 'grp-pay', 'u-payer-3', 3, 'MEMBER', 'ACTIVE', 0, '1.0', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO contribution_obligations (
        id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
        penalty_minor, net_payable_minor, amount_paid_minor, due_at, status
      ) VALUES ('obl-pay-3', 'cyc-pay', 'm-pay-3', 2500000, 0, 0, 2500000, 0, ?, 'PENDING')
    `).run(now);

    // 1. Member submits cash payment request
    const offlineReq = submitMemberOfflineCashRequest({
      obligationId: 'obl-pay-3',
      payerUserId: 'u-payer-3',
      notes: 'Handed cash ₹25,000 at Indiranagar shop'
    }, db);

    assert.strictEqual(offlineReq.status, 'PENDING_HOST_VERIFICATION');

    // 2. Host queries pending verifications queue
    const pendingList = getPendingHostVerifications('u-payer', db); // u-payer is organizer of grp-pay
    assert.ok(pendingList.some(p => p.id === offlineReq.id));

    // 3. Unauthorized user cannot verify
    assert.throws(() => {
      verifyAndClearOfflineCash({
        intentId: offlineReq.id,
        hostUserId: 'u-payer-3' // Regular member, not host!
      }, db);
    }, /Only the designated Chit Host or Operations Admin can verify/);

    // 4. Authorized Host verifies and clears dues
    const clearResult = verifyAndClearOfflineCash({
      intentId: offlineReq.id,
      hostUserId: 'u-payer' // Host of grp-pay
    }, db);

    assert.strictEqual(clearResult.success, true);
    assert.strictEqual(clearResult.paymentIntent.status, 'SUCCESS');
    assert.ok(clearResult.receiptNo.startsWith('CASH-RCPT-'));

    // Obligation is now PAID
    const updatedObl = db.prepare('SELECT * FROM contribution_obligations WHERE id = ?').get('obl-pay-3');
    assert.strictEqual(updatedObl.status, 'PAID');
    assert.strictEqual(updatedObl.amount_paid_minor, 2500000);

    // Ledger balances with all 3 transactions
    const recon = getGroupReconciliation('grp-pay', db);
    assert.strictEqual(recon.totalTransactions, 3);
    assert.strictEqual(recon.totalSystemDebit, 7500000);
    assert.strictEqual(recon.isFullyBalanced, true);
  });
});
