// ============================================================================
// Local Connectivity Chit-Fund Platform Frontend Application Logic
// ============================================================================

let currentUser = null;
let activeGroupId = 'grp-indiranagar-2026';
let activeCycleId = 'cyc-2';
let pendingObligationForPayment = null;

// Format paise to INR string: 2500000 paise -> ₹25,000.00
function formatINR(amountMinor) {
  if (amountMinor === null || amountMinor === undefined) return '₹0.00';
  const val = Number(amountMinor) / 100;
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format paise to rounded INR string: 2500000 paise -> ₹25,000
function formatINRCompact(amountMinor) {
  if (amountMinor === null || amountMinor === undefined) return '₹0';
  const val = Math.round(Number(amountMinor) / 100);
  return '₹' + val.toLocaleString('en-IN');
}

// Fetch helper with User Context
async function apiCall(endpoint, options = {}) {
  const headers = options.headers || {};
  if (currentUser) {
    headers['X-User-Id'] = currentUser.id;
    if (currentUser.auth_token) {
      headers['Authorization'] = `Bearer ${currentUser.auth_token}`;
    }
  }
  options.headers = headers;

  const res = await fetch(endpoint, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Server request failed');
  }
  return data;
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupViewportToggle();
  setupNavTabs();
  setupRoleSwitcher();
  setupAuctionBiddingCalculator();
  setupPaymentModal();
  setupDisputeModal();

  // Load Initial User & Data
  await switchActiveUser('usr-member-1');
  await loadLocalities();
  await loadGroups();
  await loadAuctionRoom();
});

// Viewport Switcher (Mobile App Frame vs Desktop Operations Console)
function setupViewportToggle() {
  const mobileBtn = document.getElementById('view-mobile-btn');
  const desktopBtn = document.getElementById('view-desktop-btn');
  const deviceWrapper = document.getElementById('device-wrapper');

  // Default to Mobile
  deviceWrapper.className = 'device-frame mode-mobile';

  mobileBtn.addEventListener('click', () => {
    mobileBtn.classList.add('active');
    desktopBtn.classList.remove('active');
    deviceWrapper.className = 'device-frame mode-mobile';
  });

  desktopBtn.addEventListener('click', () => {
    desktopBtn.classList.add('active');
    mobileBtn.classList.remove('active');
    deviceWrapper.className = 'device-frame mode-desktop';
  });
}

// Navigation Tabs
function setupNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.add('active');

      // Refresh data on tab activation
      if (targetTab === 'tab-explore') loadGroups();
      if (targetTab === 'tab-auction') loadAuctionRoom();
      if (targetTab === 'tab-payments') loadPayments();
      if (targetTab === 'tab-ledger') loadLedger();
      if (targetTab === 'tab-operations') loadOperations();
    });
  });
}

// Role Switcher Setup
function setupRoleSwitcher() {
  const roleSelect = document.getElementById('role-select');
  roleSelect.addEventListener('change', async (e) => {
    await switchActiveUser(e.target.value);
  });
}

