import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';
import { initializeCyclesForGroup } from './cycleService.js';

export function createChitGroup({
  organizerId,
  localityId,
  name,
  totalPoolMinor,
  monthlyContributionMinor,
  totalMonths,
  maxMembers,
  organizerCommissionRate = 0.05,
  minBidDiscountMinor = null,
  maxBidDiscountMinor = null,
  constitutionVersion = '1.0',
  hostLicenseNumber = 'KA/BLR/REG/2026/0491',
  bankGuaranteeRef = 'BG-HDFC-992100',
  trustScore = 99.4
}, db = null) {
  const database = db || getDatabase();

  // Validate organizer
  const organizer = database.prepare('SELECT * FROM users WHERE id = ?').get(organizerId);
  if (!organizer) throw new Error('Organizer user not found.');

  // Default discount boundaries
  const pool = Number(totalPoolMinor);
  const minDiscount = minBidDiscountMinor !== null ? Number(minBidDiscountMinor) : Math.round(pool * organizerCommissionRate);
  const maxDiscount = maxBidDiscountMinor !== null ? Number(maxBidDiscountMinor) : Math.round(pool * 0.30); // 30% statutory ceiling

  const groupId = 'grp-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'REGISTRATION', ?)
  `).run(
    groupId,
    organizerId,
    localityId,
    name,
    pool,
    Number(monthlyContributionMinor),
    Number(totalMonths),
    Number(maxMembers),
    organizerCommissionRate,
    minDiscount,
    maxDiscount,
    constitutionVersion,
    hostLicenseNumber,
    bankGuaranteeRef,
    trustScore,
    now
  );

  // Automatically add organizer as Member Slot #1
  const membershipId = 'mem-' + randomUUID();
  database.prepare(`
    INSERT INTO group_memberships (
      id, group_id, user_id, slot_number, role, status, accepted_rules_version, joined_at
    ) VALUES (?, ?, ?, 1, 'ORGANIZER', 'ACTIVE', ?, ?)
  `).run(membershipId, groupId, organizerId, constitutionVersion, now);

  // Create group chat conversation
  const convId = 'cnv-' + randomUUID();
  database.prepare('INSERT INTO conversations (id, group_id, type, created_at) VALUES (?, ?, ?, ?)')
    .run(convId, groupId, 'GROUP_CHAT', now);

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId);

  logAuditEvent({
    actorId: organizerId,
    action: 'CHIT_GROUP_CREATED',
    objectType: 'chit_groups',
    objectId: groupId,
    afterState: group,
    db: database
  });

  return group;
}

export function requestToJoinGroup({ groupId, userId, acceptedRulesVersion = '1.0' }, db = null) {
  const database = db || getDatabase();

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(groupId);
  if (!group) throw new Error('Chit group not found.');
  if (group.status !== 'REGISTRATION') {
    throw new Error(`Cannot join group in state ${group.status}. Registration is closed.`);
  }

  if (group.current_members_count >= group.max_members) {
    throw new Error('Chit group has already reached maximum capacity.');
  }

  const existing = database.prepare('SELECT * FROM group_memberships WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  if (existing) {
    throw new Error(`User has already requested or joined this group (Status: ${existing.status}).`);
  }

  const membershipId = 'mem-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO group_memberships (
      id, group_id, user_id, slot_number, role, status, accepted_rules_version, joined_at
    ) VALUES (?, ?, ?, NULL, 'MEMBER', 'PENDING_APPROVAL', ?, ?)
  `).run(membershipId, groupId, userId, acceptedRulesVersion, now);

  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(membershipId);

  logAuditEvent({
    actorId: userId,
    action: 'GROUP_JOIN_REQUESTED',
    objectType: 'group_memberships',
    objectId: membershipId,
    afterState: membership,
    db: database
  });

  return membership;
}

export function approveGroupMember({ membershipId, approverUserId, slotNumber = null }, db = null) {
  const database = db || getDatabase();

  const membership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(membershipId);
  if (!membership) throw new Error('Membership record not found.');

  const group = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(membership.group_id);
  if (!group) throw new Error('Chit group not found.');

  // Verify approver is organizer or admin
  const approver = database.prepare('SELECT * FROM users WHERE id = ?').get(approverUserId);
  if (!approver || (approver.id !== group.organizer_id && !['OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(approver.role))) {
    throw new Error('Only the group organizer or operations admin can approve join requests.');
  }

  if (membership.status === 'ACTIVE') {
    return membership;
  }

  // Determine slot number
  let finalSlot = slotNumber;
  if (!finalSlot) {
    const maxSlotRow = database.prepare('SELECT MAX(slot_number) as max_slot FROM group_memberships WHERE group_id = ?').get(group.id);
    finalSlot = (maxSlotRow.max_slot || 1) + 1;
  }

  database.prepare(`
    UPDATE group_memberships
    SET status = 'ACTIVE', slot_number = ?
    WHERE id = ?
  `).run(finalSlot, membershipId);

  // Update group count
  database.prepare(`
    UPDATE chit_groups
    SET current_members_count = current_members_count + 1
    WHERE id = ?
  `).run(group.id);

  const updatedGroup = database.prepare('SELECT * FROM chit_groups WHERE id = ?').get(group.id);
  const updatedMembership = database.prepare('SELECT * FROM group_memberships WHERE id = ?').get(membershipId);

  // If group is now full, launch the active cycles!
  if (updatedGroup.current_members_count >= updatedGroup.max_members && updatedGroup.status === 'REGISTRATION') {
    database.prepare("UPDATE chit_groups SET status = 'ACTIVE' WHERE id = ?").run(updatedGroup.id);
    initializeCyclesForGroup(updatedGroup.id, database);
  }

  logAuditEvent({
    actorId: approverUserId,
    action: 'GROUP_MEMBER_APPROVED',
    objectType: 'group_memberships',
    objectId: membershipId,
    beforeState: membership,
    afterState: updatedMembership,
    db: database
  });

  return updatedMembership;
}

export function getGroupDetails(groupId, db = null) {
  const database = db || getDatabase();
  const group = database.prepare(`
    SELECT g.*, l.name as locality_name, l.city as locality_city, l.pincode,
           u.phone as organizer_phone, p.display_name as organizer_name, p.reputation_score as organizer_reputation
    FROM chit_groups g
    JOIN localities l ON g.locality_id = l.id
    JOIN users u ON g.organizer_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE g.id = ?
  `).get(groupId);

  if (!group) return null;

  const members = database.prepare(`
    SELECT m.*, u.phone, p.display_name, p.kyc_status, p.reputation_score, p.referral_code
    FROM group_memberships m
    JOIN users u ON m.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE m.group_id = ?
    ORDER BY m.slot_number ASC, m.joined_at ASC
  `).all(groupId);

  const cycles = database.prepare(`
    SELECT * FROM chit_cycles WHERE group_id = ? ORDER BY sequence_no ASC
  `).all(groupId);

  return { ...group, members, cycles };
}

export function getAllGroups(db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT g.*, l.name as locality_name, l.city as locality_city, l.pincode,
           p.display_name as organizer_name
    FROM chit_groups g
    JOIN localities l ON g.locality_id = l.id
    JOIN users u ON g.organizer_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    ORDER BY g.created_at DESC
  `).all();
}
