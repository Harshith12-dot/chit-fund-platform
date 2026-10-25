import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabaseForTest } from '../src/db/index.js';
import { seedDatabase } from '../src/seed/seedData.js';
import * as auctionService from '../src/services/auctionService.js';
import * as suretyService from '../src/services/suretyService.js';
import * as portfolioService from '../src/services/portfolioService.js';

describe('Multi-Chit Portfolio, Bidding Room & Surety Guarantees', () => {
  let db;

  beforeEach(() => {
    db = resetDatabaseForTest();
    seedDatabase(db);
  });

  it('Calculates multi-chit portfolio accurately for member with multiple tickets', () => {
    // Ramesh Kumar (usr-member-1) has memberships in Indiranagar Chit (mem-2, slot 2) and HSR Chit (mem-g3-ramesh, slot 7)
    const portfolio = portfolioService.getUserPortfolio('usr-member-1', db);

    assert.ok(portfolio.summary);
    assert.equal(portfolio.summary.totalChitsEnrolled, 2, 'Ramesh should be enrolled in 2 chits');
    assert.equal(portfolio.summary.totalSubscribedValueMinor, 70000000, 'Total pool: ₹5,00,000 + ₹2,00,000 = ₹7,00,000');
    assert.equal(portfolio.summary.totalMonthlyCommitmentMinor, 3500000, 'Monthly commitment: ₹25,000 + ₹10,000 = ₹35,000');
    assert.equal(portfolio.enrolledChits.length, 2);

    const indiranagarChit = portfolio.enrolledChits.find(c => c.group.name.includes('Indiranagar'));
    assert.ok(indiranagarChit);
    assert.equal(indiranagarChit.ticketSlot, 2);
    assert.equal(indiranagarChit.subscriberStatus, 'NON_PRIZED_SUBSCRIBER');
  });

  it('Retrieves comprehensive live bidding room state with financial calculations', () => {
    const state = auctionService.getBiddingRoomState({ cycleId: 'cyc-2', userId: 'usr-member-1' }, db);

    assert.ok(state.cycle);
    assert.ok(state.group);
    assert.ok(state.financials);
    assert.ok(state.userMembership);
    assert.equal(state.userMembership.slotNumber, 2);
    assert.equal(state.userMembership.isEligibleToBid, true);

    // Highest bid in seed is ₹45,000 (4500000 paise) by Priya
    assert.equal(state.highestBid.bid_discount_minor, 4500000);
    assert.equal(state.financials.currentDiscountMinor, 4500000);
    // Net take home = 50,00,000 - 45,00,00 = 45,50,000 paise (₹4,55,000)
    assert.equal(state.financials.netTakeHomeWinnerMinor, 45500000);
    // Total dividend = 45,00,00 - 25,00,00 (5% commission) = 20,00,00 paise (₹20,000)
    assert.equal(state.financials.totalDividendMinor, 2000000);
  });

  it('Simulates competitor bidding dynamically from an eligible member', () => {
    // Current highest is ₹45,000 in cyc-2
    const simulatedBid = auctionService.simulateCompetitorBid({ cycleId: 'cyc-2' }, db);

    assert.ok(simulatedBid);
    assert.ok(simulatedBid.bid_discount_minor > 4500000, 'Simulated bid must be higher than ₹45,000');
    assert.equal(simulatedBid.cycle_id, 'cyc-2');
  });

  it('Allows tied bids at maximum statutory ceiling and executes fair lottery draw', () => {
    // Group max discount ceiling is ₹1,50,000 (15000000 paise, 30%)
    // Ramesh (mem-2) bids maximum ceiling
    auctionService.submitBid({
      cycleId: 'cyc-2',
      membershipId: 'mem-2',
      bidDiscountMinor: 15000000,
      actorUserId: 'usr-member-1'
    }, db);

    // Priya (mem-3) also bids maximum ceiling -> accepted as tied ceiling bid!
    auctionService.submitBid({
      cycleId: 'cyc-2',
      membershipId: 'mem-3',
      bidDiscountMinor: 15000000,
      actorUserId: 'usr-member-2'
    }, db);

    const state = auctionService.getBiddingRoomState({ cycleId: 'cyc-2', userId: 'usr-member-1' }, db);
    assert.equal(state.isLotteryRequired, true, 'Lottery must be required when 2 members tie at 30% cap');
    assert.equal(state.tiedCeilingMembers.length, 2);

    // Draw lottery
    const lotteryResult = auctionService.drawAuctionLottery({ cycleId: 'cyc-2', drawnByUserId: 'usr-organizer-1' }, db);
    assert.ok(lotteryResult.winner);
    assert.ok(['mem-2', 'mem-3'].includes(lotteryResult.winner.membershipId));
    assert.equal(lotteryResult.winner.discountMinor, 15000000);
  });

  it('Enforces Section 31 surety submission and Host verification before payout release', () => {
    // Check seeded surety submitted by Priya for Jayanagar chit payout
    const pendingSureties = suretyService.getPendingSuretiesForHost('usr-organizer-1', db);
    assert.ok(pendingSureties.length >= 1, 'Host should see pending surety submitted by Priya');

    const priyaSurety = pendingSureties.find(s => s.user_id === 'usr-member-2');
    assert.ok(priyaSurety);
    assert.equal(priyaSurety.surety_type, 'CO_GUARANTOR');
    assert.equal(priyaSurety.guarantor_name, 'Dr. Sunita Rao');

    // Host Lakshmi Devi verifies and approves the surety
    const verified = suretyService.verifySurety({
      suretyId: priyaSurety.id,
      hostUserId: 'usr-organizer-1',
      approved: true
    }, db);

    assert.equal(verified.status, 'APPROVED');
    assert.equal(verified.verified_by_host_id, 'usr-organizer-1');

    // Payout record should now be marked APPROVED
    const payout = db.prepare('SELECT * FROM payouts WHERE id = ?').get(priyaSurety.payout_id);
    assert.equal(payout.approval_status, 'APPROVED');
  });
});
