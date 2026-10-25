import { getDatabase } from '../db/index.js';
import { logAuditEvent } from '../services/auditService.js';
import { postBalancedTransaction } from '../services/ledgerService.js';
import { hashPassword } from '../services/authService.js';

export function seedDatabase(db = null) {
  const database = db || getDatabase();

  // Clear existing data cleanly if re-seeding
  const tables = [
    'audit_events', 'notifications', 'messages', 'conversations', 'support_cases',
    'delinquencies', 'ledger_entries', 'ledger_transactions', 'sureties', 'payouts', 'bids',
    'payment_intents', 'contribution_obligations', 'chit_cycles', 'group_memberships',
    'chit_groups', 'kyc_cases', 'user_consents', 'user_profiles', 'users', 'localities'
  ];

  for (const t of tables) {
    try { database.exec(`DELETE FROM ${t};`); } catch (_) {}
  }

  const now = new Date().toISOString();

  // 1. Seed Localities
  const localities = [
    ['loc-1', 'Indiranagar', null, 'Bengaluru', 'Karnataka', 12.9784, 77.6408, '560038', now],
    ['loc-2', 'Koramangala', null, 'Bengaluru', 'Karnataka', 12.9352, 77.6245, '560034', now],
    ['loc-3', 'HSR Layout', null, 'Bengaluru', 'Karnataka', 12.9121, 77.6446, '560102', now],
    ['loc-4', 'Jayanagar', null, 'Bengaluru', 'Karnataka', 12.9308, 77.5838, '560041', now],
    ['loc-5', 'Whitefield', null, 'Bengaluru', 'Karnataka', 12.9698, 77.7500, '560066', now]
  ];

  const insertLoc = database.prepare(`
    INSERT INTO localities (id, name, parent_id, city, state, latitude, longitude, pincode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const l of localities) insertLoc.run(...l);

  // 2. Seed Users & Profiles (8 Roles from Section 4)
  const users = [
    {
      id: 'usr-member-1', phone: '9876543210', role: 'MEMBER', name: 'Ramesh Kumar',
      email: 'ramesh.kumar@example.com', loc: 'loc-1', kyc: 'VERIFIED', rep: 98.5,
      acc: '987654321001', ifsc: 'HDFC0001234', upi: 'ramesh@okhdfcbank'
    },
    {
      id: 'usr-member-2', phone: '9876543211', role: 'MEMBER', name: 'Priya Sharma',
      email: 'priya.sharma@example.com', loc: 'loc-1', kyc: 'VERIFIED', rep: 99.0,
      acc: '987654321002', ifsc: 'SBIN0004567', upi: 'priya@oksbi'
    },
    {
      id: 'usr-member-3', phone: '9876543212', role: 'MEMBER', name: 'Suresh Patel',
      email: 'suresh.patel@example.com', loc: 'loc-2', kyc: 'VERIFIED', rep: 95.0,
      acc: '987654321003', ifsc: 'ICIC0007890', upi: 'suresh@okicici'
    },
    {
      id: 'usr-organizer-1', phone: '9876543220', role: 'ORGANIZER', name: 'Lakshmi Devi',
      email: 'lakshmi.devi@example.com', loc: 'loc-1', kyc: 'VERIFIED', rep: 100.0,
      acc: '987654322001', ifsc: 'HDFC0001234', upi: 'lakshmi.organizer@upi'
    },
    {
      id: 'usr-collector-1', phone: '9876543230', role: 'COLLECTOR', name: 'Anand Verma',
      email: 'anand.field@example.com', loc: 'loc-1', kyc: 'VERIFIED', rep: 97.0,
      acc: '987654323001', ifsc: 'KKBK0001122', upi: 'anand.collector@upi'
    },
    {
      id: 'usr-opsadmin-1', phone: '9876543240', role: 'OPERATIONS_ADMIN', name: 'Rajesh Nair',
      email: 'rajesh.ops@chitfund.local', loc: 'loc-1', kyc: 'VERIFIED', rep: 100.0,
      acc: '987654324001', ifsc: 'HDFC0001234', upi: 'rajesh.ops@upi'
    },
    {
      id: 'usr-compliance-1', phone: '9876543250', role: 'COMPLIANCE_REVIEWER', name: 'Dr. Sunita Rao',
      email: 'sunita.compliance@chitfund.local', loc: 'loc-1', kyc: 'VERIFIED', rep: 100.0,
      acc: '987654325001', ifsc: 'HDFC0001234', upi: 'sunita.compliance@upi'
    },
    {
      id: 'usr-finance-1', phone: '9876543260', role: 'FINANCE_ADMIN', name: 'Vikram Malhotra',
      email: 'vikram.finance@chitfund.local', loc: 'loc-1', kyc: 'VERIFIED', rep: 100.0,
      acc: '987654326001', ifsc: 'HDFC0001234', upi: 'vikram.finance@upi'
    }
  ];

  const insertUser = database.prepare(`
    INSERT INTO users (id, phone, password_hash, password_salt, is_host, role, status, auth_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `);

  const insertProfile = database.prepare(`
    INSERT INTO user_profiles (
      user_id, display_name, email, locality_id, referral_code,
      bank_account_no, bank_ifsc, upi_id, pan_number_masked, aadhaar_number_masked,
      host_license_number, bank_guarantee_ref, kyc_status, govt_verified, reputation_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABCDE1234F', 'XXXX-XXXX-3210', ?, ?, ?, 1, ?, ?, ?)
  `);

  const insertConsent = database.prepare(`
    INSERT INTO user_consents (id, user_id, terms_version, privacy_version, aadhaar_consent, coarse_location_consent, ip_address, consented_at)
    VALUES (?, ?, '1.0', '1.0', 1, 1, '127.0.0.1', ?)
  `);

  const defaultCredentials = hashPassword('123456');

  users.forEach((u, i) => {
    const token = 'tok-demo-' + u.role.toLowerCase();
    const isHost = u.role === 'ORGANIZER' ? 1 : 0;
    insertUser.run(u.id, u.phone, defaultCredentials.hash, defaultCredentials.salt, isHost, u.role, token, now);
    insertProfile.run(
      u.id, u.name, u.email, u.loc, `REF${10000 + i}`,
      u.acc, u.ifsc, u.upi,
      isHost ? 'KA/BLR/REG/2026/0491' : null,
      isHost ? 'BG-HDFC-992100' : null,
      u.kyc, u.rep, now, now
    );
    insertConsent.run('cns-' + u.id, u.id, now);
  });

  // 3. Seed KYC Cases
  database.prepare(`
    INSERT INTO kyc_cases (id, user_id, provider, provider_ref, doc_type, doc_number_masked, status, reviewed_by, decision_reason, submitted_at, decided_at)
    VALUES
    ('kyc-1', 'usr-member-1', 'SANDBOX_UIDAI_ADAPTER', 'UIDAI-99112233', 'AADHAAR_OTP', 'XXXX-XXXX-3210', 'APPROVED', 'usr-compliance-1', 'Aadhaar e-KYC demographic match verified', ?, ?),
    ('kyc-2', 'usr-member-2', 'SANDBOX_UIDAI_ADAPTER', 'UIDAI-99112234', 'AADHAAR_OTP', 'XXXX-XXXX-3211', 'APPROVED', 'usr-compliance-1', 'Aadhaar e-KYC demographic match verified', ?, ?)
  `).run(now, now, now, now);

  // 4. Seed Active Chit Group: Indiranagar Traders & Artisans Chit 2026
  // Pool: ₹5,00,000 (50,000,000 paise). Monthly: ₹25,000 (2,500,000 paise). 20 Months. 20 Slots.
  const grp1Id = 'grp-indiranagar-2026';
  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, 'usr-organizer-1', 'loc-1', 'Indiranagar Traders & Artisans Chit 2026',
      50000000, 2500000, 20, 5, 5, 0.05, 2500000, 15000000, '1.0',
      'KA/BLR/REG/2026/0491', 'BG-HDFC-992100', 99.4, 'ACTIVE', ?)
  `).run(grp1Id, now);

  // Seed Memberships for Group 1 (Slots 1 to 5)
  const grp1Members = [
    { id: 'mem-1', userId: 'usr-organizer-1', slot: 1, role: 'ORGANIZER', hasWon: 1 },
    { id: 'mem-2', userId: 'usr-member-1', slot: 2, role: 'MEMBER', hasWon: 0 },
    { id: 'mem-3', userId: 'usr-member-2', slot: 3, role: 'MEMBER', hasWon: 0 },
    { id: 'mem-4', userId: 'usr-member-3', slot: 4, role: 'MEMBER', hasWon: 0 },
    { id: 'mem-5', userId: 'usr-collector-1', slot: 5, role: 'MEMBER', hasWon: 0 }
  ];

  const insertMem = database.prepare(`
    INSERT INTO group_memberships (
      id, group_id, user_id, slot_number, role, status, has_won_auction, won_cycle_id, accepted_rules_version, joined_at
    ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, '1.0', ?)
  `);

  for (const m of grp1Members) {
    insertMem.run(m.id, grp1Id, m.userId, m.slot, m.role, m.hasWon, m.hasWon ? 'cyc-1' : null, now);
  }

  // Seed Cycles for Group 1
  // Cycle 1: Completed & Settled (Organizer won slot 1 as per tradition / legal setup)
  // Total pool: 50,00,000 paise (₹5,00,000)
  // Commission: 25,00,00 paise (₹25,000)
  // Net payout: 47,50,00 paise (₹4,75,000)
  const cyc1Id = 'cyc-1';
  database.prepare(`
    INSERT INTO chit_cycles (
      id, group_id, sequence_no, due_at, auction_at, status,
      winner_membership_id, winning_bid_discount_minor, dividend_per_member_minor,
      organizer_commission_minor, payout_amount_minor, result_signature, created_at
    ) VALUES (?, ?, 1, ?, ?, 'SETTLED', 'mem-1', 2500000, 0, 2500000, 47500000, 'DEMO-SIG-CYC1', ?)
  `).run(cyc1Id, grp1Id, now, now, now);

  // Cycle 1 Obligations & Payments (Fully paid & settled)
  const insertObl = database.prepare(`
    INSERT INTO contribution_obligations (
      id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
      penalty_minor, net_payable_minor, amount_paid_minor, due_at, status, paid_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'PAID', ?)
  `);

  for (const m of grp1Members) {
    const oblId = `obl-c1-${m.id}`;
    insertObl.run(oblId, cyc1Id, m.id, 2500000, 0, 2500000, 2500000, now, now);

    // Record settled payment intent
    database.prepare(`
      INSERT INTO payment_intents (
        id, obligation_id, payer_user_id, amount_minor, payment_method,
        provider_ref, idempotency_key, status, created_at, settled_at
      ) VALUES (?, ?, ?, 2500000, 'UPI_QR', 'UPI-SEED-REF', ?, 'SUCCESS', ?, ?)
    `).run(`pi-c1-${m.id}`, oblId, m.userId, `idemp-c1-${m.id}`, now, now);
  }

  // Post Double-Entry Ledger entries for Cycle 1:
  // 1. Contributions collected (5 members * ₹25,000 = ₹1,25,000 = 12,500,000 paise)
  postBalancedTransaction({
    groupId: grp1Id,
    cycleId: cyc1Id,
    sourceType: 'CONTRIBUTION_PAYMENT',
    sourceId: cyc1Id,
    description: 'Cycle #1 All Member Contributions Received',
    entries: [
      { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: 12500000 },
      { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: 12500000 }
    ],
    postedBy: 'usr-opsadmin-1'
  }, database);

  // 2. Cycle 1 Auction Settlement
  postBalancedTransaction({
    groupId: grp1Id,
    cycleId: cyc1Id,
    sourceType: 'AUCTION_SETTLEMENT',
    sourceId: cyc1Id,
    description: 'Cycle #1 Auction Settlement to Organizer (Slot 1)',
    entries: [
      { accountId: 'acc-3001', entryType: 'DEBIT', amountMinor: 50000000 },
      { accountId: 'acc-2001', entryType: 'CREDIT', amountMinor: 47500000, membershipId: 'mem-1' },
      { accountId: 'acc-4001', entryType: 'CREDIT', amountMinor: 2500000 }
    ],
    postedBy: 'usr-opsadmin-1'
  }, database);

  // 3. Cycle 1 Payout Disbursed
  database.prepare(`
    INSERT INTO payouts (
      id, cycle_id, winner_membership_id, beneficiary_user_id,
      gross_amount_minor, commission_deducted_minor, net_payout_minor,
      bank_account_masked, ifsc_code, maker_user_id, maker_initiated_at,
      checker_user_id, checker_approved_at, approval_status, provider_payout_ref, disbursed_at
    ) VALUES (
      'pay-c1-winner', 'cyc-1', 'mem-1', 'usr-organizer-1',
      50000000, 2500000, 47500000,
      'XXXX-2001', 'HDFC0001234', 'usr-opsadmin-1', ?,
      'usr-finance-1', ?, 'DISBURSED', 'IMPS-SETTLED-CYC1', ?
    )
  `).run(now, now, now);

  postBalancedTransaction({
    groupId: grp1Id,
    cycleId: cyc1Id,
    sourceType: 'PAYOUT_DISBURSEMENT',
    sourceId: 'pay-c1-winner',
    description: 'Cycle #1 Prize Money Disbursed to Lakshmi Devi',
    entries: [
      { accountId: 'acc-2001', entryType: 'DEBIT', amountMinor: 47500000, membershipId: 'mem-1' },
      { accountId: 'acc-1001', entryType: 'CREDIT', amountMinor: 47500000 }
    ],
    postedBy: 'usr-finance-1'
  }, database);

  // Cycle 2: Currently AUCTION_ACTIVE / OPEN_FOR_PAYMENT (Ready for live demo!)
  const cyc2Id = 'cyc-2';
  database.prepare(`
    INSERT INTO chit_cycles (
      id, group_id, sequence_no, due_at, auction_at, status, created_at
    ) VALUES (?, ?, 2, ?, ?, 'AUCTION_ACTIVE', ?)
  `).run(cyc2Id, grp1Id, now, now, now);

  // Seed Cycle 2 Obligations
  for (const m of grp1Members) {
    const oblId = `obl-c2-${m.id}`;
    // Member 2 (Priya) has already paid her obligation for cycle 2
    const isPaid = m.id === 'mem-3';
    database.prepare(`
      INSERT INTO contribution_obligations (
        id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
        penalty_minor, net_payable_minor, amount_paid_minor, due_at, status, paid_at
      ) VALUES (?, ?, ?, 2500000, 0, 0, 2500000, ?, ?, ?, ?)
    `).run(oblId, cyc2Id, m.id, isPaid ? 2500000 : 0, now, isPaid ? 'PAID' : 'PENDING', isPaid ? now : null);

    if (isPaid) {
      postBalancedTransaction({
        groupId: grp1Id,
        cycleId: cyc2Id,
        sourceType: 'CONTRIBUTION_PAYMENT',
        sourceId: oblId,
        description: 'Cycle #2 Contribution payment by Priya Sharma (Slot #3)',
        entries: [
          { accountId: 'acc-1001', entryType: 'DEBIT', amountMinor: 2500000 },
          { accountId: 'acc-1002', entryType: 'CREDIT', amountMinor: 2500000, membershipId: m.id }
        ],
        postedBy: m.userId
      }, database);
    }
  }

  // Seed sample pending offline payment for Ramesh Kumar (mem-2) awaiting Host verification
  database.prepare(`
    INSERT INTO payment_intents (
      id, obligation_id, payer_user_id, amount_minor, payment_method,
      collector_id, verified_by_host_id, offline_notes, provider_ref, idempotency_key,
      status, created_at
    ) VALUES (
      'pi-offline-ramesh-c2', 'obl-c2-mem-2', 'usr-member-1', 2500000, 'OFFLINE_DIRECT_HOST',
      NULL, NULL, 'Handed cash ₹25,000 to Lakshmi Devi at Indiranagar shop on Friday evening', NULL, 'IDEMP-OFFLINE-SEED-1',
      'PENDING_HOST_VERIFICATION', ?
    )
  `).run(now);

  // Seed live bids in Cycle 2
  // Ramesh bids ₹40,000 discount (4,000,000 paise)
  // Priya bids ₹45,000 discount (4,500,000 paise)
  database.prepare(`
    INSERT INTO bids (id, cycle_id, membership_id, bid_discount_minor, submitted_at, status, is_winning)
    VALUES
    ('bid-1', 'cyc-2', 'mem-2', 4000000, ?, 'OUTBID', 0),
    ('bid-2', 'cyc-2', 'mem-3', 4500000, ?, 'VALID', 0)
  `).run(now, now);

  // Group 2: Koramangala Tech Entrepreneurs Savings Chit (In REGISTRATION status for discovery)
  const grp2Id = 'grp-koramangala-2026';
  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, 'usr-organizer-1', 'loc-2', 'Koramangala Tech Entrepreneurs Savings Chit',
      100000000, 5000000, 20, 20, 1, 0.05, 5000000, 30000000, '1.0',
      'KA/BLR/REG/2026/0812', 'BG-ICICI-441199', 98.8, 'REGISTRATION', ?)
  `).run(grp2Id, now);

  database.prepare(`
    INSERT INTO group_memberships (
      id, group_id, user_id, slot_number, role, status, has_won_auction, won_cycle_id, accepted_rules_version, joined_at
    ) VALUES ('mem-grp2-org', ?, 'usr-organizer-1', 1, 'ORGANIZER', 'ACTIVE', 0, NULL, '1.0', ?)
  `).run(grp2Id, now);

  // Group 3: HSR Layout Retailers Working Capital Chit (₹2,00,000 Pool, Cycle 3 Live Auction)
  const grp3Id = 'grp-hsr-retailers-2026';
  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, 'usr-organizer-1', 'loc-3', 'HSR Layout Retailers Working Capital Chit',
      20000000, 1000000, 20, 20, 4, 0.05, 1000000, 6000000, '1.0',
      'KA/BLR/REG/2026/0554', 'BG-AXIS-882190', 99.1, 'ACTIVE', ?)
  `).run(grp3Id, now);

  // Memberships for Group 3 (Ramesh holds Ticket #7, Suresh holds Ticket #2, Anand holds Ticket #5)
  const grp3Members = [
    { id: 'mem-g3-org', userId: 'usr-organizer-1', slot: 1, role: 'ORGANIZER', hasWon: 1 },
    { id: 'mem-g3-suresh', userId: 'usr-member-3', slot: 2, role: 'MEMBER', hasWon: 0 },
    { id: 'mem-g3-anand', userId: 'usr-collector-1', slot: 5, role: 'MEMBER', hasWon: 0 },
    { id: 'mem-g3-ramesh', userId: 'usr-member-1', slot: 7, role: 'MEMBER', hasWon: 0 }
  ];
  for (const m of grp3Members) {
    insertMem.run(m.id, grp3Id, m.userId, m.slot, m.role, m.hasWon, m.hasWon ? 'cyc-g3-1' : null, now);
  }

  // Group 3, Cycle 3 is AUCTION_ACTIVE
  const cyc3G3Id = 'cyc-g3-3';
  database.prepare(`
    INSERT INTO chit_cycles (id, group_id, sequence_no, due_at, auction_at, status, created_at)
    VALUES (?, ?, 3, ?, ?, 'AUCTION_ACTIVE', ?)
  `).run(cyc3G3Id, grp3Id, now, now, now);

  // Obligations for Group 3 Cycle 3 (Ramesh owes ₹10,000)
  for (const m of grp3Members) {
    database.prepare(`
      INSERT INTO contribution_obligations (
        id, cycle_id, membership_id, base_amount_minor, dividend_deduction_minor,
        penalty_minor, net_payable_minor, amount_paid_minor, due_at, status
      ) VALUES (?, ?, ?, 1000000, 0, 0, 1000000, 0, ?, 'PENDING')
    `).run(`obl-g3c3-${m.id}`, cyc3G3Id, m.id, now);
  }

  // Live bids in Group 3 Cycle 3
  database.prepare(`
    INSERT INTO bids (id, cycle_id, membership_id, bid_discount_minor, submitted_at, status, is_winning)
    VALUES
    ('bid-g3-1', ?, 'mem-g3-suresh', 1800000, ?, 'OUTBID', 0),
    ('bid-g3-2', ?, 'mem-g3-anand', 2200000, ?, 'VALID', 0)
  `).run(cyc3G3Id, now, cyc3G3Id, now);

  // Group 4: Whitefield Domestic Helpers & Artisans Micro-Chit (₹50,000 Pool)
  const grp4Id = 'grp-whitefield-micro-2026';
  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, 'usr-organizer-1', 'loc-5', 'Whitefield Women Artisans Micro-Chit',
      5000000, 500000, 10, 10, 7, 0.05, 250000, 1500000, '1.0',
      'KA/BLR/REG/2026/0991', 'BG-SBI-110022', 97.6, 'REGISTRATION', ?)
  `).run(grp4Id, now);

  // Group 5: Jayanagar Family Wealth & Savings Chit (₹10,00,000 Pool, Cycle 5 Settled with Surety)
  const grp5Id = 'grp-jayanagar-wealth-2026';
  database.prepare(`
    INSERT INTO chit_groups (
      id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
      total_months, max_members, current_members_count, organizer_commission_rate,
      min_bid_discount_minor, max_bid_discount_minor, constitution_version,
      host_license_number, bank_guarantee_ref, trust_score, status, created_at
    ) VALUES (?, 'usr-organizer-1', 'loc-4', 'Jayanagar Family Wealth & Savings Chit',
      100000000, 4000000, 25, 25, 3, 0.05, 5000000, 30000000, '1.0',
      'KA/BLR/REG/2026/0122', 'BG-CANARA-778811', 99.5, 'ACTIVE', ?)
  `).run(grp5Id, now);

  // Priya Sharma (usr-member-2) has slot 14 in Jayanagar chit, won Cycle 5
  const memG5Priya = 'mem-g5-priya';
  insertMem.run(memG5Priya, grp5Id, 'usr-member-2', 14, 'MEMBER', 1, 'cyc-g5-5', now);

  const cycG5Id = 'cyc-g5-5';
  database.prepare(`
    INSERT INTO chit_cycles (
      id, group_id, sequence_no, due_at, auction_at, status,
      winner_membership_id, winning_bid_discount_minor, dividend_per_member_minor,
      organizer_commission_minor, payout_amount_minor, result_signature, created_at
    ) VALUES (?, ?, 5, ?, ?, 'AUCTION_CLOSED', ?, 18000000, 520000, 5000000, 82000000, 'DEMO-SIG-JAYA-C5', ?)
  `).run(cycG5Id, grp5Id, now, now, memG5Priya, now);

  // Create Payout Record for Priya
  const payoutG5Id = 'pay-c5-priya';
  database.prepare(`
    INSERT INTO payouts (
      id, cycle_id, winner_membership_id, beneficiary_user_id,
      gross_amount_minor, commission_deducted_minor, net_payout_minor,
      bank_account_masked, ifsc_code, approval_status
    ) VALUES (?, ?, ?, 'usr-member-2', 100000000, 5000000, 82000000, 'XXXX-4567', 'SBIN0004567', 'PENDING_APPROVAL')
  `).run(payoutG5Id, cycG5Id, memG5Priya);

  // Seed Pending Surety submitted by Priya under Section 31
  database.prepare(`
    INSERT INTO sureties (
      id, payout_id, cycle_id, membership_id, user_id,
      surety_type, guarantor_name, guarantor_phone, guarantor_id_masked,
      document_ref, status, submitted_at
    ) VALUES (
      'sur-seed-priya-1', ?, ?, ?, 'usr-member-2',
      'CO_GUARANTOR', 'Dr. Sunita Rao', '9876543250', 'XXXX-XXXX-7788',
      'DOC-INDEMNITY-BOND-2026-KA-BLR', 'PENDING_HOST_APPROVAL', ?
    )
  `).run(payoutG5Id, cycG5Id, memG5Priya, now);

  // Seed Conversations & Initial Messages
  const conv1Id = 'cnv-grp1';
  database.prepare('INSERT INTO conversations (id, group_id, type, created_at) VALUES (?, ?, ?, ?)').run(conv1Id, grp1Id, 'GROUP_CHAT', now);
  database.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, message, is_announcement, created_at)
    VALUES
    ('msg-1', ?, 'usr-organizer-1', 'Welcome everyone to Indiranagar Traders & Artisans Chit! Cycle 2 auction is now active.', 1, ?),
    ('msg-2', ?, 'usr-member-1', 'Thank you Lakshmi ji. Looking forward to bidding in this cycle.', 0, ?)
  `).run(conv1Id, now, conv1Id, now);

  // Seed Audit Trail initialization event
  logAuditEvent({
    actorId: 'usr-opsadmin-1',
    action: 'SYSTEM_SEEDED',
    objectType: 'system',
    objectId: 'initial-seed',
    metadata: { groups: 2, users: users.length, localities: localities.length },
    db: database
  });

  return { message: 'Database successfully seeded with realistic Chit Fund test data.' };
}

// Allow CLI execution: `node src/seed/seedData.js`
if (process.argv[1] && process.argv[1].endsWith('seedData.js')) {
  const result = seedDatabase();
  console.log('✔', result.message);
}
