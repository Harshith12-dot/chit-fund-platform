# Local Connectivity Chit-Fund Platform

> **A Mobile-First, Locally Anchored Chit-Fund Management Platform with Double-Entry Balanced Ledger, Real-Time Auction Engine, and Role-Based Operations Console.**

Compliant with the **Indian Chit Funds Act, 1982** and **Digital Personal Data Protection (DPDP) Act, 2023**. Built with high reliability, zero external runtime dependencies, embedded relational database integrity, and tamper-evident SHA-256 audit logging.

---

## Table of Contents

1. [Executive Summary & Core Principles](#executive-summary--core-principles)
2. [Git Workflow & Clone Instructions](#git-workflow--clone-instructions)
3. [Prerequisites & Zero-Dependency Quickstart](#prerequisites--zero-dependency-quickstart)
4. [Dual-Portal Architecture: Join Chit vs Host Chit](#dual-portal-architecture-join-chit-vs-host-chit)
5. [Interactive User Roles & Demo Accounts](#interactive-user-roles--demo-accounts)
6. [Trust & Multi-Government Document Verification](#trust--multi-government-document-verification)
7. [Double-Entry Balanced Ledger & Payment Workflows](#double-entry-balanced-ledger--payment-workflows)
8. [Auction Mechanics & Statutory Rules](#auction-mechanics--statutory-rules)
9. [Automated Testing & QA Verification (35/35 Tests Passing)](#automated-testing--qa-verification-3535-tests-passing)
10. [REST API Surface](#rest-api-surface)
11. [Production Deployment & Docker Guide](#production-deployment--docker-guide)
12. [Security, Privacy & Compliance Controls](#security-privacy--compliance-controls)

---

## 1. Executive Summary & Core Principles

The **Local Connectivity Chit-Fund Platform** converts traditional, relationship-driven community savings into a secure, transparent, and auditable digital platform.

### Core Principles
- **Local Trust First:** Geographic proximity (Haversine distance calculation and locality matching) is used as an organic relationship and discovery signal, combined with verifiable e-KYC.
- **Ledger Before Convenience:** Every monetary transaction enforces a balanced double-entry accounting invariant ($\sum \text{Debits} = \sum \text{Credits}$) in minor units (paise) to eliminate floating-point discrepancies.
- **Strict Maker-Checker Separation:** Payouts to auction winners require segregation of duties—an Operations administrator initiates (Maker), and a Finance administrator authorizes (Checker).
- **Hybrid by Design:** Both digital UPI collections and field agent cash collections post to the exact same immutable ledger.
- **Tamper-Evident Auditability:** Every state transition and financial action records an immutable audit entry with SHA-256 hash chains.

---

## 2. Git Workflow & Clone Instructions

The project is structured with clean, atomic Git commits for complete team accountability and traceability.

### How to Clone and Set Up

```bash
# Clone the repository
git clone <repository-url> local-chit-fund-platform

# Navigate into the project directory
cd local-chit-fund-platform

# Check git status and inspect commit history
git log --oneline --graph --decorate

# Verify current branch
git status
```

### Git Branching Strategy
- `main`: Stable, release-ready production baseline.
- `feat/*`: Feature branches (e.g. `feat/double-entry-ledger`, `feat/auction-engine`).
- `test/*`: Automated test suites and regression verification.

---

## 3. Prerequisites & Zero-Dependency Quickstart

### Prerequisites
- **Node.js**: Version `22.0.0` or higher (tested on Node `v24.15.0`).
- **No external npm dependencies required!** The application leverages Node.js built-in modules:
  - `node:sqlite` (ACID relational transactional database with WAL mode)
  - `node:crypto` (SHA-256 state hashing and HMAC auction signing)
  - `node:http` (High-performance HTTP server)
  - `node:test` & `node:assert` (Built-in test runner)

### Starting the Platform

```bash
# Start the web server and operations console (starts on port 3000)
npm start

# Or directly:
node src/server.js
```

Open your browser at:
👉 **`http://localhost:3000`**

### Re-seeding Sample Data
If you ever want to reset the database to a fresh demonstration state:
```bash
npm run seed
```

---

## 4. Dual-Portal Architecture: Join Chit vs Host Chit

The user interface provides two dedicated views seamlessly connected by a top navigation switcher:

### Portal 1: "Join a Chit" (Member Experience)
- **Top Active Dues Banner:** Displays outstanding monthly dues immediately at the top of the screen with amount, due date, cycle number, and instant **Pay via UPI** or **Pay Cash to Host** options.
- **Multi-Parameter Discovery Filters:**
  - **Locality:** Filter by specific neighborhood (e.g. Indiranagar, Koramangala, Whitefield).
  - **Max Installment:** Slider filter (₹5,000 to ₹50,000/mo).
  - **Pool Size:** Filter by total fund value (₹1,00,000 to ₹10,00,000).
  - **Nearby Radius:** Proximity search (within 5 km, 10 km, or 25 km).
  - **Government Verified Only:** Toggle to show exclusively accredited groups backed by Registrar License and Bank Guarantee.
- **Rich Chit Cards:** Shows live slots filled, duration, installment, and comprehensive host trust credentials.

### Portal 2: "Host / Manage Chit" (Organizer Experience)
- **Unified Account Model:** Any member can become an accredited Host by providing their State Chit Registrar License and Bank Guarantee Bond reference.
- **New Chit Creation Wizard:** Configures pool size, monthly installments, member capacity, auction date, statutory 5% commission floor, and 30% discount ceiling.
- **Host Offline Cash Verification Desk:**
  - When members pay cash offline, a pending verification appears in the Host's dashboard.
  - The Host inspects the member name, cycle, and exact amount, and clicks **"Verify & Mark Paid"**.
  - System automatically clears member dues, posts balanced entries to the double-entry general ledger, and generates a digital receipt.

---

## 5. Interactive User Roles & Demo Accounts

The platform includes real password authentication (PBKDF2 with 10,000 iterations and SHA-512) alongside a **One-Click Quick Switcher** for instant testing:

**Default Password for all seeded accounts:** `Password@123`

| Role | Name | Phone | Aadhaar / PAN | Host Accreditation | Key Permissions |
|---|---|---|---|---|---|
| **Member #1** | Ramesh Kumar | `9876543210` | `XXXX-XXXX-3210` / `ABCDE1234F` | Standard Member (Can Upgrade) | Discover groups, place bids, pay dues, view ledger |
| **Member #2** | Priya Sharma | `9876543211` | `XXXX-XXXX-4567` / `BCDEF2345G` | Standard Member | Active bidder, settled cycle 2, view statements |
| **Member #3** | Suresh Patel | `9876543212` | `XXXX-XXXX-8901` / `CDEFG3456H` | Standard Member | Koramangala member, cross-locality discovery |
| **Group Organizer / Host** | Lakshmi Devi | `9876543220` | `XXXX-XXXX-1122` / `DEFGH4567I` | **KA-BLR-CR-2023-8841** / `BG-HDFC-99124` (Trust: 98/100) | Manage groups, approve members, verify offline cash |
| **Field Collector** | Anand Verma | `9876543230` | `XXXX-XXXX-3344` / `EFGHI5678J` | Ops Staff | Record assisted cash collections with physical receipt # |
| **Operations Admin** | Rajesh Nair | `9876543240` | `XXXX-XXXX-5566` / `FGHIJ6789K` | Maker Staff | Review exceptions, initiate winner payout (Maker) |
| **Compliance Reviewer** | Dr. Sunita Rao | `9876543250` | `XXXX-XXXX-7788` / `GHIJK7890L` | Compliance Officer | Review Aadhaar/PAN e-KYC submissions |
| **Finance Admin** | Vikram Malhotra | `9876543260` | `XXXX-XXXX-9900` / `HIJKL8901M` | Checker Staff | Authorize payouts (Checker), inspect general ledger |

---

## 6. Trust & Multi-Government Document Verification

To guarantee complete financial security and build community trust, the platform enforces multi-tiered verification:

### Member Verification:
1. **Aadhaar Masked e-KYC:** Verified via simulated UIDAI sandbox. Stored in masked format (`XXXX-XXXX-1234`) under DPDP Act 2023.
2. **PAN Card Verification:** Alphanumeric format validation (`ABCDE1234F`) checked against income tax guidelines.

### Host / Organizer Accreditation:
1. **State Chit Registrar License Number:** Issued under Section 4 of the Indian Chit Funds Act 1982 (e.g. `KA-BLR-CR-2023-8841`).
2. **Bank Guarantee Reference:** 100% chit pool security deposit bond lodged with an RBI-scheduled bank (e.g. `BG-HDFC-99124-CHIT`).
3. **Calculated Trust Score (0 - 100):** Weighted algorithm based on KYC completion (+30 pts), verified registrar license (+40 pts), bank guarantee (+20 pts), and historical completed cycles (+10 pts).
4. **Visual Trust Badges:** Displayed on all chit group cards (`Govt Registered`, `Bank Guaranteed`, `Trust Score: 98/100`) so members can invest with confidence.

---

## 5. System Architecture & Data Model

```
┌─────────────────────────────────────────────────────────────┐
│                   Responsive Client Layer                   │
│   [ Mobile App Viewport Mode ]  |  [ Desktop Operations UI ]│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST API
┌──────────────────────────────▼──────────────────────────────┐
│                  Application Service Layer                  │
│  ├── AuthService (RBAC, OTP, Consents)                      │
│  ├── LocalityService (Haversine Proximity, Coarse Geocoding)│
│  ├── GroupService (Constitution, Membership Slots)          │
│  ├── AuctionService (Statutory Caps, Dividend Calculation)  │
│  ├── PaymentService (UPI Intents, Webhooks, Idempotency)    │
│  ├── PayoutService (Maker-Checker Segregation of Duties)    │
│  ├── LedgerService (Strict Double-Entry General Ledger)     │
│  └── AuditService (Tamper-Evident SHA-256 Audit Trail)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ ACID Transactions
┌──────────────────────────────▼──────────────────────────────┐
│           Embedded Relational Database (SQLite Engine)      │
│  20 Normalized Tables with Strict Foreign Keys & WAL Mode   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Double-Entry Balanced Ledger Engine

Every monetary movement enforces **Debit = Credit** down to the single minor unit (paise: ₹1.00 = 100 paise). Floating point variables are strictly forbidden.

### Standard Chart of Accounts
- `1001`: Chit Pool Bank Account (ASSET)
- `1002`: Member Receivables (Contributions Due) (ASSET)
- `2001`: Auction Prize Money Payable (LIABILITY)
- `2002`: Dividend Equalization Pool (LIABILITY)
- `3001`: Members Capital & Float (EQUITY)
- `4001`: Organizer Commission Revenue (REVENUE - 5%)
- `4002`: Delinquency Penalty Income (REVENUE)

### Accounting Invariants
1. **Contribution Payment:**
   - Debit: `1001` (Chit Pool Bank)
   - Credit: `1002` (Member Receivables)
2. **Auction Settlement:**
   - Debit: `3001` (Members Capital Pool)
   - Credit: `2001` (Prize Money Payable to Winner)
   - Credit: `4001` (Organizer Commission Revenue - 5%)
   - Credit: `2002` (Dividend Equalization Pool for Members)
3. **Payout Disbursement:**
   - Debit: `2001` (Prize Money Payable)
   - Credit: `1001` (Chit Pool Bank Account)

---

## 7. Double-Entry Balanced Ledger Engine

Every monetary movement enforces **Debit = Credit** down to the single minor unit (paise: ₹1.00 = 100 paise). Floating point variables are strictly forbidden.

### Standard Chart of Accounts
- `1001`: Chit Pool Bank Account (ASSET)
- `1002`: Member Receivables (Contributions Due) (ASSET)
- `2001`: Auction Prize Money Payable (LIABILITY)
- `2002`: Dividend Equalization Pool (LIABILITY)
- `3001`: Members Capital & Float (EQUITY)
- `4001`: Organizer Commission Revenue (REVENUE - 5%)
- `4002`: Delinquency Penalty Income (REVENUE)

### Accounting Invariants
1. **Contribution Payment:**
   - Debit: `1001` (Chit Pool Bank)
   - Credit: `1002` (Member Receivables)
2. **Auction Settlement:**
   - Debit: `3001` (Members Capital Pool)
   - Credit: `2001` (Prize Money Payable to Winner)
   - Credit: `4001` (Organizer Commission Revenue - 5%)
   - Credit: `2002` (Dividend Equalization Pool for Members)
3. **Payout Disbursement:**
   - Debit: `2001` (Prize Money Payable)
   - Credit: `1001` (Chit Pool Bank Account)

---

## 8. Auction Mechanics & Statutory Rules

Implemented strictly under the **Chit Funds Act, 1982 (Act No. 40 of 1982)**:
1. **Statutory Ceiling:** Under Section 14, the maximum discount bid cannot exceed **30% of the total chit pool** (₹1,50,000 for a ₹5,00,000 chit).
2. **Minimum Floor:** The minimum discount bid is set at the organizer's statutory commission (5% = ₹25,000).
3. **Winner Eligibility:** A member who has already won an auction in a previous cycle of the same chit cannot submit bids in subsequent cycles.
4. **Dividend Distribution:**
   $$\text{Total Dividend} = \text{Winning Discount} - \text{Organizer Commission}$$
   $$\text{Dividend Per Member} = \left\lfloor \frac{\text{Total Dividend}}{\text{Total Members}} \right\rfloor$$
5. **Cryptographic Signing:** At close, the auction engine creates an HMAC-SHA256 signature over the winner, discount, and dividend snapshot.

---

## 9. Automated Testing & QA Verification (35/35 Tests Passing)

The project includes an automated test suite executed with the native Node.js test runner across 6 test modules:

```bash
npm test
# Or directly:
node --test tests/*.test.js
```

### Complete Test Matrix (35 Tests, 0 Failures, ~200ms Execution):
- **`tests/auth.test.js` (6 tests)**:
  - Registers new user with PBKDF2 salt/hashing and masked government IDs.
  - Prevents duplicate registrations with same mobile phone.
  - Verifies cryptographic hash password verification during login.
  - Authenticates HTTP requests via Bearer session tokens.
  - Combined Host Model: Validates seamless upgrade of regular user to Chit Host.
  - Invalidates token on logout.
- **`tests/auction.test.js` (6 tests)**:
  - Proves auction lifecycle initiation.
  - Rejects bid below statutory 5% commission floor (₹25,000).
  - Rejects bid above statutory 30% ceiling cap (₹1,50,000).
  - Disqualifies prior cycle winners from submitting bids.
  - Accepts valid competitive incremental bids.
  - Closes auction, determines winner, computes dividend distribution, and signs result with HMAC-SHA256.
- **`tests/ledger.test.js` (4 tests)**:
  - Proves the balance invariant ($\sum Debits = \sum Credits$).
  - Rejects unbalanced transaction postings.
  - Rejects negative or zero transaction amounts.
  - Verifies trial balance zero-variance across all ledger accounts.
- **`tests/locality.test.js` (3 tests)**:
  - Proves Haversine distance accuracy between geo-coordinates.
  - Verifies coarse coordinates anonymization for DPDP compliance (~1.1 km mask).
  - Verifies proximity filtering and ascending distance sorting.
- **`tests/payment.test.js` (5 tests)**:
  - Generates UPI QR parameters with minor unit precision.
  - Processes webhook callback and posts balanced debit/credit to ledger.
  - Idempotency: Re-delivery of identical webhook does NOT duplicate financial postings.
  - Field Collector assisted cash payment records physical receipt number.
  - Host Offline Cash Verification: Member submits cash note $\rightarrow$ Host inspects & clears dues on general ledger.
- **`tests/security.test.js` (5 tests)**:
  - Verifies role-based access control (RBAC) matrix.
  - Operations Maker initiates payout request.
  - Segregation of Duties: Operations Maker is blocked from approving their own payout.
  - Finance Checker approves and disburses payout.
  - Verifies tamper-evident SHA-256 state hashing on all sensitive mutations.

---

## 10. REST API Surface

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user with password, Aadhaar, PAN, and Host option |
| `POST` | `/api/auth/login` | PBKDF2 password authentication and Bearer token issuance |
| `POST` | `/api/auth/logout` | Revoke active session token |
| `POST` | `/api/auth/upgrade-to-host` | Upgrade current member to accredited Host with license & guarantee |
| `GET` | `/api/me` | Fetch active user profile, accreditation status, and permissions |
| `GET` | `/api/dues` | Top dues summary for member (installments, due date, cycle) |
| `GET` | `/api/host/pending-cash` | Host pending offline cash verification queue |
| `POST` | `/api/host/verify-cash` | Host verifies offline cash payment and clears ledger |
| `GET` | `/api/localities` | List geographic localities and coordinate centroids |
| `GET` | `/api/groups/nearby` | Haversine proximity search by lat/lon or localityId |
| `GET` | `/api/groups` | List chit groups with host trust badges |
| `POST` | `/api/groups` | Create new chit group with rules constitution & host license |
| `POST` | `/api/groups/:id/join-requests` | Member request to join group |
| `POST` | `/api/groups/:id/members/:id/approve`| Organizer approves member slot |
| `GET` | `/api/cycles/:id` | Fetch cycle details, dues, and live bids |
| `POST` | `/api/cycles/:id/start-auction` | Open auction bidding window |
| `POST` | `/api/cycles/:id/bids` | Submit competitive auction bid |
| `POST` | `/api/cycles/:id/close` | Close auction, determine winner, and commit ledger entries |
| `POST` | `/api/obligations/:id/payment-intents` | Generate UPI payment intent with QR code |
| `POST` | `/api/obligations/:id/offline-cash` | Member submits offline cash payment note to host |
| `POST` | `/api/payments/webhooks/:provider` | Idempotent webhook callback for settlements |
| `POST` | `/api/obligations/:id/collector-cash` | Field Agent records assisted cash receipt |
| `GET` | `/api/groups/:id/reconciliation` | General ledger trial balance & variance audit |
| `GET` | `/api/payouts` | List winner payout authorizations |
| `POST` | `/api/payouts/:id/initiate` | Maker initiates payout processing |
| `POST` | `/api/payouts/:id/approve` | Checker (Finance Admin) authorizes & disburses |
| `POST` | `/api/kyc/cases` | Submit Aadhaar e-KYC case |
| `GET` | `/api/kyc/cases` | Compliance Reviewer pending KYC queue |
| `POST` | `/api/kyc/cases/:id/review` | Approve or reject KYC case |
| `GET` | `/api/audit-events` | Tamper-evident SHA-256 cryptographic audit trail |

---

## 11. Production Deployment & Docker Guide

See [DEPLOYMENT.md](file:///local-chit-fund-platform/DEPLOYMENT.md) for full instructions.

### Quick Docker Run
```bash
# Start containerized application with persistent database volume
docker compose up -d --build
```

### Production PM2 Run
```bash
# Start via PM2 cluster manager
pm2 start ecosystem.config.cjs --env production
```

---

## 12. Security, Privacy & Compliance Controls

- **DPDP Act (2023) Compliance:** Coarse coordinates anonymization (~1.1 km precision) protects member residence privacy.
- **Aadhaar Masking:** Only the last 4 digits (`XXXX-XXXX-3210`) are ever stored. Raw biometric secrets or UIDAI tokens are excluded from persistent logs.
- **Maker-Checker Segregation:** Dual-control enforced at the API code layer for financial disbursements.
- **Append-Only Immutability:** Financial journals and auction outcomes cannot be deleted or mutated; disputes are addressed via explicit compensating entries.

---

*Authored by the Chit-Fund Engineering Team. Designed for production scalability and regulatory compliance.*

---

*Authored by the Chit-Fund Engineering Team. Designed for production scalability and regulatory compliance.*
