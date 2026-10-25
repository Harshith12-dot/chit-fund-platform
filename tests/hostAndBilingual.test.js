import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/index.js';
import { seedDatabase } from '../src/seed/seedData.js';
import * as groupService from '../src/services/groupService.js';
import * as auctionService from '../src/services/auctionService.js';
import * as ledgerService from '../src/services/ledgerService.js';

describe('Host Desk Administration, Balanced Ledger & Government Governance', () => {
  let db;

  beforeEach(() => {
    db = resetDatabaseForTest();
    seedDatabase(db);
  });

  it('Calculates Host overview metrics and active cycles accurately', () => {
    // Organizer Lakshmi Devi is usr-organizer-1
    const overview = groupService.getHostOverview('usr-organizer-1', db);

    assert.ok(overview);
    assert.equal(typeof overview.totalGroups, 'number');
    assert.ok(overview.totalGroups >= 1, 'Should have at least 1 hosted group');
    assert.equal(typeof overview.totalMembers, 'number');
    assert.ok(overview.totalMembers >= 1, 'Should have enrolled members');
    assert.equal(typeof overview.totalCommissionMinor, 'number');
    assert.ok(Array.isArray(overview.groups), 'Groups should be an array');
    assert.ok(Array.isArray(overview.activeCycles), 'Active cycles should be an array');
  });

  it('Verifies Double-Entry general ledger trial balance has zero discrepancy', () => {
    const recon = ledgerService.getGroupReconciliation('grp-indiranagar-2026', db);

    assert.ok(recon);
    assert.equal(recon.isFullyBalanced, true);
    assert.equal(recon.systemVariance, 0);
    assert.equal(recon.totalSystemDebit, recon.totalSystemCredit);
    assert.ok(recon.chartOfAccounts.length >= 7, 'Should contain full chart of accounts 1001-4002');
  });

  it('Verifies government statutory accreditation parameters on chit groups', () => {
    const group = groupService.getGroupDetails('grp-indiranagar-2026', db);

    assert.ok(group);
    assert.equal(group.host_license_number, 'KA/BLR/REG/2026/0491');
    assert.equal(group.bank_guarantee_ref, 'BG-HDFC-992100');
    assert.ok(group.trust_score >= 95);
    assert.equal(group.min_bid_discount_minor, 2500000); // 5% = ₹25,000
    assert.equal(group.max_bid_discount_minor, 15000000); // 30% = ₹1,50,000
  });

  it('Enforces Host cycle administration: competitive bidding and finalizing close', () => {
    // Cyc-2 is AUCTION_ACTIVE in seed
    const cycle = db.prepare('SELECT * FROM chit_cycles WHERE id = ?').get('cyc-2');
    assert.ok(cycle);
    assert.equal(cycle.status, 'AUCTION_ACTIVE');

    // Submit higher competitive bid by Ramesh (mem-2)
    auctionService.submitBid({
      cycleId: 'cyc-2',
      membershipId: 'mem-2',
      bidDiscountMinor: 6000000, // ₹60,000
      actorUserId: 'usr-member-1'
    }, db);

    // Close auction
    const closed = auctionService.closeAuction({ cycleId: 'cyc-2', closedByUserId: 'usr-organizer-1' }, db);
    assert.equal(closed.cycle.status, 'AUCTION_CLOSED');
    assert.equal(closed.snapshotData.winningDiscount, 6000000);
    assert.ok(closed.snapshotData.dividendPerMember > 0);

    // Recheck ledger to ensure balanced invariant remains 100% true
    const reconAfter = ledgerService.getGroupReconciliation('grp-indiranagar-2026', db);
    assert.equal(reconAfter.isFullyBalanced, true);
    assert.equal(reconAfter.systemVariance, 0);
  });
});