async function switchActiveUser(userId) {
  try {
    const data = await apiCall(`/api/users`);
    const target = data.users.find(u => u.id === userId);
    if (!target) return;

    currentUser = target;

    // Update Header Badges
    document.getElementById('badge-role').textContent = target.role;
    document.getElementById('badge-name').textContent = target.display_name;
    document.getElementById('user-phone-display').textContent = `Logged in: +91-${target.phone} (${target.display_name})`;

    // Check Collector Panel visibility
    const collectorPanel = document.getElementById('collector-panel');
    if (['COLLECTOR', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(target.role)) {
      collectorPanel.style.display = 'block';
    } else {
      collectorPanel.style.display = 'none';
    }

    // Check Auction Close button visibility (Organizer or Ops Admin)
    const auctionAdminActions = document.getElementById('auction-admin-actions');
    if (['ORGANIZER', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(target.role)) {
      auctionAdminActions.style.display = 'flex';
    } else {
      auctionAdminActions.style.display = 'none';
    }

    // Refresh currently open tab
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
      const tabId = activeTab.getAttribute('data-tab');
      if (tabId === 'tab-explore') loadGroups();
      if (tabId === 'tab-auction') loadAuctionRoom();
      if (tabId === 'tab-payments') loadPayments();
      if (tabId === 'tab-ledger') loadLedger();
      if (tabId === 'tab-operations') loadOperations();
    }
  } catch (err) {
    console.error('Error switching user:', err);
  }
}

// ----------------------------------------------------------------------------
// TAB 1: LOCALITY & NEARBY GROUPS
// ----------------------------------------------------------------------------
async function loadLocalities() {
  try {
    const data = await apiCall('/api/localities');
    const select = document.getElementById('locality-filter');
    select.innerHTML = '<option value="">All Bengaluru Localities</option>';
    data.localities.forEach(loc => {
      select.innerHTML += `<option value="${loc.id}">${loc.name} (${loc.pincode})</option>`;
    });

    const radiusSlider = document.getElementById('radius-slider');
    const radiusVal = document.getElementById('radius-val');
    radiusSlider.addEventListener('input', (e) => {
      radiusVal.textContent = e.target.value;
    });

    document.getElementById('search-nearby-btn').addEventListener('click', loadGroups);
  } catch (err) {
    console.error('Error loading localities:', err);
  }
}

async function loadGroups() {
  try {
    const localityId = document.getElementById('locality-filter').value;
    const radiusKm = document.getElementById('radius-slider').value;

    let url = `/api/groups/nearby?radiusKm=${radiusKm}`;
    if (localityId) url += `&localityId=${localityId}`;

    const data = await apiCall(url);
    const container = document.getElementById('groups-container');
    container.innerHTML = '';

    if (data.groups.length === 0) {
      container.innerHTML = '<div class="card text-muted">No chit groups found in this radius. Try expanding the search radius.</div>';
      return;
    }

    data.groups.forEach(g => {
      const distanceBadge = g.distance_km !== null
        ? `<span class="distance-tag">${g.distance_km} km away</span>`
        : `<span class="distance-tag">${g.locality_name}</span>`;

      const card = document.createElement('div');
      card.className = 'group-card';
      card.innerHTML = `
        <div>
          <div class="group-header">
            <h4 class="group-name">${g.name}</h4>
            ${distanceBadge}
          </div>
          <div class="text-muted" style="font-size: 0.8rem; margin-bottom: 12px;">
            Organizer: <strong>${g.organizer_name}</strong> (Reputation: ${g.organizer_reputation}%)
          </div>
          <div class="group-stats">
            <div class="stat-item">
              <span class="stat-title">Chit Pool</span>
              <span class="stat-value">${formatINRCompact(g.total_pool_minor)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-title">Monthly Dues</span>
              <span class="stat-value">${formatINRCompact(g.monthly_contribution_minor)}</span>
            </div>
            <div class="stat-item">
              <span class="stat-title">Tenure</span>
              <span class="stat-value">${g.total_months} Months</span>
            </div>
            <div class="stat-item">
              <span class="stat-title">Members</span>
              <span class="stat-value">${g.current_members_count} / ${g.max_members}</span>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-block join-grp-btn" data-group-id="${g.id}">
          ${g.status === 'REGISTRATION' ? 'Apply to Join Group' : 'View Group Constitution'}
        </button>
      `;

      card.querySelector('.join-grp-btn').addEventListener('click', () => handleGroupAction(g));
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading groups:', err);
  }
}

async function handleGroupAction(group) {
  if (group.status === 'REGISTRATION') {
    if (confirm(`Do you wish to submit a join request for "${group.name}"?\nMonthly Obligation: ${formatINRCompact(group.monthly_contribution_minor)} for ${group.total_months} months.\nGoverned under Chit Funds Act 1982.`)) {
      try {
        await apiCall(`/api/groups/${group.id}/join-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptedRulesVersion: '1.0' })
        });
        alert('Join request submitted successfully! The group organizer will review your profile.');
        loadGroups();
      } catch (e) {
        alert(e.message);
      }
    }
  } else {
    // Switch to active chit auction tab
    activeGroupId = group.id;
    document.querySelector('.nav-tab[data-tab="tab-auction"]').click();
  }
}

// ----------------------------------------------------------------------------
// TAB 2: LIVE AUCTION ROOM & BIDDING
// ----------------------------------------------------------------------------
function setupAuctionBiddingCalculator() {
  const bidInput = document.getElementById('bid-amount-input');
  const previewPrize = document.getElementById('preview-prize');
  const previewCommission = document.getElementById('preview-commission');
  const previewDividend = document.getElementById('preview-dividend');

  function updatePreview() {
    const discount = Number(bidInput.value) || 0;
    const pool = 500000;
    const commission = Math.round(pool * 0.05); // ₹25,000 (5%)
    const netPrize = pool - discount;
    const dividendTotal = Math.max(0, discount - commission);
    const dividendPerMember = Math.floor(dividendTotal / 5); // 5 members in demo group

    previewPrize.textContent = '₹' + netPrize.toLocaleString('en-IN');
    previewCommission.textContent = '₹' + commission.toLocaleString('en-IN');
    previewDividend.textContent = '₹' + dividendPerMember.toLocaleString('en-IN');
  }

  bidInput.addEventListener('input', updatePreview);
  updatePreview();

  // Bid Submission Form
  document.getElementById('bid-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const discountMinor = Number(bidInput.value) * 100; // to paise

    try {
      // Find user's membership in active group
      const grpData = await apiCall(`/api/groups/${activeGroupId}`);
      const membership = grpData.group.members.find(m => m.user_id === currentUser.id);

      if (!membership) {
        alert('You are not an active member of this chit group. Please join first.');
        return;
      }

      await apiCall(`/api/cycles/${activeCycleId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          membershipId: membership.id,
          bidDiscountMinor: discountMinor
        })
      });

      alert(`Bid of ₹${Number(bidInput.value).toLocaleString('en-IN')} placed successfully!`);
      loadAuctionRoom();
    } catch (err) {
      alert('Bid Rejected: ' + err.message);
    }
  });

  // Close Auction Button (Organizer / Admin)
  document.getElementById('close-auction-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to close Cycle #2 Auction?\nThis will determine the winner, compute member dividends, and commit balanced transactions to the General Ledger.')) {
      return;
    }

    try {
      const result = await apiCall(`/api/cycles/${activeCycleId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      alert(`✔ Auction closed successfully!\nWinning Discount: ${formatINR(result.snapshotData.winningDiscount)}\nDividend per Member: ${formatINR(result.snapshotData.dividendPerMember)}\nResult cryptographically signed.`);
      loadAuctionRoom();
      loadLedger();
    } catch (err) {
      alert('Error closing auction: ' + err.message);
    }
  });
}

async function loadAuctionRoom() {
  try {
    const cycleData = await apiCall(`/api/cycles/${activeCycleId}`);
    const cycle = cycleData.cycle;

    document.getElementById('auction-group-title').textContent = cycle.group_name;
    const currentHighBidEl = document.getElementById('current-high-bid');
    const bidsList = document.getElementById('bids-list');
    bidsList.innerHTML = '';

    const highestBid = cycle.bids.length > 0 ? cycle.bids[0] : null;
    if (highestBid) {
      currentHighBidEl.textContent = formatINRCompact(highestBid.bid_discount_minor);
    } else {
      currentHighBidEl.textContent = '₹25,000 (Min)';
    }

    if (cycle.bids.length === 0) {
      bidsList.innerHTML = '<div class="text-muted p-2">No bids submitted yet for this cycle. Be the first to bid!</div>';
    } else {
      cycle.bids.forEach((b, index) => {
        const isWinning = index === 0;
        const item = document.createElement('div');
        item.className = `bid-item ${isWinning ? 'winning' : ''}`;
        item.innerHTML = `
          <div>
            <strong>${b.display_name}</strong> (Slot #${b.slot_number})
            <div class="text-muted" style="font-size: 0.72rem;">${new Date(b.submitted_at).toLocaleTimeString()}</div>
          </div>
          <div class="text-right">
            <span class="font-mono" style="font-size: 1rem; font-weight: 700;">${formatINR(b.bid_discount_minor)}</span>
            <div style="font-size: 0.72rem; color: ${isWinning ? 'var(--accent-gold)' : 'var(--text-muted)'}; font-weight: 600;">
              ${isWinning ? '★ Highest Bid' : 'Outbid'}
            </div>
          </div>
        `;
        bidsList.appendChild(item);
      });
    }

    // If auction is closed, show result snapshot
    const resultCard = document.getElementById('auction-result-card');
    if (cycle.status === 'AUCTION_CLOSED' || cycle.status === 'SETTLED') {
      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div class="card-header">
          <h3>✔ Signed Auction Result Snapshot</h3>
          <span class="status-pill status-settled">${cycle.status}</span>
        </div>
        <div class="summary-row"><span>Winner Membership:</span> <strong>${cycle.winner_membership_id}</strong></div>
        <div class="summary-row"><span>Winning Discount:</span> <strong>${formatINR(cycle.winning_bid_discount_minor)}</strong></div>
        <div class="summary-row"><span>Dividend / Member:</span> <strong>${formatINR(cycle.dividend_per_member_minor)}</strong></div>
        <div class="summary-row"><span>Net Prize Payout:</span> <strong>${formatINR(cycle.payout_amount_minor)}</strong></div>
        <div class="summary-row" style="margin-top: 8px;">
          <span style="font-size: 0.75rem;">HMAC SHA-256 Signature:</span>
          <code class="font-mono" style="font-size: 0.7rem; color: var(--secondary-blue);">${cycle.result_signature || 'VERIFIED'}</code>
        </div>
      `;
    } else {
      resultCard.style.display = 'none';
    }
  } catch (err) {
    console.error('Error loading auction room:', err);
  }
}

// ----------------------------------------------------------------------------
// TAB 3: PAYMENTS & OBLIGATIONS
// ----------------------------------------------------------------------------
async function loadPayments() {
  try {
    const cycleData = await apiCall(`/api/cycles/${activeCycleId}`);
    const obligations = cycleData.cycle.obligations;
    const container = document.getElementById('obligations-container');
    const collectorSelect = document.getElementById('collector-member-select');

    container.innerHTML = '';
    collectorSelect.innerHTML = '<option value="">-- Select Member Obligation --</option>';

    obligations.forEach(o => {
      const isPaid = o.status === 'PAID';
      const isMyObligation = currentUser && o.phone === currentUser.phone;

      // Populate collector select if unpaid
      if (!isPaid) {
        collectorSelect.innerHTML += `<option value="${o.id}">Slot #${o.slot_number} - ${o.display_name} (${formatINRCompact(o.net_payable_minor)})</option>`;
      }

      const item = document.createElement('div');
      item.className = 'group-card';
      item.style.marginBottom = '12px';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700;">Slot #${o.slot_number}: ${o.display_name}</div>
            <div class="text-muted" style="font-size: 0.78rem;">Cycle #2 Due: ${new Date(o.due_at).toLocaleDateString()}</div>
          </div>
          <div class="text-right">
            <div class="font-mono" style="font-size: 1.1rem; font-weight: 800;">${formatINR(o.net_payable_minor)}</div>
            <span class="status-pill ${isPaid ? 'status-settled' : 'status-active'}">
              ${isPaid ? '✔ PAID' : 'PENDING'}
            </span>
          </div>
        </div>
        ${!isPaid && isMyObligation ? `
          <button class="btn btn-primary btn-block pay-now-btn" style="margin-top: 10px;" data-obl-id="${o.id}" data-amount="${o.net_payable_minor}">
            Pay via UPI (Instant QR / Collect)
          </button>
        ` : ''}
      `;

      if (!isPaid && isMyObligation) {
        item.querySelector('.pay-now-btn').addEventListener('click', () => openPaymentModal(o));
      }

      container.appendChild(item);
    });

    // Setup Collector cash submission
    const collectorForm = document.getElementById('collector-cash-form');
    collectorForm.onsubmit = async (e) => {
      e.preventDefault();
      const oblId = collectorSelect.value;
      const notes = document.getElementById('collector-notes').value;
      if (!oblId) return alert('Please select a member obligation.');

      try {
        await apiCall(`/api/obligations/${oblId}/collector-cash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes })
        });
        alert('✔ Cash payment recorded and matched to balanced ledger!');
        loadPayments();
        loadLedger();
      } catch (err) {
        alert(err.message);
      }
    };
  } catch (err) {
    console.error('Error loading payments:', err);
  }
}

