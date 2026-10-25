import { getDatabase } from '../db/index.js';

export function getUserPortfolio(userId, db = null) {
  const database = db || getDatabase();

  // 1. Get all memberships for user
  const memberships = database.prepare(`
    SELECT m.id as membership_id, m.slot_number, m.role, m.status as membership_status,
           m.has_won_auction, m.won_cycle_id, m.joined_at,
           g.id as group_id, g.name as group_name, g.total_pool_minor,
           g.monthly_contribution_minor, g.total_months, g.max_members,
           g.trust_score, g.host_license_number, g.bank_guarantee_ref,
           g.status as group_status,
           l.name as locality_name, l.city
    FROM group_memberships m
    JOIN chit_groups g ON m.group_id = g.id
    LEFT JOIN localities l ON g.locality_id = l.id
    WHERE m.user_id = ? AND m.status = 'ACTIVE'
    ORDER BY m.joined_at DESC
  `).all(userId);

  let totalSubscribedValueMinor = 0;
  let totalMonthlyCommitmentMinor = 0;
  let totalLifetimeDividendsMinor = 0;
  let totalActiveDuesMinor = 0;

  const enrolledChits = memberships.map(m => {
    totalSubscribedValueMinor += m.total_pool_minor;
    totalMonthlyCommitmentMinor += m.monthly_contribution_minor;

    // Find active or upcoming cycle for this group
    const activeCycle = database.prepare(`
      SELECT * FROM chit_cycles
      WHERE group_id = ? AND status IN ('AUCTION_ACTIVE', 'OPEN_FOR_PAYMENT', 'AUCTION_SCHEDULED', 'UPCOMING')
      ORDER BY sequence_no ASC
      LIMIT 1
    `).get(m.group_id);

    // Find member obligation in this active cycle
    let obligation = null;
    if (activeCycle) {
      obligation = database.prepare(`
        SELECT * FROM contribution_obligations
        WHERE cycle_id = ? AND membership_id = ?
      `).get(activeCycle.id, m.membership_id);

      if (obligation && obligation.status === 'PENDING') {
        totalActiveDuesMinor += obligation.net_payable_minor;
      }
    }

    // Calculate total dividends received by this membership
    const dividendSum = database.prepare(`
      SELECT SUM(o.dividend_deduction_minor) as total_div
      FROM contribution_obligations o
      JOIN chit_cycles c ON o.cycle_id = c.id
      WHERE o.membership_id = ? AND c.status IN ('SETTLED', 'AUCTION_CLOSED')
    `).get(m.membership_id);

    const membershipDividends = (dividendSum && dividendSum.total_div) ? Number(dividendSum.total_div) : 0;
    totalLifetimeDividendsMinor += membershipDividends;

    return {
      membershipId: m.membership_id,
      ticketSlot: m.slot_number || 1,
      hasWon: m.has_won_auction === 1,
      wonCycleId: m.won_cycle_id,
      subscriberStatus: m.has_won_auction === 1 ? 'PRIZED_SUBSCRIBER' : 'NON_PRIZED_SUBSCRIBER',
      group: {
        id: m.group_id,
        name: m.group_name,
        locality: m.locality_name,
        city: m.city,
        totalPoolMinor: m.total_pool_minor,
        monthlyContributionMinor: m.monthly_contribution_minor,
        totalMonths: m.total_months,
        maxMembers: m.max_members,
        trustScore: m.trust_score,
        hostLicenseNumber: m.host_license_number,
        bankGuaranteeRef: m.bank_guarantee_ref,
        status: m.group_status
      },
      activeCycle: activeCycle ? {
        id: activeCycle.id,
        sequenceNo: activeCycle.sequence_no,
        status: activeCycle.status,
        auctionAt: activeCycle.auction_at,
        dueAt: activeCycle.due_at
      } : null,
      currentObligation: obligation ? {
        id: obligation.id,
        baseAmountMinor: obligation.base_amount_minor,
        dividendDeductionMinor: obligation.dividend_deduction_minor,
        netPayableMinor: obligation.net_payable_minor,
        status: obligation.status,
        dueAt: obligation.due_at
      } : null,
      dividendsEarnedMinor: membershipDividends
    };
  });

  return {
    summary: {
      totalChitsEnrolled: enrolledChits.length,
      totalSubscribedValueMinor,
      totalMonthlyCommitmentMinor,
      totalLifetimeDividendsMinor,
      totalActiveDuesMinor
    },
    enrolledChits
  };
}
