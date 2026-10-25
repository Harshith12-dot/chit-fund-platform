-- ============================================================================
-- Local Connectivity Chit-Fund Platform Database Schema
-- Baseline Version: 1.0 (Compliant with Application Blueprint Section 7)
-- All monetary columns store integer minor units (Paise: 100 paise = ₹1.00)
-- All timestamps are ISO 8601 UTC strings
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Localities (Geographic hierarchy & coarse discovery)
CREATE TABLE IF NOT EXISTS localities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES localities(id) ON DELETE SET NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    pincode TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 2. Users (Authentication & Platform Identity)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN (
        'MEMBER',
        'ORGANIZER',
        'COLLECTOR',
        'OPERATIONS_ADMIN',
        'COMPLIANCE_REVIEWER',
        'FINANCE_ADMIN',
        'SUPPORT_AGENT',
        'SUPER_ADMIN'
    )),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'PENDING_KYC')),
    auth_token TEXT,
    created_at TEXT NOT NULL
);

-- 3. User Profiles & Trust Metadata
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email TEXT,
    locality_id TEXT REFERENCES localities(id) ON DELETE SET NULL,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    bank_account_no TEXT,
    bank_ifsc TEXT,
    upi_id TEXT,
    pan_number_masked TEXT DEFAULT 'ABCDE1234F',
    kyc_status TEXT DEFAULT 'UNVERIFIED' CHECK(kyc_status IN ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
    govt_verified INTEGER DEFAULT 1,
    reputation_score REAL DEFAULT 100.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 4. User Consents (DPDP Act & Privacy compliance)
CREATE TABLE IF NOT EXISTS user_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    aadhaar_consent INTEGER NOT NULL DEFAULT 1,
    coarse_location_consent INTEGER NOT NULL DEFAULT 1,
    ip_address TEXT,
    consented_at TEXT NOT NULL
);

-- 5. KYC Cases (Identity verification boundary)
CREATE TABLE IF NOT EXISTS kyc_cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'SANDBOX_UIDAI_ADAPTER',
    provider_ref TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'AADHAAR_OTP',
    doc_number_masked TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by TEXT REFERENCES users(id),
    decision_reason TEXT,
    submitted_at TEXT NOT NULL,
    decided_at TEXT
);

-- 6. Chit Groups (Group constitution & parameters)
CREATE TABLE IF NOT EXISTS chit_groups (
    id TEXT PRIMARY KEY,
    organizer_id TEXT NOT NULL REFERENCES users(id),
    locality_id TEXT NOT NULL REFERENCES localities(id),
    name TEXT NOT NULL,
    total_pool_minor INTEGER NOT NULL,          -- e.g. 50000000 paise = ₹5,00,000
    monthly_contribution_minor INTEGER NOT NULL, -- e.g. 2500000 paise = ₹25,000
    total_months INTEGER NOT NULL,              -- e.g. 20 months
    max_members INTEGER NOT NULL,               -- e.g. 20 members
    current_members_count INTEGER DEFAULT 1,
    organizer_commission_rate REAL DEFAULT 0.05, -- 5% standard under Chit Funds Act 1982
    min_bid_discount_minor INTEGER NOT NULL,    -- e.g. 2500000 paise (5%)
    max_bid_discount_minor INTEGER NOT NULL,    -- e.g. 15000000 paise (30% statutory cap)
    constitution_version TEXT NOT NULL DEFAULT '1.0',
    host_license_number TEXT DEFAULT 'KA/BLR/REG/2026/0491',
    bank_guarantee_ref TEXT DEFAULT 'BG-HDFC-992100',
    trust_score REAL DEFAULT 99.4,
    status TEXT NOT NULL DEFAULT 'REGISTRATION' CHECK(status IN ('DRAFT', 'REGISTRATION', 'ACTIVE', 'COMPLETED', 'SUSPENDED')),
    start_date TEXT,
    created_at TEXT NOT NULL
);

-- 7. Group Memberships (User role & slots in a group)
CREATE TABLE IF NOT EXISTS group_memberships (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_number INTEGER,
    role TEXT NOT NULL DEFAULT 'MEMBER' CHECK(role IN ('ORGANIZER', 'MEMBER')),
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'DEFAULTED')),
    has_won_auction INTEGER DEFAULT 0,
    won_cycle_id TEXT,
    accepted_rules_version TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    UNIQUE(group_id, user_id)
);

-- 8. Chit Cycles (Monthly cycle and auction period)
CREATE TABLE IF NOT EXISTS chit_cycles (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    due_at TEXT NOT NULL,
    auction_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('UPCOMING', 'OPEN_FOR_PAYMENT', 'AUCTION_SCHEDULED', 'AUCTION_ACTIVE', 'AUCTION_CLOSED', 'SETTLED')),
    winner_membership_id TEXT REFERENCES group_memberships(id),
    winning_bid_discount_minor INTEGER DEFAULT 0,
    dividend_per_member_minor INTEGER DEFAULT 0,
    organizer_commission_minor INTEGER DEFAULT 0,
    payout_amount_minor INTEGER DEFAULT 0,
    result_signature TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, sequence_no)
);