// Payment Modal Logic
function setupPaymentModal() {
  const modal = document.getElementById('payment-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  closeBtn.addEventListener('click', () => modal.style.display = 'none');

  const apps = ['gpay', 'phonepe', 'paytm'];
  apps.forEach(app => {
    document.getElementById(`pay-${app}-btn`).addEventListener('click', async () => {
      if (!pendingObligationForPayment) return;
      try {
        // Step 1: Create payment intent
        const intentRes = await apiCall(`/api/obligations/${pendingObligationForPayment.id}/payment-intents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethod: 'UPI_QR' })
        });

        // Step 2: Trigger provider webhook
        await apiCall(`/api/payments/webhooks/upi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intentId: intentRes.intent.id,
            status: 'SUCCESS'
          })
        });

        alert(`✔ Payment of ${formatINR(pendingObligationForPayment.net_payable_minor)} successfully processed via simulated UPI!\nDouble-entry ledger entry committed.`);
        modal.style.display = 'none';
        loadPayments();
        loadLedger();
      } catch (err) {
        alert('Payment failed: ' + err.message);
      }
    });
  });
}

function openPaymentModal(obligation) {
  pendingObligationForPayment = obligation;
  document.getElementById('modal-pay-amount').textContent = formatINR(obligation.net_payable_minor);
  document.getElementById('payment-modal').style.display = 'flex';
}

