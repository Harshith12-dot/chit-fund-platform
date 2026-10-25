import test from 'node:test';
import assert from 'node:assert';
import { resetDatabaseForTest } from '../src/db/index.js';
import { postBalancedTransaction, getGroupReconciliation } from '../src/services/ledgerService.js';

test('Double-Entry Ledger - Balanced Transaction Invariant', async (t) => {
  const db = resetDatabaseForTest();

  // Seed sample user and chit group
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, phone, role, status, created_at)
    VALUES ('usr-1', '9000000000', 'ORGANIZER', 'ACTIVE', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version, status, created_at
    ) VALUES ('test-grp-1', 'usr-1', 'loc-1', 'Test Chit Group', 50000000, 2500000, 20, 20, 5, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?)
  `).run(now);

  await t.test('Successfully posts balanced transaction (Debit == Credit)', () => {
    const result = postBalancedTransaction({
      groupId: 'test-grp-1',
      sourceType: 'CONTRIBUTION_PAYMENT',
      sourceId: 'src-1',
      description: 'Member contribution payment',
      entries: [
        { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: 2500000 },
        { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: 2500000 }
      ],
      postedBy: 'test-user'
    }, db);

    assert.ok(result.transactionId);
    assert.strictEqual(result.totalAmountMinor, 2500000);
  });

  await t.test('Rejects unbalanced transaction (Debit != Credit)', () => {
    assert.throws(() => {
      postBalancedTransaction({
        groupId: 'test-grp-1',
        sourceType: 'CONTRIBUTION_PAYMENT',
        sourceId: 'src-2',
        description: 'Unbalanced payment',
        entries: [
          { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: 2500000 },
          { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: 2000000 } // ₹5,000 variance!
        ],
        postedBy: 'test-user'
      }, db);
    }, /Ledger balance invariant violated/);
  });

  await t.test('Rejects invalid negative or zero entry amounts', () => {
    assert.throws(() => {
      postBalancedTransaction({
        groupId: 'test-grp-1',
        sourceType: 'CONTRIBUTION_PAYMENT',
        sourceId: 'src-3',
        description: 'Zero amount entry',
        entries: [
          { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: 0 },
          { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: 0 }
        ],
        postedBy: 'test-user'
      }, db);
    }, /Invalid entry amount/);
  });

  await t.test('Group reconciliation report confirms 100% zero variance', () => {
    const recon = getGroupReconciliation('test-grp-1', db);
    assert.strictEqual(recon.isFullyBalanced, true);
    assert.strictEqual(recon.systemVariance, 0);
    assert.strictEqual(recon.totalSystemDebit, recon.totalSystemCredit);
  });
});
