import { createHmac, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';
import { postBalancedTransaction } from './ledgerService.js';

const HMAC_SECRET = 'CHIT_FUND_AUCTION_SIGNATURE_KEY_2026';

export function startAuction({ cycleId, startedByUserId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Chit cycle not found.');

  if (['AUCTION_CLOSED', 'SETTLED'].includes(cycle.status)) {
    throw new Error(`Cannot start auction for cycle in status ${cycle.status}.`);
  }

  database.prepare("UPDATE chit_cycles SET status = 'AUCTION_ACTIVE' WHERE id = ?").run(cycleId);

  const updatedCycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);

  logAuditEvent({
    actorId: startedByUserId,
    action: 'AUCTION_STARTED',
    objectType: 'chit_cycles',
    objectId: cycleId,
    afterState: updatedCycle,
    db: database
  });

  return updatedCycle;
}

export function submitBid({ cycleId, membershipId, bidDiscountMinor, actorUserId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  if (cycle.status !== 'AUCTION_ACTIVE') {
    throw new Error(`Auction is not active (Current status: ${cycle.status}). Bids cannot be accepted.`);
  }

  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(membershipId);
  if (!membership || membership.group_id !== cycle.group_id) {
    throw new Error('Membership is invalid for this chit group.');
  }

  if (membership.status !== 'ACTIVE') {
    throw new Error(`Member is not in ACTIVE status (Current: ${membership.status}).`);
  }

  // Eligibility Rule 1: Member must not have already won a previous cycle
  if (membership.has_won_auction === 1) {
    throw new Error('Member has already won a chit auction in a previous cycle of this group.');
  }

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);
  const discount = Number(bidDiscountMinor);

  // Eligibility Rule 2: Minimum discount
  if (discount < group.min_bid_discount_minor) {
    throw new Error(
      `Bid discount ₹${(discount / 100).toFixed(2)} is lower than the minimum allowed discount ₹${(group.min_bid_discount_minor / 100).toFixed(2)}.`
    );
  }

  // Eligibility Rule 3: Statutory maximum ceiling (30% under Chit Funds Act 1982)
  if (discount > group.max_bid_discount_minor) {
    throw new Error(
      `Bid discount ₹${(discount / 100).toFixed(2)} exceeds the statutory ceiling ₹${(group.max_bid_discount_minor / 100).toFixed(2)} (30% cap).`
    );
  }

  // Check current highest bid
  const currentHighest = database.prepare(`
    SELECT MAX(bid_discount_minor) as highest FROM bids
    WHERE cycle_id = ? AND status = 'VALID'
  `).get(cycleId);

  if (currentHighest && currentHighest.highest !== null) {
    if (discount < currentHighest.highest) {
      throw new Error(
        `Bid must offer a discount higher than the current highest bid ₹${(currentHighest.highest / 100).toFixed(2)}.`
      );
    }
    // If equal to current highest, only allow if both are at statutory max ceiling (tied ceiling bid)
    if (discount === currentHighest.highest) {
      if (discount < group.max_bid_discount_minor) {
        throw new Error(
          `Bid must offer a discount higher than the current highest bid ₹${(currentHighest.highest / 100).toFixed(2)}.`
        );
      }
      // Check if this member has already placed a ceiling bid
      const existingCeilingBid = database.prepare(`
        SELECT * FROM bids
        WHERE cycle_id = ? AND membership_id = ? AND bid_discount_minor = ? AND status = 'VALID'
      `).get(cycleId, membershipId, discount);
      if (existingCeilingBid) {
        throw new Error('You have already placed a bid at the maximum statutory ceiling.');
      }
    }
  }

  const bidId = 'bid-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO bids (id, cycle_id, membership_id, bid_discount_minor, submitted_at, status, is_winning)
    VALUES (?, ?, ?, ?, ?, 'VALID', 0)
  `).run(bidId, cycleId, membershipId, discount, now);

  const newBid = database.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);

  logAuditEvent({
    actorId: actorUserId,
    action: 'BID_SUBMITTED',
    objectType: 'bids',
    objectId: bidId,
    afterState: newBid,
    metadata: { discountMinor: discount, cycleId },
    db: database
  });

  return newBid;
}

export function closeAuction({ cycleId, closedByUserId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  if (cycle.status !== 'AUCTION_ACTIVE') {
    throw new Error(`Cycle cannot be closed from state ${cycle.status}. It must be AUCTION_ACTIVE.`);
  }

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);

  // Find winning bid: Highest discount offered. Tie-break: earliest submitted_at
  const winningBid = database.prepare(`
    SELECT * FROM bids
    WHERE cycle_id = ? AND status = 'VALID'
    ORDER BY bid_discount_minor DESC, submitted_at ASC
    LIMIT 1
  `).get(cycleId);

  let winningMembershipId = null;
  let winningDiscount = 0;

  if (winningBid) {
    winningMembershipId = winningBid.membership_id;
    winningDiscount = winningBid.bid_discount_minor;
  } else {
    // If no bids submitted, organizer or lottery picks the first eligible member with min discount
    const eligibleMember = database.prepare(`
      SELECT * FROM group_memberships
      WHERE group_id = ? AND status = 'ACTIVE' AND has_won_auction = 0
      ORDER BY slot_number ASC
      LIMIT 1
    `).get(group.id);

    if (!eligibleMember) {
      throw new Error('No eligible members remaining to win this auction.');
    }
    winningMembershipId = eligibleMember.id;
    winningDiscount = group.min_bid_discount_minor;
  }

  // Calculate Chit Financials
  // Pool = Total Pool
  // Commission = 5% of Pool
  // Dividend Total = Winning Discount - Commission
  // Dividend Per Member = Dividend Total / Total Members
  // Winner Payout = Pool - Winning Discount
  const totalPool = group.total_pool_minor;
  const commission = Math.round(totalPool * group.organizer_commission_rate);
  const dividendTotal = Math.max(0, winningDiscount - commission);
  const dividendPerMember = Math.floor(dividendTotal / group.max_members);
  const netPayout = totalPool - winningDiscount;

  const now = new Date().toISOString();

  // Cryptographic result snapshot
  const snapshotData = {
    cycleId,
    groupId: group.id,
    sequenceNo: cycle.sequence_no,
    winnerMembershipId: winningMembershipId,
    winningDiscount,
    commission,
    dividendPerMember,
    netPayout,
    closedAt: now
  };
  const resultSignature = createHmac('sha256', HMAC_SECRET)
    .update(JSON.stringify(snapshotData))
    .digest('hex');

  // Update winning bid flag
  if (winningBid) {
    database.prepare("UPDATE bids SET is_winning = 1, status = 'WINNING' WHERE id = ?").run(winningBid.id);
  }

  // Update cycle state
  database.prepare(`
    UPDATE chit_cycles
    SET status = 'AUCTION_CLOSED',
        winner_membership_id = ?,
        winning_bid_discount_minor = ?,
        dividend_per_member_minor = ?,
        organizer_commission_minor = ?,
        payout_amount_minor = ?,
        result_signature = ?
    WHERE id = ?
  `).run(
    winningMembershipId,
    winningDiscount,
    dividendPerMember,
    commission,
    netPayout,
    resultSignature,
    cycleId
  );

  // Mark member as having won
  database.prepare(`
    UPDATE group_memberships
    SET has_won_auction = 1, won_cycle_id = ?
    WHERE id = ?
  `).run(cycleId, winningMembershipId);

  // Post Double-Entry Ledger Transaction for Auction Settlement
  // Debit: Members Capital Pool (acc-3001) = totalPool
  // Credit: Prize Money Payable (acc-2001) = netPayout
  // Credit: Organizer Commission Revenue (acc-4001) = commission
  // Credit: Dividend Equalization Pool (acc-2002) = dividendTotal
  // Check: totalPool === netPayout + commission + dividendTotal
  postBalancedTransaction({
    groupId: group.id,
    cycleId,
    sourceType: 'AUCTION_SETTLEMENT',
    sourceId: cycleId,
    description: `Cycle #${cycle.sequence_no} Auction Settlement. Winner: Member #${winningMembershipId}. Discount: ₹${(winningDiscount / 100).toFixed(2)}, Dividend/member: ₹${(dividendPerMember / 100).toFixed(2)}`,
    entries: [
      { accountId: 'acc-3001', entryType: 'DEBIT', amountMinor: totalPool },
      { accountId: 'acc-2001', entryType: 'CREDIT', amountMinor: netPayout, membershipId: winningMembershipId },
      { accountId: 'acc-4001', entryType: 'CREDIT', amountMinor: commission },
      { accountId: 'acc-2002', entryType: 'CREDIT', amountMinor: dividendTotal }
    ],
    postedBy: closedByUserId
  }, database);

  // Create Payout Request record for Winner
  const winnerMember = database.prepare(`
    SELECT m.*, u.id as user_id, p.bank_account_no, p.bank_ifsc
    FROM group_memberships m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE m.id = ?
  `).get(winningMembershipId);

  const payoutId = 'pay-' + randomUUID();
  const bankAcc = winnerMember.bank_account_no ? `XXXX${winnerMember.bank_account_no.slice(-4)}` : 'XXXX-9876';
  const ifsc = winnerMember.bank_ifsc || 'HDFC0001234';

  database.prepare(`
    INSERT INTO payouts (
      id, cycle_id, winner_membership_id, beneficiary_user_id,
      gross_amount_minor, commission_deducted_minor, net_payout_minor,
      bank_account_masked, ifsc_code, approval_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')
  `).run(
    payoutId,
    cycleId,
    winningMembershipId,
    winnerMember.user_id,
    totalPool,
    commission,
    netPayout,
    bankAcc,
    ifsc
  );

  const closedCycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);

  logAuditEvent({
    actorId: closedByUserId,
    action: 'AUCTION_CLOSED_AND_SETTLED',
    objectType: 'chit_cycles',
    objectId: cycleId,
    afterState: closedCycle,
    metadata: snapshotData,
    db: database
  });

  return {
    cycle: closedCycle,
    snapshotData,
    payoutId,
    resultSignature
  };
}

