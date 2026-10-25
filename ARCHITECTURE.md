# Technical Architecture Specification: Local Connectivity Chit-Fund Platform

## 1. System Overview

The Local Connectivity Chit-Fund Platform is designed as a modular, domain-driven monolith with strict relational integrity, an immutable append-only ledger, and an embedded event audit system.

```mermaid
flowchart TD
    subgraph Clients["Presentation Layer"]
        MApp["Mobile App Client (PWA/Responsive)"]
        OpsUI["Operations & Finance Console"]
    end

    subgraph Gateway["API Gateway / Router"]
        Router["Native Node.js HTTP Router"]
        AuthM["Auth & RBAC Middleware"]
    end

    subgraph Services["Core Domain Services"]
        AuthSvc["Auth & Consents Service"]
        LocSvc["Locality & Proximity Discovery"]
        GrpSvc["Group Constitution & Slots"]
        CycSvc["Chit Cycles Manager"]
        AucSvc["Auction & Dividend Engine"]
        PaySvc["Payment & Idempotent Webhook"]
        LedSvc["Double-Entry Balanced Ledger"]
        PoutSvc["Maker-Checker Payout Engine"]
        AudSvc["SHA-256 Tamper-Evident Audit"]
    end

    subgraph DataStore["Persistence Layer (ACID Relational)"]
        SQLite[("Embedded Relational Database (WAL Mode)")]
    end

    Clients --> Router
    Router --> AuthM
    AuthM --> Services
    Services --> SQLite
```

---

## 2. Domain Entities & Database Schema

The persistence model separates identity, financial commitments, actual money movement, operational governance, and audit trails into 20 normalized relational tables.

```mermaid
erDiagram
    users ||--o{ user_profiles : "has"
    users ||--o{ user_consents : "signs"
    users ||--o{ kyc_cases : "submits"
    localities ||--o{ chit_groups : "anchors"
    localities ||--o{ user_profiles : "resides_in"
    users ||--o{ chit_groups : "organizes"
    chit_groups ||--o{ group_memberships : "contains"
    users ||--o{ group_memberships : "enrolled_as"
    chit_groups ||--o{ chit_cycles : "schedules"
    chit_cycles ||--o{ contribution_obligations : "generates"
    group_memberships ||--o{ contribution_obligations : "owes"
    contribution_obligations ||--o{ payment_intents : "settled_by"
    chit_cycles ||--o{ bids : "receives"
    group_memberships ||--o{ bids : "places"
    chit_cycles ||--o{ payouts : "awards"
    group_memberships ||--o{ payouts : "benefits"
    payouts ||--o{ sureties : "secured_by"
    group_memberships ||--o{ sureties : "furnishes"
    users ||--o{ sureties : "verified_by"
    chit_groups ||--o{ ledger_transactions : "records"
    ledger_transactions ||--o{ ledger_entries : "contains"
    chart_of_accounts ||--o{ ledger_entries : "classifies"
    users ||--o{ audit_events : "triggers"
```

---

## 3. Double-Entry Accounting Architecture

The platform uses a balanced general ledger model where every monetary transaction contains at least one debit and one credit entry such that:

$$\sum \text{Debit Amounts} - \sum \text{Credit Amounts} = 0$$

All monetary amounts are represented as 64-bit integer minor units (paise: ₹1 = 100 paise) to avoid floating-point rounding errors.

### Chart of Accounts

| Account Code | Account Name | Normal Balance | Classification | Description |
|---|---|---|---|---|
| `1001` | Chit Pool Bank Account | Debit | Asset | Custodial pool bank account holding member contributions |
| `1002` | Member Receivables | Debit | Asset | Outstanding monthly contribution dues owed by members |
| `2001` | Auction Prize Money Payable | Credit | Liability | Net prize fund owed to the winning bidder |
| `2002` | Dividend Equalization Pool | Credit | Liability | Unallocated/distributed dividends awaiting cycle deduction |
| `3001` | Members Capital & Float | Credit | Equity | Total cumulative pool commitment of the chit group |
| `4001` | Organizer Commission Revenue | Credit | Revenue | 5% statutory commission earned by the chit organizer |
| `4002` | Delinquency Penalty Income | Credit | Revenue | Penalties collected on late member payments |

---

## 4. Auction Mechanics & Statutory Mathematical Model

The auction engine strictly implements the statutory provisions of the **Chit Funds Act, 1982 (Act 40 of 1982)** and 2019 Amendments:

1. **Statutory Ceiling (Section 14):**
   $$\text{Max Discount} = 0.30 \times \text{Total Pool}$$
   For a ₹5,00,000 pool, $\text{Max Discount} = \text{₹1,50,000}$.
