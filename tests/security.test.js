import test from 'node:test';
import assert from 'node:assert';
import { resetDatabaseForTest } from '../src/db/index.js';
import { initiatePayout, approveAndDisbursePayout } from '../src/services/payoutService.js';
import { hasPermission } from '../src/services/authService.js';
import { logAuditEvent, computeHash } from '../src/services/auditService.js';

test('Security, RBAC & Maker-Checker Separation of Duties', async (t) => {
  const db = resetDatabaseForTest();
  const now = new Date().toISOString();

  // Seed Users
  db.prepare(`
    INSERT INTO users (id, phone, role, status, created_at)
    VALUES
    ('u-member', '9000000021', 'MEMBER', 'ACTIVE', ?),
    ('u-maker-ops', '9000000022', 'OPERATIONS_ADMIN', 'ACTIVE', ?),
    ('u-checker-fin', '9000000023', 'FINANCE_ADMIN', 'ACTIVE', ?)
  `).run(now, now, now);

  db.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version, status, created_at
    ) VALUES ('grp-sec', 'u-maker-ops', 'loc-1', 'Sec Group', 50000000, 2500000, 20, 5, 1, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO group_memberships (id, group_id, user_id, slot_number, role, status, has_won_auction, accepted_rules_version, joined_at)
    VALUES ('mem-sec', 'grp-sec', 'u-member', 1, 'MEMBER', 'ACTIVE', 1, '1.0', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO chit_cycles (id, group_id, sequence_no, due_at, auction_at, status, created_at)
    VALUES ('cyc-sec', 'grp-sec', 1, ?, ?, 'AUCTION_CLOSED', ?)
  `).run(now, now, now);

  db.prepare(`
    INSERT INTO payouts (
      id, cycle_id, winner_membership_id, beneficiary_user_id,
      gross_amount_minor, commission_deducted_minor, net_payout_minor,
      bank_account_masked, ifsc_code, approval_status
    ) VALUES (
      'pay-sec-1', 'cyc-sec', 'mem-sec', 'u-member',
      50000000, 2500000, 47500000, 'XXXX-1234', 'HDFC0001234', 'PENDING_APPROVAL'
    )
  `).run();

  await t.test('RBAC: verifies role permissions matrix', () => {
    assert.strictEqual(hasPermission('MEMBER', 'submit_bid'), true);
    assert.strictEqual(hasPermission('MEMBER', 'approve_payout'), false);
    assert.strictEqual(hasPermission('FINANCE_ADMIN', 'approve_payout'), true);
    assert.strictEqual(hasPermission('OPERATIONS_ADMIN', 'review_kyc'), true);
    assert.strictEqual(hasPermission('COLLECTOR', 'record_offline_payment'), true);
    assert.strictEqual(hasPermission('COLLECTOR', 'approve_payout'), false);
  });

  await t.test('Maker initiates payout successfully', () => {
    const updated = initiatePayout({
      payoutId: 'pay-sec-1',
      makerUserId: 'u-maker-ops'
    }, db);

    assert.strictEqual(updated.maker_user_id, 'u-maker-ops');
    assert.ok(updated.maker_initiated_at);
  });

  await t.test('Separation of Duties: Maker CANNOT approve their own payout', () => {
    // If u-maker-ops tries to approve their own initiated payout, it must throw!
    assert.throws(() => {
      approveAndDisbursePayout({
        payoutId: 'pay-sec-1',
        checkerUserId: 'u-maker-ops'
      }, db);
    }, /Only Finance Admins have statutory authority|Separation of Duties violation/);
  });

  await t.test('Checker (Finance Admin) approves payout and disburses', () => {
    const disbursed = approveAndDisbursePayout({
      payoutId: 'pay-sec-1',
      checkerUserId: 'u-checker-fin'
    }, db);

    assert.strictEqual(disbursed.approval_status, 'DISBURSED');
    assert.strictEqual(disbursed.checker_user_id, 'u-checker-fin');
    assert.ok(disbursed.provider_payout_ref);
  });

  await t.test('Tamper-evident audit logging records cryptographically valid SHA-256 state hashes', () => {
    const stateObj = { balance: 50000, status: 'VERIFIED' };
    const hash = computeHash(stateObj);
    assert.strictEqual(hash.length, 64);

    const auditLog = logAuditEvent({
      actorId: 'u-maker-ops',
      action: 'SECURITY_TEST_ACTION',
      objectType: 'test_obj',
      objectId: 'obj-123',
      afterState: stateObj,
      db
    });

    assert.strictEqual(auditLog.afterHash, hash);
  });
});
