# API Reference: Local Connectivity Chit-Fund Platform

Base URL: `http://localhost:3000/api`

---

## 1. Authentication & Profile

### `POST /auth/otp`
Request phone OTP for mobile verification.
- **Request Body:**
  ```json
  { "phone": "9876543210" }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "phone": "9876543210",
    "message": "OTP sent successfully to +91-9876543210. (Sandbox test OTP is 123456)",
    "testOtp": "123456"
  }
  ```

### `POST /auth/verify`
Verify OTP and receive session token.
- **Request Body:**
  ```json
  { "phone": "9876543210", "otp": "123456" }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "user": { "id": "usr-member-1", "phone": "9876543210", "role": "MEMBER", "auth_token": "tok-demo-member" },
    "profile": { "display_name": "Ramesh Kumar", "kyc_status": "VERIFIED", "reputation_score": 98.5 }
  }
  ```

### `GET /me`
Fetch currently authenticated user details.
- **Headers:** `Authorization: Bearer <token>` or `X-User-Id: <user-id>`

---

## 2. Locality & Proximity Discovery

### `GET /localities`
Returns all administrative localities and centroid coordinates.

### `GET /groups/nearby`
Search chit groups ordered by geographic proximity.
- **Query Parameters:**
  - `lat` (optional): User latitude (e.g. `12.9784`)
  - `lon` (optional): User longitude (e.g. `77.6408`)
  - `localityId` (optional): Anchor locality ID
  - `radiusKm` (optional): Search radius (default `15`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "count": 2,
    "groups": [
      {
        "id": "grp-indiranagar-2026",
        "name": "Indiranagar Traders & Artisans Chit 2026",
        "locality_name": "Indiranagar",
        "distance_km": 0.0,
        "total_pool_minor": 50000000,
        "monthly_contribution_minor": 2500000,
        "total_months": 20,
        "current_members_count": 5,
        "max_members": 5,
        "status": "ACTIVE"
      }
    ]
  }
  ```

---

## 3. Chit Groups & Memberships

### `POST /groups`
Create a new chit group with constitution parameters.
- **Request Body:**
  ```json
  {
    "name": "Koramangala Tech Entrepreneurs Savings Chit",
    "localityId": "loc-2",
    "totalPoolMinor": 100000000,
    "monthlyContributionMinor": 5000000,
    "totalMonths": 20,
    "maxMembers": 20,
    "organizerCommissionRate": 0.05
  }
  ```

### `POST /groups/:id/join-requests`
Submit application to join an open registration chit group.

### `POST /groups/:id/members/:memberId/approve`
Organizer or Operations Admin approves a pending member.

---

## 4. Chit Cycles & Live Auction

### `GET /cycles/:id`
Fetch cycle metadata, member obligations, and bid stream.

### `POST /cycles/:id/start-auction`
Open bidding window for the scheduled cycle.

### `POST /cycles/:id/bids`
Place competitive discount bid in live auction.
- **Request Body:**
  ```json
  {
    "membershipId": "mem-2",
    "bidDiscountMinor": 4500000
  }
  ```

### `POST /cycles/:id/close`
Closes the auction, selects the winner, computes member dividends, posts double-entry transaction to general ledger, and generates HMAC signature.

---

## 5. Payments & Collections

### `POST /obligations/:id/payment-intents`
Generate UPI intent payload and unique idempotency key.
- **Request Body:**
  ```json
  { "paymentMethod": "UPI_QR" }
  ```

### `POST /payments/webhooks/:provider`
Idempotent webhook callback for external payment settlement.
- **Request Body:**
  ```json
  {
    "intentId": "pi-12345",
    "providerRef": "UPI-SETTLE-882299",
    "status": "SUCCESS"
  }
  ```

### `POST /obligations/:id/collector-cash`
Field agent records offline assisted cash payment with physical receipt.

---

## 6. General Ledger & Reconciliation

### `GET /groups/:id/reconciliation`
Returns trial balance, total system debits, credits, and verification that variance is zero.

### `GET /members/:id/statement`
Returns personal account statement with all debits and credits.

---

## 7. Payouts (Maker-Checker)

### `GET /payouts`
List all winner prize money disbursements.

### `POST /payouts/:id/initiate`
Maker (Operations Admin) initiates payout to winner's verified bank account.

### `POST /payouts/:id/approve`
Checker (Finance Admin) authorizes and disburses payout. Strict separation of duties enforced: `maker !== checker`.

---

## 8. Audit Trail

### `GET /audit-events`
Retrieve immutable SHA-256 state hash logs.
- **Query Parameters:** `objectType`, `objectId`, `limit`.
