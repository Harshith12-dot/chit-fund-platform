# Local Connectivity Chit-Fund Platform

> **A Mobile-First, Locally Anchored Chit-Fund Management Platform with Double-Entry Balanced Ledger, Real-Time Auction Engine, and Role-Based Operations Console.**

Compliant with the **Indian Chit Funds Act, 1982** and **Digital Personal Data Protection (DPDP) Act, 2023**. Built with high reliability, zero external runtime dependencies, embedded relational database integrity, and tamper-evident SHA-256 audit logging.

---

## Table of Contents

1. [Executive Summary & Core Principles](#executive-summary--core-principles)
2. [Git Workflow & Clone Instructions](#git-workflow--clone-instructions)
3. [Prerequisites & Zero-Dependency Quickstart](#prerequisites--zero-dependency-quickstart)
4. [Interactive User Roles & Demo Accounts](#interactive-user-roles--demo-accounts)
5. [System Architecture & Data Model](#system-architecture--data-model)
6. [Double-Entry Balanced Ledger Engine](#double-entry-balanced-ledger-engine)
7. [Auction Mechanics & Statutory Rules](#auction-mechanics--statutory-rules)
8. [Automated Testing & QA Verification](#automated-testing--qa-verification)
9. [REST API Surface](#rest-api-surface)
10. [Security, Privacy & Compliance Controls](#security-privacy--compliance-controls)

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

## 4. Interactive User Roles & Demo Accounts

The platform includes an interactive **One-Click Role Switcher** in the header so you can test all 8 distinct personas defined in Section 4 of the blueprint:

| Role | Name | Phone | Key Permissions |
|---|---|---|---|
| **Member #1** | Ramesh Kumar | `9876543210` | Discover groups, place auction bids, pay monthly dues, view personal ledger |
| **Member #2** | Priya Sharma | `9876543211` | Active bidder, settled cycle 2 payments, view statements |
| **Member #3** | Suresh Patel | `9876543212` | Koramangala member, cross-locality discovery |
| **Group Organizer** | Lakshmi Devi | `9876543220` | Manage group rules, approve join requests, close auctions |
| **Field Collector** | Anand Verma | `9876543230` | Record offline assisted cash collections with physical receipt # |
| **Operations Admin** | Rajesh Nair | `9876543240` | Review exceptions, initiate winner payout (Maker), resolve disputes |
| **Compliance Reviewer** | Dr. Sunita Rao | `9876543250` | Review Aadhaar e-KYC submissions, verify demographic match |
| **Finance Admin** | Vikram Malhotra | `9876543260` | Maker-Checker authorization (Checker), disburse payouts, inspect general ledger |

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

## 7. Auction Mechanics & Statutory Rules

Implemented strictly under the **Chit Funds Act, 1982 (Act No. 40 of 1982)**:
1. **Statutory Ceiling:** Under Section 14, the maximum discount bid cannot exceed **30% of the total chit pool** (₹1,50,000 for a ₹5,00,000 chit).
2. **Minimum Floor:** The minimum discount bid is set at the organizer's statutory commission (5% = ₹25,000).
3. **Winner Eligibility:** A member who has already won an auction in a previous cycle of the same chit cannot submit bids in subsequent cycles.
4. **Dividend Distribution:**
   $$\text{Total Dividend} = \text{Winning Discount} - \text{Organizer Commission}$$
   $$\text{Dividend Per Member} = \left\lfloor \frac{\text{Total Dividend}}{\text{Total Members}} \right\rfloor$$
5. **Cryptographic Signing:** At close, the auction engine creates an HMAC-SHA256 signature over the winner, discount, and dividend snapshot.

---

## 8. Automated Testing & QA Verification

The project includes an automated test suite executed with the native Node.js test runner:

```bash
npm test
```

### Test Coverage Highlights (27 Tests, 0 Failures):
- **`tests/ledger.test.js`**: Proves the balance invariant ($\sum Debits = \sum Credits$), rejects unbalanced transactions, verifies trial balance zero-variance.
- **`tests/auction.test.js`**: Proves min/max statutory discount caps, outbid progression, prior-winner disqualification, dividend math, and cryptographic signature generation.
- **`tests/payment.test.js`**: Proves UPI QR generation, webhook processing, idempotency protection against duplicate replay, and hybrid field cash collection.
- **`tests/locality.test.js`**: Proves Haversine distance accuracy, proximity radius sorting, and coarse location privacy mask.
- **`tests/security.test.js`**: Proves RBAC permissions matrix, Maker-Checker segregation of duties (Maker cannot approve their own payout), and SHA-256 audit hashing.

---

## 9. REST API Surface

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/otp` | Request phone OTP for login |
| `POST` | `/api/auth/verify` | Verify OTP and issue session token |
| `GET` | `/api/me` | Fetch current user profile and role permissions |
| `GET` | `/api/localities` | List geographic localities and coordinate centroids |
| `GET` | `/api/groups/nearby` | Haversine proximity search by lat/lon or localityId |
| `GET` | `/api/groups` | List chit groups |
| `POST` | `/api/groups` | Create new chit group with rules constitution |
| `POST` | `/api/groups/:id/join-requests` | Member request to join group |
| `POST` | `/api/groups/:id/members/:id/approve`| Organizer approves member slot |
| `GET` | `/api/cycles/:id` | Fetch cycle details, dues, and live bids |
| `POST` | `/api/cycles/:id/start-auction` | Open auction bidding window |
| `POST` | `/api/cycles/:id/bids` | Submit competitive auction bid |
| `POST` | `/api/cycles/:id/close` | Close auction, determine winner, and commit ledger entries |
| `POST` | `/api/obligations/:id/payment-intents` | Generate UPI payment intent |
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

## 10. Security, Privacy & Compliance Controls

- **DPDP Act (2023) Compliance:** Coarse coordinates anonymization (~1.1 km precision) protects member residence privacy.
- **Aadhaar Masking:** Only the last 4 digits (`XXXX-XXXX-3210`) are ever stored. Raw biometric secrets or UIDAI tokens are excluded from persistent logs.
- **Maker-Checker Segregation:** Dual-control enforced at the API code layer for financial disbursements.
- **Append-Only Immutability:** Financial journals and auction outcomes cannot be deleted or mutated; disputes are addressed via explicit compensating entries.

---

*Authored by the Chit-Fund Engineering Team. Designed for production scalability and regulatory compliance.*