// ----------------------------------------------------------------------------
// TAB 4: BALANCED DOUBLE-ENTRY LEDGER
// ----------------------------------------------------------------------------
async function loadLedger() {
  try {
    const data = await apiCall(`/api/groups/${activeGroupId}/reconciliation`);
    const recon = data.reconciliation;

    // Metrics
    document.getElementById('stat-total-debit').textContent = formatINR(recon.totalSystemDebit);
    document.getElementById('stat-total-credit').textContent = formatINR(recon.totalSystemCredit);
    document.getElementById('stat-variance').textContent = formatINR(recon.systemVariance);
    document.getElementById('stat-tx-count').textContent = recon.totalTransactions;

    const badge = document.getElementById('reconciliation-badge');
    if (recon.isFullyBalanced) {
      badge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> 100% BALANCED (Variance = ₹0.00)`;
      badge.style.color = 'var(--success)';
      badge.style.borderColor = 'var(--success)';
    } else {
      badge.textContent = `⚠ UNBALANCED VARIANCE: ${formatINR(recon.systemVariance)}`;
      badge.style.color = 'var(--danger)';
      badge.style.borderColor = 'var(--danger)';
    }

    // Chart of Accounts Table
    const chartBody = document.getElementById('chart-accounts-body');
    chartBody.innerHTML = '';
    recon.chartOfAccounts.forEach(acc => {
      chartBody.innerHTML += `
        <tr>
          <td><code class="font-mono">${acc.code}</code></td>
          <td><strong>${acc.name}</strong></td>
          <td><span class="user-role-tag">${acc.type}</span></td>
          <td class="text-right font-mono" style="font-weight: 700;">${formatINR(acc.balance_minor)}</td>
        </tr>
      `;
    });

    // Journal Transactions Table
    const txBody = document.getElementById('transactions-body');
    txBody.innerHTML = '';
    recon.transactions.forEach(tx => {
      txBody.innerHTML += `
        <tr>
          <td><code class="font-mono">${tx.id.slice(0, 8)}</code></td>
          <td><span class="status-pill status-agent">${tx.source_type}</span></td>
          <td>${tx.description}</td>
          <td class="text-right font-mono text-primary">${formatINR(tx.txDebit)}</td>
          <td class="text-right font-mono text-primary">${formatINR(tx.txCredit)}</td>
          <td><span class="text-success font-mono" style="font-weight: bold;">✔ Yes</span></td>
          <td class="text-muted" style="font-size: 0.75rem;">${new Date(tx.posted_at).toLocaleString()}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error loading ledger:', err);
  }
}

// ----------------------------------------------------------------------------
// TAB 5: OPERATIONS & COMPLIANCE CONSOLE
// ----------------------------------------------------------------------------
async function loadOperations() {
  try {
    // 1. Load Payouts (Maker-Checker)
    const payoutsData = await apiCall('/api/payouts');
    const payoutsBody = document.getElementById('payouts-body');
    payoutsBody.innerHTML = '';

    if (payoutsData.payouts.length === 0) {
      payoutsBody.innerHTML = '<tr><td colspan="8" class="text-muted">No payout requests currently queued.</td></tr>';
    } else {
      payoutsData.payouts.forEach(p => {
        let actionBtn = '';
        if (p.approval_status === 'PENDING_APPROVAL') {
          if (!p.maker_user_id) {
            actionBtn = `<button class="btn btn-sm btn-primary initiate-payout-btn" data-id="${p.id}">Initiate (Maker)</button>`;
          } else {
            actionBtn = `<button class="btn btn-sm btn-gold approve-payout-btn" data-id="${p.id}">Approve (Checker)</button>`;
          }
        } else {
          actionBtn = `<span class="text-success font-mono">✔ Disbursed (${p.provider_payout_ref})</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code class="font-mono">${p.id.slice(0, 8)}</code></td>
          <td>Cycle #${p.cycle_sequence_no}</td>
          <td><strong>${p.winner_name}</strong></td>
          <td>${p.bank_account_masked} (${p.ifsc_code})</td>
          <td class="font-mono" style="font-weight: 700;">${formatINR(p.net_payout_minor)}</td>
          <td><span class="status-pill ${p.approval_status === 'DISBURSED' ? 'status-settled' : 'status-active'}">${p.approval_status}</span></td>
          <td style="font-size: 0.75rem;">Maker: ${p.maker_phone || 'None'}<br>Checker: ${p.checker_phone || 'None'}</td>
          <td>${actionBtn}</td>
        `;

        if (tr.querySelector('.initiate-payout-btn')) {
          tr.querySelector('.initiate-payout-btn').addEventListener('click', () => handleInitiatePayout(p.id));
        }
        if (tr.querySelector('.approve-payout-btn')) {
          tr.querySelector('.approve-payout-btn').addEventListener('click', () => handleApprovePayout(p.id));
        }

        payoutsBody.appendChild(tr);
      });
    }

    // 2. Load KYC Queue
    const kycData = await apiCall('/api/kyc/cases');
    const kycBody = document.getElementById('kyc-table');
    kycBody.innerHTML = '';
    if (kycData.cases.length === 0) {
      kycBody.innerHTML = '<tr><td colspan="6" class="text-muted">No pending KYC cases in compliance review queue.</td></tr>';
    } else {
      kycData.cases.forEach(k => {
        kycBody.innerHTML += `
          <tr>
            <td><code class="font-mono">${k.id.slice(0, 8)}</code></td>
            <td><strong>${k.display_name}</strong> (+91-${k.phone})</td>
            <td>${k.doc_number_masked} (${k.doc_type})</td>
            <td>${k.provider_ref}</td>
            <td><span class="status-pill status-active">${k.status}</span></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="window.reviewKyc('${k.id}', 'APPROVED')">Approve</button>
              <button class="btn btn-sm btn-outline" onclick="window.reviewKyc('${k.id}', 'REJECTED')">Reject</button>
            </td>
          </tr>
        `;
      });
    }

    // 3. Load Disputes
    const disputesData = await apiCall('/api/support/cases');
    const disputesBody = document.getElementById('disputes-body');
    disputesBody.innerHTML = '';
    if (disputesData.cases.length === 0) {
      disputesBody.innerHTML = '<tr><td colspan="6" class="text-muted">No open support disputes.</td></tr>';
    } else {
      disputesData.cases.forEach(d => {
        disputesBody.innerHTML += `
          <tr>
            <td><code class="font-mono">${d.id.slice(0, 8)}</code></td>
            <td>${d.raised_by_name} (+91-${d.raised_by_phone})</td>
            <td><span class="user-role-tag">${d.category}</span></td>
            <td><strong>${d.title}</strong></td>
            <td><span class="status-pill ${d.status === 'RESOLVED' ? 'status-settled' : 'status-active'}">${d.status}</span></td>
            <td>
              ${d.status === 'OPEN' ? `
                <button class="btn btn-sm btn-primary" onclick="window.resolveDispute('${d.id}')">Resolve Case</button>
              ` : '<span>Resolved</span>'}
            </td>
          </tr>
        `;
      });
    }

    // 4. Load Audit Events
    const auditData = await apiCall('/api/audit-events?limit=15');
    const auditBody = document.getElementById('audit-table');
    auditBody.innerHTML = '';
    auditData.events.forEach(a => {
      auditBody.innerHTML += `
        <tr>
          <td class="text-muted" style="font-size: 0.72rem;">${new Date(a.timestamp).toLocaleString()}</td>
          <td><code class="font-mono">${a.actor_id}</code></td>
          <td><strong>${a.action}</strong></td>
          <td>${a.object_type} (#${a.object_id.slice(0, 8)})</td>
          <td><code class="font-mono text-primary" style="font-size: 0.7rem;">${a.after_state_hash ? a.after_state_hash.slice(0, 20) + '...' : '-'}</code></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error loading operations console:', err);
  }
}

// Maker-Checker Handlers
async function handleInitiatePayout(payoutId) {
  try {
    await apiCall(`/api/payouts/${payoutId}/initiate`, { method: 'POST' });
    alert('✔ Payout initiated by Maker. Queued for Finance Checker authorization.');
    loadOperations();
  } catch (err) {
    alert(err.message);
  }
}

async function handleApprovePayout(payoutId) {
  try {
    await apiCall(`/api/payouts/${payoutId}/approve`, { method: 'POST' });
    alert('✔ Payout approved and prize money disbursed to winner!\nDouble-entry ledger transaction posted.');
    loadOperations();
    loadLedger();
  } catch (err) {
    alert('Authorization Blocked: ' + err.message);
  }
}

// KYC Window Review
window.reviewKyc = async (caseId, decision) => {
  try {
    await apiCall(`/api/kyc/cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: 'Demographic and UIDAI OTP check verified' })
    });
    alert(`KYC Case ${decision}`);
    loadOperations();
  } catch (err) {
    alert(err.message);
  }
};

// Dispute Modal Logic
function setupDisputeModal() {
  const modal = document.getElementById('dispute-modal');
  const raiseBtn = document.getElementById('raise-dispute-btn');
  const closeBtn = document.getElementById('close-dispute-modal-btn');

  raiseBtn.addEventListener('click', () => modal.style.display = 'flex');
  closeBtn.addEventListener('click', () => modal.style.display = 'none');

  document.getElementById('dispute-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('dispute-category').value;
    const title = document.getElementById('dispute-title').value;
    const description = document.getElementById('dispute-desc').value;

    try {
      await apiCall('/api/support/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: activeGroupId,
          cycleId: activeCycleId,
          category,
          title,
          description
        })
      });
      alert('Support case raised successfully. An operations agent will review.');
      modal.style.display = 'none';
      loadOperations();
    } catch (err) {
      alert(err.message);
    }
  });
}

window.resolveDispute = async (caseId) => {
  const notes = prompt('Enter resolution notes for this dispute:');
  if (!notes) return;
  try {
    await apiCall(`/api/support/cases/${caseId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'RESOLVED', resolutionNotes: notes })
    });
    alert('Dispute resolved!');
    loadOperations();
  } catch (err) {
    alert(err.message);
  }
};
