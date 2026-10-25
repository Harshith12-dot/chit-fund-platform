# Local Connectivity Chit-Fund Platform

> **A Mobile-First, Locally Anchored Chit-Fund Management Platform with Double-Entry Balanced Ledger, Live Reverse-Auction Bidding Arena, Multi-Chit Portfolio Manager, and Section 31 Surety Verification Console.**

Compliant with the **Indian Chit Funds Act, 1982 (Act No. 40 of 1982)**, **Chit Funds (Amendment) Act, 2019**, and **Digital Personal Data Protection (DPDP) Act, 2023**. Built with high reliability, zero external runtime dependencies, embedded relational database integrity (`node:sqlite`), and tamper-evident SHA-256 audit logging.

---

## Table of Contents

1. [Executive Summary & Core Principles](#1-executive-summary--core-principles)
2. [Domain Knowledge & Legal Foundation](#2-domain-knowledge--legal-foundation)
3. [Git Workflow & Clone Instructions](#3-git-workflow--clone-instructions)
4. [Prerequisites & Zero-Dependency Quickstart](#4-prerequisites--zero-dependency-quickstart)
5. [Five Purposeful Navigation Portals](#5-five-purposeful-navigation-portals)
6. [Interactive User Roles & Demo Accounts](#6-interactive-user-roles--demo-accounts)
7. [Trust & Multi-Government Document Verification](#7-trust--multi-government-document-verification)
8. [Double-Entry Balanced Ledger Engine](#8-double-entry-balanced-ledger-engine)
9. [Live Reverse-Auction Arena & Statutory Rules](#9-live-reverse-auction-arena--statutory-rules)
10. [Section 31 Prized Subscriber Surety Verification](#10-section-31-prized-subscriber-surety-verification)
11. [Multi-Chit Portfolio Management](#11-multi-chit-portfolio-management)
12. [Automated Testing & QA Verification (40/40 Tests Passing)](#12-automated-testing--qa-verification-4040-tests-passing)
13. [REST API Surface](#13-rest-api-surface)
14. [Production Deployment & Docker Guide](#14-production-deployment--docker-guide)
15. [Security, Privacy & Compliance Controls](#15-security-privacy--compliance-controls)

---

## 1. Executive Summary & Core Principles

The **Local Connectivity Chit-Fund Platform** converts traditional, relationship-driven community savings into a secure, transparent, and legally compliant digital platform.

### Core Principles
- **Dual Saver/Borrower Engine:** Non-prized members earn continuous dividend yields by keeping their money in the pool, while members needing liquidity borrow immediately via competitive reverse auction discount bids.
- **Strict Statutory Adherence:** Automatically enforces the 5% minimum organizer commission floor and 30% discount ceiling under Section 14, plus tie-breaker Draw of Lots (Lottery) under Section 14(2).
- **Section 31 Surety Safeguard:** Ensures non-prized members are protected against default by enforcing solvent surety submission (Co-Guarantor, FDR Lien, Property Deed, Salary Certificate) before prize payouts are released.
- **Ledger Before Convenience:** Every monetary movement enforces a balanced double-entry accounting invariant ($\sum \text{Debits} = \sum \text{Credits}$) in integer minor units (paise) to completely eliminate floating-point arithmetic errors.
- **Strict Maker-Checker Separation:** Financial payouts require segregation of duties—an Operations administrator initiates (Maker), and a Finance administrator authorizes (Checker).
- **Hybrid by Design:** Both digital UPI collections and offline cash collections post to the exact same immutable ledger once verified by the Chit Host.
- **Tamper-Evident Auditability:** Every state transition and financial action records an immutable audit entry with SHA-256 state hashes.

---

## 2. Domain Knowledge & Legal Foundation

For an in-depth regulatory and mathematical breakdown, consult [`CHIT_FUND_KNOWLEDGE_BASE.md`](file:///c:/Users/Harshith/OneDrive/Desktop/Side%20Channel%20project/local-chit-fund-platform/CHIT_FUND_KNOWLEDGE_BASE.md). Key statutes covered:
- **Chit Funds Act, 1982 (Act No. 40 of 1982):** Primary federal legislation governing chit funds across India.
- **Chit Funds (Amendment) Act, 2019:** Modernized commission ceilings (5% to 7% statutory cap), introduced electronic auctions, and allowed digital signatures.
- **Section 4 & Section 20:** Prior sanction of State Registrar of Chits and mandatory 100% Bank Guarantee / Fixed Deposit in custodial escrow before soliciting subscribers.
- **Section 14:** Minimum 5% discount bid (organizer commission) and 30% maximum statutory discount bid.
- **Section 31:** Mandatory solvent security / surety furnished by prized subscriber before prized money disbursement.

---

## 3. Git Workflow & Clone Instructions

The project is structured with clean, atomic Git commits for complete team accountability and traceability.

### How to Clone and Set Up

```bash
# Clone the repository
git clone <repository-url> local-chit-fund-platform

# Navigate into the project directory
cd local-chit-fund-platform

# Verify commit log and release tags
git log --oneline --graph --decorate

# Verify current branch
git status

# Run the complete automated test suite (40 tests across 7 suites)
npm test

# Start the application server
npm start
```

### Git Branching & Tag Strategy
- `master`: Stable, release-ready production baseline.
- `v1.0.0`: Initial release with dual-portal join/host, e-KYC, and double-entry ledger.
- `v1.1.0`: Live Bidding Arena, simulated competitor bidding, Draw of Lots lottery, Section 31 surety verification desk, and multi-chit portfolio management.

---

## 4. Prerequisites & Zero-Dependency Quickstart

### Prerequisites
- **Node.js**: Version `22.0.0` or higher (tested on Node `v24.15.0`).
- **Zero External npm Runtime Dependencies!** The platform is engineered exclusively with Node.js built-ins:
  - `node:sqlite` (Embedded ACID relational transactional database with WAL mode)
  - `node:crypto` (PBKDF2 passwords, SHA-256 state hashing, HMAC auction signing)
  - `node:http` (High-performance native HTTP server)
  - `node:test` & `node:assert` (Native test runner)

### Starting the Platform

```bash
# Start the web server (defaults to port 3000)
npm start

# Or directly:
node src/server.js
```

Open your browser at:
👉 **`http://localhost:3000`**

### Re-seeding Sample Data
To reset the SQLite database to a pristine demonstration state:
```bash
npm run seed
```

---

## 5. Five Purposeful Navigation Portals

The web interface features 5 purpose-built tabs seamlessly connected by the top navigation bar:

### 1. 🏛️ Live Auction Arena
- **Real-Time Countdown Timer:** Displays ticking remaining auction time (e.g. `00:03:45`).
- **Active Chit Selector:** Switch seamlessly between active auctions (`Cycle #2 - Indiranagar`, `Cycle #3 - Koramangala`).
- **Live Financial Simulator Preview:** Dynamically computes in real time:
  - Total Pool Value (e.g. ₹5,00,000)
  - Current Highest Discount Bid (e.g. ₹95,000)
  - Net Take-Home Lump Sum for Winner ($Pool - Discount$)
  - Total Distributed Dividend ($Discount - 5\% Commission$)
  - Dividend Credit per Subscriber ($Total Dividend \div Members$)
  - Next Month's Net Installment ($Base - Dividend$)
- **Interactive Quick-Bid Increments:**
  - `+₹1,000`, `+₹5,000`, `+₹10,000` one-click quick bid increments.
  - `⚡ Max 30% Cap`: Instantly places the maximum statutory discount ceiling (₹1,50,000).
- **Simulate Competitor Bid:** Simulates another active subscriber placing a higher competitive bid, demonstrating dynamic dividend calculations and multi-participant interactions.
- **Draw of Lots Lottery Modal:** Triggers when multiple members place tied 30% ceiling bids under Section 14(2), fairly picking the winner with instant audit logging.

### 2. 💼 My Portfolio
- **Multi-Ticket Subscriptions:** Tracks all chits subscribed by the logged-in member across multiple groups and ticket numbers (e.g., Ramesh holding Ticket #2 in Indiranagar and Ticket #7 in HSR Retailers).
- **Prized vs Non-Prized Status:**
  - `NON-PRIZED (BIDDER)`: Eligible to participate in the Live Auction Arena.
  - `PRIZED SUBSCRIBER`: Shows cycle won and discount sacrificed.
- **Financial Aggregate Metrics:** Real-time summary cards for Total Subscribed Pool Value, Lifetime Earned Dividends, and Active Due Installments.
- **Direct Navigation Shortcuts:** Jump directly into the live bidding room or view the transaction passbook.

### 3. 🔍 Explore Chits (Member Discovery)
- **Top Active Dues Banner:** Sticky at the top of the viewport, displaying pending monthly dues with **Pay via UPI** or **Pay Cash to Host** actions.
- **Multi-Parameter Discovery Filters:**
  - **Locality:** Filter by specific neighborhood (Indiranagar, Koramangala, HSR Layout, Whitefield, Jayanagar).
  - **Max Installment:** Slider filter (₹5,000 to ₹50,000/mo).
  - **Pool Size:** Filter by total fund value (₹1,00,000 to ₹10,00,000).
  - **Nearby Radius:** Proximity search (within 5 km, 10 km, or 25 km).
  - **Government Verified Only:** Toggle to show exclusively accredited groups backed by Registrar License and Bank Guarantee.
- **Rich Chit Cards:** Shows slots filled, duration, installment, and comprehensive host trust credentials.

### 4. 🛡️ Host Desk (Organizer Console)
- **Unified Account Model:** Any member can upgrade to an accredited Host by furnishing their State Chit Registrar License and Bank Guarantee Bond reference.
- **Host Offline Cash Verification Desk:** Inspects offline cash notes submitted by members, clicks **"Verify & Mark Paid"**, clears dues on the ledger, and issues digital receipts.
- **Section 31 Surety Verification Desk:**
  - Lists pending surety applications from auction winners (Co-Guarantor, FDR Lien, Property Deed, Salary Certificate).
  - Host inspects collateral details and clicks **"Verify & Approve Surety"**, unlocking the maker-checker payout authorization lifecycle.
- **New Chit Creation Wizard:** Configures pool size, monthly installments, member capacity, auction schedule, statutory 5% commission floor, and 30% discount ceiling.

### 5. 📊 Balanced Ledger & Trust
- **General Ledger Trial Balance:** Verifies zero variance ($\sum Debits - \sum Credits = 0$) across all chart of accounts.
- **Cryptographic Audit Trail:** Displays immutable SHA-256 state hashes for all financial postings, auction closures, and user actions.

---

## 6. Interactive User Roles & Demo Accounts

The platform includes real password authentication (PBKDF2 with 10,000 iterations and SHA-512) alongside a **One-Click Quick Switcher** for instant testing:

**Default Password for all seeded accounts:** `Password@123`

| Role | Name | Phone | Aadhaar / PAN | Host Accreditation | Key Permissions |
|---|---|---|---|---|---|
| **Member #1** | Ramesh Kumar | `9876543210` | `XXXX-XXXX-3210` / `ABCDE1234F` | Standard Member (Holds Tickets #2 & #7) | Discover chits, live bidding arena, multi-chit portfolio |
| **Member #2** | Priya Sharma | `9876543211` | `XXXX-XXXX-4567` / `BCDEF2345G` | Standard Member (Holds Tickets #3 & #14) | Active bidder, cycle 2 winner, surety applicant |
| **Member #3** | Suresh Patel | `9876543212` | `XXXX-XXXX-8901` / `CDEFG3456H` | Standard Member (Holds Ticket #5) | Koramangala member, cross-locality discovery |
| **Group Organizer / Host** | Lakshmi Devi | `9876543220` | `XXXX-XXXX-1122` / `DEFGH4567I` | **KA-BLR-CR-2023-8841** / `BG-HDFC-99124` (Trust: 98/100) | Manage groups, verify offline cash & Section 31 sureties |
| **Field Collector** | Anand Verma | `9876543230` | `XXXX-XXXX-3344` / `EFGHI5678J` | Ops Staff | Record assisted cash collections with physical receipt # |
| **Operations Admin** | Rajesh Nair | `9876543240` | `XXXX-XXXX-5566` / `FGHIJ6789K` | Maker Staff | Review exceptions, initiate winner payout (Maker) |
| **Compliance Reviewer** | Dr. Sunita Rao | `9876543250` | `XXXX-XXXX-7788` / `GHIJK7890L` | Compliance Officer | Review Aadhaar/PAN e-KYC submissions |
| **Finance Admin** | Vikram Malhotra | `9876543260` | `XXXX-XXXX-9900` / `HIJKL8901M` | Checker Staff | Authorize payouts (Checker), inspect general ledger |

---

## 7. Trust & Multi-Government Document Verification

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

## 8. Double-Entry Balanced Ledger Engine

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
   - Debit: `1001` (Chit Pool Bank Account)
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

## 9. Live Reverse-Auction Arena & Statutory Rules

Implemented strictly under the **Chit Funds Act, 1982 (Act No. 40 of 1982)** and 2019 Amendments:

1. **Statutory Ceiling:** Under Section 14, the maximum discount bid cannot exceed **30% of the total chit pool** (₹1,50,000 for a ₹5,00,000 chit).
2. **Minimum Floor:** The minimum discount bid is set at the organizer's statutory commission (5% = ₹25,000).
3. **Winner Eligibility:** A member who has already won an auction in a previous cycle of the same chit cannot submit bids in subsequent cycles.
4. **Dividend Distribution:**
   $$\text{Total Dividend} = \text{Winning Discount} - \text{Organizer Commission (5\%)}$$
   $$\text{Dividend Per Member} = \left\lfloor \frac{\text{Total Dividend}}{\text{Total Members}} \right\rfloor$$
5. **Draw of Lots (Tie-Breaker Lottery):** When multiple members bid the maximum statutory ceiling (30%), the law mandates that the winner be selected through an impartial draw of lots among tied ceiling bidders.
6. **Cryptographic Signing:** At close, the auction engine creates an HMAC-SHA256 signature over the winner, discount, and dividend snapshot.

---

## 10. Section 31 Prized Subscriber Surety Verification

Under Section 31 of the Chit Funds Act, a prized subscriber who wins the auction is legally required to furnish solvent security/sureties for future installments before prize money is disbursed:

### Supported Surety Instruments:
- **Co-Guarantor:** Fellow solvent chit members or external creditworthy guarantors.
- **FDR Lien:** Assignment of Fixed Deposit Receipt held with an RBI-scheduled bank.
- **Property Deed:** Registered deposit of title deeds or non-encumbrance certificate.
- **Salary Certificate:** Irrevocable salary deduction authorization from employer.

### Host Verification Workflow:
1. Winner submits surety documentation (`POST /api/sureties`).
2. Host reviews the surety dossier in the Host Desk (`GET /api/host/pending-sureties`).
3. Host inspects solvency documentation and approves (`POST /api/host/verify-surety/:id`).
4. Payout is unlocked for maker-checker disbursement.

---

## 11. Multi-Chit Portfolio Management

Subscribers often hold multiple tickets across different chit groups for distinct financial goals (e.g. short-term working capital vs long-term wealth creation).

- **Multi-Ticket Tracking:** View all ticket slots (e.g., Ticket #2 in 20-month Indiranagar, Ticket #7 in 25-month HSR Retailers).
- **Consolidated Cashflow:** Real-time calculation of net monthly outflow ($Installments - Dividends$).
- **Lifecycle Progression:** Clear indicators showing non-prized bidding eligibility vs prized status with remaining liability.

---

## 12. Automated Testing & QA Verification (40/40 Tests Passing)

The project includes an automated test suite executed with the native Node.js test runner across 7 comprehensive test modules:

```bash
npm test
# Or directly:
node --test tests/*.test.js
```

### Complete Test Matrix (40 Tests, 100% Pass Rate, ~340ms Execution):
- **`tests/multiChitAndBidding.test.js` (5 tests)**:
  - Multi-chit portfolio calculation across memberships, ticket slots, dividends, and dues.
  - Live bidding room state with real-time financial calculations and eligible bidders.
  - Simulated competitor bidding dynamically from an eligible member.
  - Tied bids at maximum statutory ceiling and cryptographically fair lottery draw.
  - Section 31 surety submission and Host verification before payout release.
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

## 13. REST API Surface

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user with password, Aadhaar, PAN, and Host option |
| `POST` | `/api/auth/login` | PBKDF2 password authentication and Bearer token issuance |
| `POST` | `/api/auth/logout` | Revoke active session token |
| `POST` | `/api/auth/upgrade-to-host` | Upgrade current member to accredited Host with license & guarantee |
| `GET` | `/api/me` | Fetch active user profile, accreditation status, and permissions |
| `GET` | `/api/portfolio` | Fetch member's multi-chit portfolio, tickets, dividends & dues |
| `GET` | `/api/dues` | Top dues summary for member (installments, due date, cycle) |
| `GET` | `/api/cycles/:id/bidding-room` | Live auction room state with high bid, financial preview & bidders |
| `POST` | `/api/cycles/:id/simulate-competitor-bid` | Simulate another subscriber submitting a higher auction bid |
| `POST` | `/api/cycles/:id/lottery` | Execute fair draw-of-lots lottery when ceiling bids are tied |
| `POST` | `/api/sureties` | Prized subscriber submits Section 31 surety collateral |
| `GET` | `/api/host/pending-sureties` | Host queue of pending Section 31 surety submissions |
| `POST` | `/api/host/verify-surety/:id` | Host approves or rejects prized subscriber surety |
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

## 14. Production Deployment & Docker Guide

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

## 15. Security, Privacy & Compliance Controls

- **DPDP Act (2023) Compliance:** Coarse coordinates anonymization (~1.1 km precision) protects member residence privacy.
- **Aadhaar Masking:** Only the last 4 digits (`XXXX-XXXX-3210`) are ever stored. Raw biometric secrets or UIDAI tokens are excluded from persistent logs.
- **Section 31 Surety Verification:** Protects collective savings by withholding prize money until solvent security is approved by the Host.
- **Maker-Checker Segregation:** Dual-control enforced at the API code layer for financial disbursements.
- **Append-Only Immutability:** Financial journals and auction outcomes cannot be deleted or mutated; disputes are addressed via explicit compensating entries.

---

*Authored by the Chit-Fund Engineering Team. Designed for production scalability and statutory compliance under the Indian Chit Funds Act, 1982.*
