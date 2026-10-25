import test from 'node:test';
import assert from 'node:assert';
import { resetDatabaseForTest } from '../src/db/index.js';
import { startAuction, submitBid, closeAuction } from '../src/services/auctionService.js';

test('Auction Engine & Bidding Rules', async (t) => {
  const db = resetDatabaseForTest();
  const now = new Date().toISOString();

  // Seed User & Group
  db.prepare(`
    INSERT INTO users (id, phone, role, status, created_at)
    VALUES ('u-org', '9000000001', 'ORGANIZER', 'ACTIVE', ?),
           ('u-mem1', '9000000002', 'MEMBER', 'ACTIVE', ?),
           ('u-mem2', '9000000003', 'MEMBER', 'ACTIVE', ?)
  `).run(now, now, now);

  db.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version, status, created_at
    ) VALUES ('grp-auc', 'u-org', 'loc-1', 'Auction Test Group', 50000000, 2500000, 20, 5, 3, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?)
  `).run(now);

  db.prepare(`
    INSERT INTO group_memberships (id, group_id, user_id, slot_number, role, status, has_won_auction, accepted_rules_version, joined_at)
    VALUES ('m-1', 'grp-auc', 'u-org', 1, 'ORGANIZER', 'ACTIVE', 1, '1.0', ?), -- Org won cycle 1
           ('m-2', 'grp-auc', 'u-mem1', 2, 'MEMBER', 'ACTIVE', 0, '1.0', ?),
           ('m-3', 'grp-auc', 'u-mem2', 3, 'MEMBER', 'ACTIVE', 0, '1.0', ?)
  `).run(now, now, now);

  db.prepare(`
    INSERT INTO chit_cycles (id, group_id, sequence_no, due_at, auction_at, status, created_at)
    VALUES ('cyc-test', 'grp-auc', 2, ?, ?, 'AUCTION_SCHEDULED', ?)
  `).run(now, now, now);

  await t.test('Starts auction successfully', () => {
    const cycle = startAuction({ cycleId: 'cyc-test', startedByUserId: 'u-org' }, db);
    assert.strictEqual(cycle.status, 'AUCTION_ACTIVE');
  });

  await t.test('Rejects bid below minimum discount (5% = ₹25,000)', () => {
    assert.throws(() => {
      submitBid({
        cycleId: 'cyc-test',
        membershipId: 'm-2',
        bidDiscountMinor: 2000000, // ₹20,000 (below 25,000)
        actorUserId: 'u-mem1'
      }, db);
    }, /lower than the minimum allowed discount/);
  });

  await t.test('Rejects bid above statutory ceiling (30% = ₹1,50,000)', () => {
    assert.throws(() => {
      submitBid({
        cycleId: 'cyc-test',
        membershipId: 'm-2',
        bidDiscountMinor: 16000000, // ₹1,60,000 (exceeds 30% cap)
        actorUserId: 'u-mem1'
      }, db);
    }, /exceeds the statutory ceiling/);
  });

  await t.test('Rejects bids from member who already won a previous cycle', () => {
    assert.throws(() => {
      submitBid({
        cycleId: 'cyc-test',
        membershipId: 'm-1', // Has already won cycle 1!
        bidDiscountMinor: 3000000,
        actorUserId: 'u-org'
      }, db);
    }, /already won a chit auction/);
  });

  await t.test('Accepts valid competitive bids', () => {
    // Bid 1: Member 2 bids ₹40,000 discount
    const b1 = submitBid({
      cycleId: 'cyc-test',
      membershipId: 'm-2',
      bidDiscountMinor: 4000000,
      actorUserId: 'u-mem1'
    }, db);
    assert.strictEqual(b1.status, 'VALID');

    // Bid 2: Member 3 outbids with ₹50,000 discount
    const b2 = submitBid({
      cycleId: 'cyc-test',
      membershipId: 'm-3',
      bidDiscountMinor: 5000000,
      actorUserId: 'u-mem2'
    }, db);
    assert.strictEqual(b2.status, 'VALID');

    // Rejects bid lower or equal to current highest
    assert.throws(() => {
      submitBid({
        cycleId: 'cyc-test',
        membershipId: 'm-2',
        bidDiscountMinor: 4500000, // Lower than 50,000
        actorUserId: 'u-mem1'
      }, db);
    }, /must offer a discount higher than the current highest bid/);
  });

  await t.test('Closes auction, determines winner, computes dividends, and signs result', () => {
    const result = closeAuction({ cycleId: 'cyc-test', closedByUserId: 'u-org' }, db);

    // Winner should be Member 3 with ₹50,000 discount (5,000,000 paise)
    assert.strictEqual(result.cycle.winner_membership_id, 'm-3');
    assert.strictEqual(result.cycle.winning_bid_discount_minor, 5000000);

    // Total pool = ₹5,00,000 (50,000,000 paise)
    // Organizer commission = 5% of 5,00,000 = ₹25,000 (2,500,000 paise)
    assert.strictEqual(result.cycle.organizer_commission_minor, 2500000);

    // Dividend total = Winning Discount (50,000) - Commission (25,000) = ₹25,000 (2,500,000 paise)
    // Dividend per member = 25,000 / 5 members = ₹5,000 (500,000 paise)
    assert.strictEqual(result.cycle.dividend_per_member_minor, 500000);

    // Net payout to winner = 500000 - 50000 = ₹4,50,000 (45,000,000 paise)
    assert.strictEqual(result.cycle.payout_amount_minor, 45000000);

    // Cryptographic signature must be present
    assert.ok(result.resultSignature);
    assert.strictEqual(result.resultSignature.length, 64); // SHA-256 hex string
  });
});