export function getBiddingRoomState({ cycleId, userId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  const group = database.prepare(`
    SELECT g.*, l.name as locality_name
    FROM chit_groups g
    LEFT JOIN localities l ON g.locality_id = l.id
    WHERE g.id = ?
  `).get(cycle.group_id);

  let userMembership = null;
  if (userId) {
    userMembership = database.prepare(`
      SELECT * FROM group_memberships
      WHERE group_id = ? AND user_id = ?
    `).get(group.id, userId);
  }

  const bids = database.prepare(`
    SELECT b.*, m.slot_number, u.phone as member_phone, p.display_name as member_name
    FROM bids b
    JOIN group_memberships m ON b.membership_id = m.id
    JOIN users u ON m.user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE b.cycle_id = ?
    ORDER BY b.bid_discount_minor DESC, b.submitted_at ASC
  `).all(cycleId);

  const highestBid = bids.length > 0 ? bids[0] : null;

  const ceilingBids = bids.filter(b => b.bid_discount_minor === group.max_bid_discount_minor);
  const isLotteryRequired = ceilingBids.length > 1;

  const totalPool = group.total_pool_minor;
  const organizerCommission = Math.round(totalPool * group.organizer_commission_rate);
  const currentDiscount = highestBid ? highestBid.bid_discount_minor : group.min_bid_discount_minor;
  const netTakeHomeWinner = totalPool - currentDiscount;
  const totalDividend = Math.max(0, currentDiscount - organizerCommission);
  const dividendPerMember = Math.floor(totalDividend / group.max_members);
  const netNextInstallment = group.monthly_contribution_minor - dividendPerMember;

  const activeAuctions = database.prepare(`
    SELECT c.id as cycle_id, c.sequence_no, c.status as cycle_status,
           g.id as group_id, g.name as group_name, g.total_pool_minor,
           g.monthly_contribution_minor, l.name as locality_name
    FROM chit_cycles c
    JOIN chit_groups g ON c.group_id = g.id
    LEFT JOIN localities l ON g.locality_id = l.id
    WHERE c.status IN ('AUCTION_ACTIVE', 'OPEN_FOR_PAYMENT')
    ORDER BY c.auction_at ASC
  `).all();

  return {
    cycle,
    group,
    userMembership: userMembership ? {
      membershipId: userMembership.id,
      slotNumber: userMembership.slot_number,
      role: userMembership.role,
      hasWon: userMembership.has_won_auction === 1,
      isEligibleToBid: userMembership.status === 'ACTIVE' && userMembership.has_won_auction === 0 && cycle.status === 'AUCTION_ACTIVE'
    } : null,
    highestBid,
    bids,
    isLotteryRequired,
    tiedCeilingMembers: ceilingBids.map(b => ({
      membershipId: b.membership_id,
      memberName: b.member_name,
      slotNumber: b.slot_number,
      bidId: b.id
    })),
    financials: {
      totalPoolMinor: totalPool,
      organizerCommissionMinor: organizerCommission,
      currentDiscountMinor: currentDiscount,
      discountPercent: ((currentDiscount / totalPool) * 100).toFixed(1),
      netTakeHomeWinnerMinor: netTakeHomeWinner,
      totalDividendMinor: totalDividend,
      dividendPerMemberMinor: dividendPerMember,
      nominalInstallmentMinor: group.monthly_contribution_minor,
      netNextInstallmentMinor: netNextInstallment
    },
    activeAuctions
  };
}

export function simulateCompetitorBid({ cycleId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');
  if (cycle.status !== 'AUCTION_ACTIVE') throw new Error('Auction is not active.');

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);

  const currentHighest = database.prepare(`
    SELECT * FROM bids
    WHERE cycle_id = ? AND status = 'VALID'
    ORDER BY bid_discount_minor DESC, submitted_at ASC
    LIMIT 1
  `).get(cycleId);

  const candidates = database.prepare(`
    SELECT m.*, u.id as user_id, p.display_name
    FROM group_memberships m
    JOIN users u ON m.user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE m.group_id = ? AND m.status = 'ACTIVE' AND m.has_won_auction = 0
      AND (? IS NULL OR m.id != ?)
  `).all(group.id, currentHighest ? currentHighest.membership_id : null, currentHighest ? currentHighest.membership_id : null);

  if (candidates.length === 0) {
    throw new Error('No eligible competitor members found to place a simulated bid.');
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  let nextDiscount;
  if (!currentHighest) {
    nextDiscount = group.min_bid_discount_minor;
  } else {
    const step = 500000; // ₹5,000 increment
    nextDiscount = Math.min(group.max_bid_discount_minor, currentHighest.bid_discount_minor + step);
  }

  return submitBid({
    cycleId,
    membershipId: chosen.id,
    bidDiscountMinor: nextDiscount,
    actorUserId: chosen.user_id
  }, database);
}

export function drawAuctionLottery({ cycleId, drawnByUserId }, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);

  const ceilingBids = database.prepare(`
    SELECT b.*, m.slot_number, p.display_name as member_name
    FROM bids b
    JOIN group_memberships m ON b.membership_id = m.id
    JOIN users u ON m.user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE b.cycle_id = ? AND b.bid_discount_minor = ? AND b.status = 'VALID'
  `).all(cycleId, group.max_bid_discount_minor);

  if (ceilingBids.length < 2) {
    throw new Error('Tie-breaker lottery is only applicable when 2 or more members bid the maximum statutory ceiling.');
  }

  const winnerIndex = Math.floor(Math.random() * ceilingBids.length);
  const winningBid = ceilingBids[winnerIndex];

  database.prepare("UPDATE bids SET is_winning = 0 WHERE cycle_id = ?").run(cycleId);
  database.prepare("UPDATE bids SET is_winning = 1, status = 'WINNING' WHERE id = ?").run(winningBid.id);

  logAuditEvent({
    actorId: drawnByUserId,
    action: 'AUCTION_LOTTERY_DRAWN',
    objectType: 'chit_cycles',
    objectId: cycleId,
    metadata: {
      totalCandidates: ceilingBids.length,
      winnerMembershipId: winningBid.membership_id,
      winnerName: winningBid.member_name,
      winningBidId: winningBid.id
    },
    db: database
  });

  return {
    winner: {
      bidId: winningBid.id,
      membershipId: winningBid.membership_id,
      memberName: winningBid.member_name,
      slotNumber: winningBid.slot_number,
      discountMinor: winningBid.bid_discount_minor
    },
    candidatesCount: ceilingBids.length
  };
}