2. **Statutory Floor:**
   $$\text{Min Discount} = 0.05 \times \text{Total Pool} = \text{Organizer Commission}$$
   For a ₹5,00,000 pool, $\text{Min Discount} = \text{₹25,000}$.
3. **Winner Net Prize Money:**
   $$\text{Prize Money} = \text{Total Pool} - \text{Winning Discount}$$
4. **Member Dividend Allocation:**
   $$\text{Total Dividend} = \text{Winning Discount} - \text{Organizer Commission (5\%)}$$
   $$\text{Dividend Per Member} = \left\lfloor \frac{\text{Total Dividend}}{\text{Total Members}} \right\rfloor$$
5. **Draw of Lots (Tie-Breaker Lottery):**
   When multiple non-prized subscribers bid the maximum statutory ceiling (30%), the law mandates that the winner be selected through an open, impartial draw of lots among tied ceiling bidders.

```mermaid
sequenceDiagram
    autonumber
    actor SubA as Subscriber A (Borrower)
    actor SubB as Subscriber B (Competitor)
    participant Arena as Live Auction Arena
    participant Engine as Auction Engine
    participant DB as Relational SQLite DB

    SubA->>Arena: Select Active Chit & Inspect Live Preview
    Arena->>Engine: GET /api/cycles/:id/bidding-room
    Engine-->>Arena: Current Highest Bid, Dividend Preview, Eligible Bidders
    SubA->>Arena: Submit Reverse Bid (e.g. ₹95,000)
    Arena->>Engine: POST /api/cycles/:id/bids
    Engine->>DB: Check: Not already prized & Bid >= Min & Bid <= Cap
    DB-->>Engine: Accepted
    Engine-->>Arena: New High Bid Broadcast
    SubB->>Arena: Click "Simulate Competitor Bid" / Quick +₹5,000
    Arena->>Engine: POST /api/cycles/:id/simulate-competitor-bid
    Engine-->>Arena: Competitor bids ₹1,00,000 (Dividend increases)
    SubA->>Arena: Bid Max 30% Ceiling (₹1,50,000)
    SubB->>Arena: Bid Max 30% Ceiling (₹1,50,000)
    Note over Engine: Tie detected at 30% Ceiling
    SubA->>Arena: Trigger Draw of Lots Lottery
    Arena->>Engine: POST /api/cycles/:id/lottery
    Engine-->>Arena: Cryptographically Fair Winner Selected
```

---

## 5. Section 31 Prized Subscriber Surety Verification

Under Section 31 of the Chit Funds Act, a prized subscriber who wins the auction is legally required to furnish solvent security/sureties for the payment of future monthly installments before any prize money is disbursed:

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: Prized Subscriber submits Guarantor / FDR / Property
    SUBMITTED --> UNDER_REVIEW: Host inspects solvency documentation
    UNDER_REVIEW --> APPROVED: Host verifies solvency & approves surety
    UNDER_REVIEW --> REJECTED: Host requests additional collateral
    APPROVED --> MAKER_CHECKER_PAYOUT: Unlocks Payout Authorization Lifecycle
```

Supported Surety Types:
- `CO_GUARANTOR`: Solvent third-party or fellow non-prized member guarantee.
- `FDR_LIEN`: Bank Fixed Deposit Receipt assigned to the Chit Organizer.
- `PROPERTY_DEED`: Immovable property deposit/encumbrance certificate.
- `SALARY_CERTIFICATE`: Irrevocable salary deduction authorization from employer.

---

## 6. Maker-Checker Payout Authorization Lifecycle

To prevent fraud and enforce compliance with internal financial controls, payout disbursement follows a strict separation-of-duties state machine (unlocked only after Section 31 surety verification):

```mermaid
stateDiagram-v2
    [*] --> PENDING_APPROVAL: Auction Closes
    PENDING_APPROVAL --> SURETY_PENDING: Awaiting Section 31 Security
    SURETY_PENDING --> SURETY_APPROVED: Host verifies solvent sureties
    SURETY_APPROVED --> INITIATED: Maker (Operations Admin) initiates payout
    INITIATED --> DISBURSED: Checker (Finance Admin) approves & authorizes
    INITIATED --> REJECTED: Checker rejects with audit note
    DISBURSED --> [*]: Posts to Balanced Ledger
```

**Rule:** `maker_user_id !== checker_user_id`. An administrator cannot approve their own initiated disbursement request.

---

## 7. Tamper-Evident SHA-256 Audit Trail

All sensitive state transitions compute a deterministic SHA-256 hash of the modified object:

$$\text{Hash} = \text{SHA256}(\text{JSON.stringify}(\text{sortedState}))$$

The previous hash, new hash, actor ID, action name, IP address, and UTC timestamp are committed to the `audit_events` table before responding to the client.