-- 9. Contribution Obligations (What a member owes for a cycle)
CREATE TABLE IF NOT EXISTS contribution_obligations (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL REFERENCES chit_cycles(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
    base_amount_minor INTEGER NOT NULL,
    dividend_deduction_minor INTEGER DEFAULT 0,
    penalty_minor INTEGER DEFAULT 0,
    net_payable_minor INTEGER NOT NULL,
    amount_paid_minor INTEGER DEFAULT 0,
    due_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE', 'WAIVED')),
    paid_at TEXT,
    UNIQUE(cycle_id, membership_id)
);

-- 10. Payment Intents & Settlements
CREATE TABLE IF NOT EXISTS payment_intents (
    id TEXT PRIMARY KEY,
    obligation_id TEXT NOT NULL REFERENCES contribution_obligations(id),
    payer_user_id TEXT NOT NULL REFERENCES users(id),
    amount_minor INTEGER NOT NULL,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('UPI_COLLECT', 'UPI_QR', 'NETBANKING', 'CASH_FIELD_AGENT', 'OFFLINE_CASH', 'OFFLINE_DIRECT_HOST')),
    collector_id TEXT REFERENCES users(id),
    verified_by_host_id TEXT REFERENCES users(id),
    offline_notes TEXT,
    provider_ref TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED', 'PENDING_HOST_VERIFICATION', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED')),
    created_at TEXT NOT NULL,
    settled_at TEXT
);

-- 11. Bids (Member bids during live or sealed auction)
CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL REFERENCES chit_cycles(id) ON DELETE CASCADE,
    membership_id TEXT NOT NULL REFERENCES group_memberships(id) ON DELETE CASCADE,
    bid_discount_minor INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'VALID' CHECK(status IN ('VALID', 'WITHDRAWN', 'OUTBID', 'WINNING')),
    is_winning INTEGER DEFAULT 0
);

-- 12. Payouts (Disbursement to auction winner with Maker-Checker dual control)
CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL REFERENCES chit_cycles(id),
    winner_membership_id TEXT NOT NULL REFERENCES group_memberships(id),
    beneficiary_user_id TEXT NOT NULL REFERENCES users(id),
    gross_amount_minor INTEGER NOT NULL,
    commission_deducted_minor INTEGER NOT NULL,
    net_payout_minor INTEGER NOT NULL,
    bank_account_masked TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    maker_user_id TEXT REFERENCES users(id),
    maker_initiated_at TEXT,
    checker_user_id TEXT REFERENCES users(id),
    checker_approved_at TEXT,
    approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISBURSED')),
    provider_payout_ref TEXT,
    disbursed_at TEXT
);

-- 13. Chart of Accounts (Double-Entry Core)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    balance_minor INTEGER DEFAULT 0
);

-- 14. Ledger Transactions (Balanced journal header)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES chit_groups(id),
    cycle_id TEXT REFERENCES chit_cycles(id),
    source_type TEXT NOT NULL CHECK(source_type IN (
        'CONTRIBUTION_PAYMENT',
        'AUCTION_SETTLEMENT',
        'PAYOUT_DISBURSEMENT',
        'COMPENSATING_REVERSAL',
        'DELINQUENCY_PENALTY'
    )),
    source_id TEXT NOT NULL,
    description TEXT NOT NULL,
    total_amount_minor INTEGER NOT NULL,
    posted_at TEXT NOT NULL,
    posted_by TEXT NOT NULL
);

-- 15. Ledger Entries (Balanced debits & credits)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES chart_of_accounts(id),
    entry_type TEXT NOT NULL CHECK(entry_type IN ('DEBIT', 'CREDIT')),
    amount_minor INTEGER NOT NULL,
    membership_id TEXT REFERENCES group_memberships(id),
    created_at TEXT NOT NULL
);

-- 16. Delinquencies (Overdue tracking and grace period)
CREATE TABLE IF NOT EXISTS delinquencies (
    id TEXT PRIMARY KEY,
    obligation_id TEXT NOT NULL REFERENCES contribution_obligations(id),
    membership_id TEXT NOT NULL REFERENCES group_memberships(id),
    overdue_days INTEGER DEFAULT 1,
    penalty_applied_minor INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'GRACE_PERIOD' CHECK(status IN ('GRACE_PERIOD', 'FORMAL_NOTICE', 'RECOVERY_ASSIGNED', 'RESOLVED', 'DEFAULTED')),
    assigned_collector_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

-- 17. Support Cases & Disputes
CREATE TABLE IF NOT EXISTS support_cases (
    id TEXT PRIMARY KEY,
    raised_by_user_id TEXT NOT NULL REFERENCES users(id),
    group_id TEXT REFERENCES chit_groups(id),
    cycle_id TEXT REFERENCES chit_cycles(id),
    category TEXT NOT NULL CHECK(category IN ('PAYMENT_DISPUTE', 'AUCTION_DISPUTE', 'KYC_ISSUE', 'ORGANIZER_MISCONDUCT', 'GENERAL_SUPPORT')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED')),
    assigned_agent_id TEXT REFERENCES users(id),
    resolution_notes TEXT,
    compensating_transaction_id TEXT REFERENCES ledger_transactions(id),
    created_at TEXT NOT NULL,
    resolved_at TEXT
);

-- 18. Conversations & Messages (In-app communication)
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'GROUP_CHAT' CHECK(type IN ('GROUP_CHAT', 'ANNOUNCEMENT')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    is_announcement INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 19. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK(channel IN ('IN_APP', 'SMS', 'PUSH')),
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- 20. Audit Events (Tamper-evident cryptographically signed hash-chain)
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    before_state_hash TEXT,
    after_state_hash TEXT NOT NULL,
    metadata_json TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memberships_group ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_cycles_group ON chit_cycles(group_id);
CREATE INDEX IF NOT EXISTS idx_obligations_cycle ON contribution_obligations(cycle_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_group ON ledger_transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_obj ON audit_events(object_type, object_id);
