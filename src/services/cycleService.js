import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

export function initializeCyclesForGroup(groupId, db = null) {
  const database = db || getDatabase();
  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId);
  if (!group) throw new Error('Chit group not found.');

  // Check if cycles already exist
  const existingCount = database.prepare('SELECT COUNT(*) as count FROM chit_cycles WHERE group_id = ?').get(groupId);
  if (existingCount.count > 0) return;

  const now = new Date();
  const insertCycle = database.prepare(`
    INSERT INTO chit_cycles (
      id, group_id, sequence_no, due_at, auction_at, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= group.total_months; i++) {
    const cycleId = 'cyc-' + randomUUID();
    const cycleStart = new Date(now.getTime() + (i - 1) * 30 * 24 * 60 * 60 * 1000);
    const dueAt = new Date(cycleStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const auctionAt = new Date(cycleStart.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const status = i === 1 ? 'OPEN_FOR_PAYMENT' : 'UPCOMING';

    insertCycle.run(
      cycleId,
      groupId,
      i,
      dueAt,
      auctionAt,
      status,
      now.toISOString()
    );

    // If cycle 1 is active, generate obligations immediately
    if (i === 1) {
      generateObligationsForCycle(cycleId, database);
    }
  }

  logAuditEvent({
    actorId: group.organizer_id,
    action: 'CYCLES_INITIALIZED',
    objectType: 'chit_cycles',
    objectId: groupId,
    metadata: { totalMonths: group.total_months },
    db: database
  });
}

export function generateObligationsForCycle(cycleId, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare('SELECT * FROM chit_cycles WHERE id = ?').get(cycleId);
  if (!cycle) throw new Error('Cycle not found.');

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(cycle.group_id);
  const members = database.prepare(`
    SELECT * FROM group_memberships
    WHERE group_id = ? AND status = 'ACTIVE'
  `).all(cycle.group_id);

  // Check if prior cycle had dividend to deduct
  let dividendDeductionMinor = 0;
  if (cycle.sequence_no > 1) {
    const prevCycle = database.prepare(`
      SELECT dividend_per_member_minor FROM chit_cycles
      WHERE group_id = ? AND sequence_no = ?
    `).get(cycle.group_id, cycle.sequence_no - 1);
    if (prevCycle && prevCycle.dividend_per_member_minor > 0) {
      dividendDeductionMinor = prevCycle.dividend_per_member_minor;
    }
  }

  const baseAmount = group.monthly_contribution_minor;
  const netPayable = Math.max(0, baseAmount - dividendDeductionMinor);

  const insertObligation = database.prepare(`
    INSERT OR IGNORE INTO contribution_obligations (
      id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
      penalty_minor, net_payable_minor, amount_paid_minor, due_at, status
    ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, 'PENDING')
  `);

  for (const m of members) {
    const obligationId = 'obl-' + randomUUID();
    insertObligation.run(
      obligationId,
      cycleId,
      m.id,
      baseAmount,
      dividendDeductionMinor,
      netPayable,
      cycle.due_at
    );
  }
}

export function getCycleDetails(cycleId, db = null) {
  const database = db || getDatabase();
  const cycle = database.prepare(`
    SELECT c.*, g.name as group_name, g.total_pool_minor, g.monthly_contribution_minor,
           g.min_bid_discount_minor, g.max_bid_discount_minor, g.organizer_commission_rate
    FROM chit_cycles c
    JOIN chit_groups g ON c.group_id = g.id
    WHERE c.id = ?
  `).get(cycleId);

  if (!cycle) return null;

  const obligations = database.prepare(`
    SELECT o.*, u.phone, p.display_name, m.slot_number
    FROM contribution_obligations o
    JOIN group_memberships m ON o.membership_id = m.id
    JOIN users u ON m.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE o.cycle_id = ?
    ORDER BY m.slot_number ASC
  `).all(cycleId);

  const bids = database.prepare(`
    SELECT b.*, u.phone, p.display_name, m.slot_number
    FROM bids b
    JOIN group_memberships m ON b.membership_id = m.id
    JOIN users u ON m.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE b.cycle_id = ?
    ORDER BY b.bid_discount_minor DESC, b.submitted_at ASC
  `).all(cycleId);

  return { ...cycle, obligations, bids };
}
