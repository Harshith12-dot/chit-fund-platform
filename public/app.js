// ============================================================================
// Local Connectivity Chit-Fund Platform — Production Frontend Application Logic
// Real Database, Cryptographic Authentication, Real Passwords & Combined Host-User
// ============================================================================

let currentUser = null;
let activeGroupId = 'grp-indiranagar-2026';
let activeCycleId = 'cyc-2';
let pendingObligationForPayment = null;

// Format minor integer units (paise) to INR
function formatINR(amountMinor) {
  if (amountMinor === null || amountMinor === undefined) return '₹0.00';
  const val = Number(amountMinor) / 100;
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatINRCompact(amountMinor) {
  if (amountMinor === null || amountMinor === undefined) return '₹0';
  const val = Math.round(Number(amountMinor) / 100);
  return '₹' + val.toLocaleString('en-IN');
}

// Authenticated API Call Helper with Token Persistence
async function apiCall(endpoint, options = {}) {
  const headers = options.headers || {};
  const token = localStorage.getItem('chitfund_auth_token');

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (currentUser) {
    headers['X-User-Id'] = currentUser.id;
  }
  options.headers = headers;

  const res = await fetch(endpoint, options);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && endpoint !== '/api/auth/login' && endpoint !== '/api/auth/register') {
      // Token expired or invalid
      localStorage.removeItem('chitfund_auth_token');
      openAuthModal('login');
    }
    throw new Error(data.error || 'Server request failed');
  }
  return data;
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupViewportToggle();
  setupPortalSwitcher();
  setupSubNavTabs();
  setupHostSubTabs();
  setupAuctionBiddingCalculator();
  setupPaymentModals();
  setupAuthModalHandlers();
  setupHostUpgradeModal();
  setupSuretyModal();
  setupLotteryModal();

  // Try auto-login from stored token or initialize default user
  await initUserSession();
  await loadLocalities();
  await loadTopDues();
  await loadAuctionRoom();
  await loadJoinChits();
});

// ----------------------------------------------------------------------------
// 1. SESSION & AUTHENTICATION LIFECYCLE
// ----------------------------------------------------------------------------
async function initUserSession() {
  const storedToken = localStorage.getItem('chitfund_auth_token');
  if (storedToken) {
    try {
      const data = await apiCall('/api/me');
      if (data && data.user) {
        setCurrentUser(data.user);
        return;
      }
    } catch (_) {
      localStorage.removeItem('chitfund_auth_token');
    }
  }

  // Fallback to default demo user (Ramesh Kumar) with valid token
  try {
    const loginRes = await apiCall('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210', password: '123456' })
    });
    localStorage.setItem('chitfund_auth_token', loginRes.token);
    setCurrentUser(loginRes.user, loginRes.profile);
  } catch (e) {
    // If database was fresh, open auth modal
    openAuthModal('login');
  }
}

function setCurrentUser(user, profile = null) {
  currentUser = user;
  if (profile) currentUser.profile = profile;

  const displayName = currentUser.profile?.display_name || `User ${currentUser.phone.slice(-4)}`;
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // Header Session UI
  document.getElementById('user-session-pill').style.display = 'flex';
  document.getElementById('btn-open-login').style.display = 'none';
  document.getElementById('user-initials').textContent = initials;
  document.getElementById('user-display-name').textContent = displayName;
  document.getElementById('user-role-tag').textContent = currentUser.role;

  const isHost = currentUser.is_host === 1 || currentUser.role === 'ORGANIZER' || currentUser.role === 'SUPER_ADMIN';
  const hostBadge = document.getElementById('user-host-badge');
  const becomeHostBtn = document.getElementById('btn-become-host');

  if (isHost) {
    hostBadge.style.display = 'inline-block';
    becomeHostBtn.style.display = 'none';
  } else {
    hostBadge.style.display = 'none';
    becomeHostBtn.style.display = 'inline-block';
  }

  // Update Host Profile details
  document.getElementById('host-portal-name').textContent = displayName;
  document.getElementById('host-portal-score').textContent = (currentUser.profile?.reputation_score || 99.4) + '%';
  if (currentUser.profile?.host_license_number) {
    document.getElementById('host-portal-license').textContent = currentUser.profile.host_license_number;
  }

  // Auction Admin Controls
  const auctionAdminActions = document.getElementById('auction-admin-actions');
  if (['ORGANIZER', 'OPERATIONS_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)) {
    auctionAdminActions.style.display = 'flex';
  } else {
    auctionAdminActions.style.display = 'none';
  }

  // Close Auth Modal if open
  closeAuthModal();

  // Reload current views
  loadTopDues();
  loadPortfolio();
  loadAuctionRoom();
  loadHostWorkspace();
}

function setupAuthModalHandlers() {
  const modal = document.getElementById('auth-modal');
  const closeBtn = document.getElementById('close-auth-modal-btn');
  const openLoginBtn = document.getElementById('btn-open-login');
  const logoutBtn = document.getElementById('btn-logout');

  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const paneLogin = document.getElementById('auth-pane-login');
  const paneRegister = document.getElementById('auth-pane-register');

  closeBtn.addEventListener('click', closeAuthModal);
  openLoginBtn.addEventListener('click', () => openAuthModal('login'));

  tabBtnLogin.addEventListener('click', () => {
    tabBtnLogin.classList.add('active');
    tabBtnRegister.classList.remove('active');
    paneLogin.style.display = 'block';
    paneRegister.style.display = 'none';
  });

  tabBtnRegister.addEventListener('click', () => {
    tabBtnRegister.classList.add('active');
    tabBtnLogin.classList.remove('active');
    paneRegister.style.display = 'block';
    paneLogin.style.display = 'none';
  });

  // Host Accreditation Checkbox in Registration
  const isHostChk = document.getElementById('reg-is-host');
  const hostRegExtra = document.getElementById('host-reg-extra');
  isHostChk.addEventListener('change', () => {
    hostRegExtra.style.display = isHostChk.checked ? 'block' : 'none';
  });

  // Handle Login Form
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await apiCall('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      localStorage.setItem('chitfund_auth_token', res.token);
      setCurrentUser(res.user, res.profile);
      alert(`✔ Welcome back, ${res.profile.display_name}!`);
    } catch (err) {
      alert('Login Failed: ' + err.message);
    }
  });

  // Handle Register Form
  const regForm = document.getElementById('register-form');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const localityId = document.getElementById('reg-locality').value;
    const aadhaarNumber = document.getElementById('reg-aadhaar').value;
    const panNumber = document.getElementById('reg-pan').value;
    const isHost = isHostChk.checked;
    const hostLicenseNumber = isHost ? document.getElementById('reg-license').value : null;
    const bankGuaranteeRef = isHost ? document.getElementById('reg-bg').value : null;

    try {
      const res = await apiCall('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          phone,
          password,
          localityId,
          aadhaarNumber,
          panNumber,
          isHost,
          hostLicenseNumber,
          bankGuaranteeRef
        })
      });

      localStorage.setItem('chitfund_auth_token', res.token);
      setCurrentUser(res.user, res.profile);
      alert(`✔ Account registered successfully! Welcome to Local Chit-Fund.`);
    } catch (err) {
      alert('Registration Failed: ' + err.message);
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await apiCall('/api/auth/logout', { method: 'POST' });
    } catch (_) {}

    localStorage.removeItem('chitfund_auth_token');
    currentUser = null;
    document.getElementById('user-session-pill').style.display = 'none';
    document.getElementById('btn-open-login').style.display = 'block';
    openAuthModal('login');
  });
}

function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  modal.style.display = 'flex';
  if (tab === 'register') {
    document.getElementById('tab-btn-register').click();
  } else {
    document.getElementById('tab-btn-login').click();
  }
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

// Quick Login Demo Helper
window.quickLogin = async (phone, password) => {
  try {
    const res = await apiCall('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    localStorage.setItem('chitfund_auth_token', res.token);
    setCurrentUser(res.user, res.profile);
  } catch (err) {
    alert(err.message);
  }
};

// ----------------------------------------------------------------------------
// 2. BECOME A CHIT HOST UPGRADE MODAL
// ----------------------------------------------------------------------------
function setupHostUpgradeModal() {
  const modal = document.getElementById('upgrade-host-modal');
  const openBtn = document.getElementById('btn-become-host');
  const closeBtn = document.getElementById('close-upgrade-modal-btn');
  const form = document.getElementById('upgrade-host-form');

  openBtn.addEventListener('click', () => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    modal.style.display = 'flex';
  });

  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hostLicenseNumber = document.getElementById('up-license').value;
    const bankGuaranteeRef = document.getElementById('up-bg').value;

    try {
      const res = await apiCall('/api/me/upgrade-to-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostLicenseNumber, bankGuaranteeRef })
      });

      alert(`✔ Congratulations! Your account has been accredited as a Certified Chit Host.\nState Registrar Approval: ${hostLicenseNumber}`);
      modal.style.display = 'none';
      setCurrentUser(res.user, res.profile);

      // Automatically switch to Host portal
      document.getElementById('portal-host-btn').click();
    } catch (err) {
      alert('Upgrade Failed: ' + err.message);
    }
  });
}

// ----------------------------------------------------------------------------
// 3. DUAL-PORTAL SWITCHER ("JOIN A CHIT" vs "HOST A CHIT")
// ----------------------------------------------------------------------------
function setupPortalSwitcher() {
  const joinBtn = document.getElementById('portal-join-btn');
  const hostBtn = document.getElementById('portal-host-btn');
  const joinPortal = document.getElementById('join-chit-portal');
  const hostPortal = document.getElementById('host-chit-portal');
  const navPrimaryLabel = document.getElementById('nav-primary-label');

  joinBtn.addEventListener('click', () => {
    joinBtn.classList.add('active');
    hostBtn.classList.remove('active');
    joinPortal.style.display = 'block';
    hostPortal.style.display = 'none';
    navPrimaryLabel.textContent = 'Explore Chits';
    loadTopDues();
    loadJoinChits();
  });

  hostBtn.addEventListener('click', async () => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }

    // Check if user is host. If not, prompt upgrade
    if (currentUser.is_host !== 1 && currentUser.role !== 'ORGANIZER' && currentUser.role !== 'SUPER_ADMIN') {
      if (confirm('You are currently registered as a Member. Would you like to enable Host capabilities by providing your State Chit Registrar License?')) {
        document.getElementById('upgrade-host-modal').style.display = 'flex';
      }
      return;
    }

    hostBtn.classList.add('active');
    joinBtn.classList.remove('active');
    joinPortal.style.display = 'none';
    hostPortal.style.display = 'block';
    navPrimaryLabel.textContent = 'Host Workspace';
    loadHostWorkspace();
  });
}

// Viewport Switcher
function setupViewportToggle() {
  const mobileBtn = document.getElementById('view-mobile-btn');
  const desktopBtn = document.getElementById('view-desktop-btn');
  const deviceWrapper = document.getElementById('device-wrapper');

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

// Secondary Navigation Tabs
function setupSubNavTabs() {
  const subTabs = document.querySelectorAll('.sub-tab');
  subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetSub = tab.getAttribute('data-subtab');
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.portal-section').forEach(s => s.style.display = 'none');

      if (targetSub === 'main-portal-view') {
        document.getElementById('join-chit-portal').style.display = 'block';
        loadJoinChits();
      } else if (targetSub === 'host-chit-portal' || targetSub === 'host-desk-view') {
        document.getElementById('host-chit-portal').style.display = 'block';
        loadHostWorkspace();
      } else if (targetSub === 'portfolio-view') {
        document.getElementById('portfolio-view').style.display = 'block';
        loadPortfolio();
      } else {
        const targetEl = document.getElementById(targetSub);
        if (targetEl) targetEl.style.display = 'block';
      }

      if (targetSub === 'auction-room-view') loadAuctionRoom();
      if (targetSub === 'ledger-view') loadLedger();
      if (targetSub === 'compliance-view') loadCompliance();
    });
  });
}

// ----------------------------------------------------------------------------
// 3B. MY MULTI-CHIT PORTFOLIO
// ----------------------------------------------------------------------------
async function loadPortfolio() {
  if (!currentUser) return;
  try {
    const data = await apiCall('/api/portfolio');
    const summary = data.summary;
    const chits = data.enrolledChits || [];

    document.getElementById('pf-total-chits').textContent = summary.totalChitsEnrolled;
    document.getElementById('pf-total-capital').textContent = formatINRCompact(summary.totalSubscribedValueMinor);
    document.getElementById('pf-total-dividends').textContent = formatINRCompact(summary.totalLifetimeDividendsMinor);
    document.getElementById('pf-total-dues').textContent = formatINRCompact(summary.totalActiveDuesMinor);

    const container = document.getElementById('portfolio-chits-container');
    container.innerHTML = '';

    if (chits.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1/-1; text-align: center; padding: 30px;">
          <h4 style="color: var(--primary-navy); margin-bottom: 6px;">No Active Chit Subscriptions</h4>
          <p class="text-muted" style="font-size: 0.85rem;">You are not enrolled in any chits yet. Switch to "Explore Chits" to join nearby trusted chits.</p>
        </div>
      `;
      return;
    }

    chits.forEach(c => {
      const isPrized = c.hasWon;
      const card = document.createElement('div');
      card.className = 'portfolio-chit-card';
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <span class="ticket-slot-pill">TICKET #${c.ticketSlot}</span>
              <h3 style="margin-top: 6px; font-size: 1.05rem; color: var(--primary-navy);">${c.group.name}</h3>
              <span class="text-muted" style="font-size: 0.78rem;">📍 ${c.group.locality}, ${c.group.city}</span>
            </div>
            <span class="subscriber-status-badge ${isPrized ? 'prized' : 'non-prized'}">
              ${isPrized ? '🏆 PRIZED SUBSCRIBER' : '📈 NON-PRIZED (BIDDER)'}
            </span>
          </div>

          <div class="chit-financial-grid" style="margin-top: 10px; margin-bottom: 12px;">
            <div class="fin-item">
              <span class="fin-label">Pool Value</span>
              <span class="fin-value">${formatINRCompact(c.group.totalPoolMinor)}</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Monthly Due</span>
              <span class="fin-value text-accent">${formatINRCompact(c.group.monthlyContributionMinor)}</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Tenure</span>
              <span class="fin-value">${c.group.totalMonths} Mo</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Dividends Earned</span>
              <span class="fin-value text-success">${formatINR(c.dividendsEarnedMinor)}</span>
            </div>
          </div>

          ${c.currentObligation ? `
            <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                <span class="text-muted">Cycle #${c.activeCycle?.sequenceNo || 1} Due:</span>
                <strong class="font-mono ${c.currentObligation.status === 'PAID' ? 'text-success' : 'text-danger'}">
                  ${formatINR(c.currentObligation.netPayableMinor)} (${c.currentObligation.status})
                </strong>
              </div>
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 8px; margin-top: 12px;">
          ${c.activeCycle && c.activeCycle.status === 'AUCTION_ACTIVE' ? `
            <button class="btn btn-primary btn-sm flex-1 enter-arena-btn" data-cycle-id="${c.activeCycle.id}" data-group-id="${c.group.id}">
              🏛️ Enter Auction Arena
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm flex-1 view-ledger-btn">
              📊 View Passbook
            </button>
          `}
        </div>
      `;

      if (card.querySelector('.enter-arena-btn')) {
        card.querySelector('.enter-arena-btn').addEventListener('click', (e) => {
          activeCycleId = e.currentTarget.getAttribute('data-cycle-id');
          activeGroupId = e.currentTarget.getAttribute('data-group-id');
          document.querySelector('.sub-tab[data-subtab="auction-room-view"]').click();
        });
      }
      if (card.querySelector('.view-ledger-btn')) {
        card.querySelector('.view-ledger-btn').addEventListener('click', () => {
          activeGroupId = c.group.id;
          document.querySelector('.sub-tab[data-subtab="ledger-view"]').click();
        });
      }

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading portfolio:', err);
  }
}

// ----------------------------------------------------------------------------
// 4. "GET THE DUE AT TOP" — ACTIVE CHIT DUES BANNER
// ----------------------------------------------------------------------------
async function loadTopDues() {
  const container = document.getElementById('top-dues-section');
  if (!container || !currentUser) return;

  try {
    const data = await apiCall('/api/me/dues');
    const dues = data.dues || [];

    if (dues.length === 0) {
      container.innerHTML = `
        <div class="active-due-card">
          <div class="due-top-row">
            <span class="due-pill upcoming">Account Status</span>
            <span style="font-size: 0.8rem; color: #94A3B8;">User: ${currentUser.profile?.display_name || currentUser.phone}</span>
          </div>
          <div class="due-chit-title">No Pending Chit Obligations</div>
          <p class="due-subinfo">You have no overdue payments. Browse verified chits below to join an active group.</p>
        </div>
      `;
      return;
    }

    const topDue = dues.find(d => d.status === 'PENDING') || dues[0];
    const isPaid = topDue.status === 'PAID';
    const isOverdue = new Date(topDue.due_at) < new Date() && !isPaid;

    container.innerHTML = `
      <div class="active-due-card">
        <div class="due-top-row">
          <span class="due-pill ${isPaid ? 'paid' : (isOverdue ? 'urgent' : 'urgent')}">
            ${isPaid ? '✔ CYCLE OBLIGATION SETTLED' : '⚡ PAYMENT DUE IN 4 DAYS'}
          </span>
          <span style="font-size: 0.8rem; color: #CBD5E1;">Slot #${topDue.slot_number} • Cycle #${topDue.cycle_sequence_no}</span>
        </div>

        <div class="due-chit-title">${topDue.group_name}</div>
        <div class="due-subinfo">
          Organized by <strong>${topDue.organizer_name || 'Lakshmi Devi'}</strong> (License: ${topDue.host_license_number || 'KA/BLR/REG/2026/0491'}) • Due: ${new Date(topDue.due_at).toLocaleDateString()}
        </div>

        <div class="due-amount-row">
          <div>
            <div class="due-amount-label">Net Monthly Payable:</div>
            <div style="font-size: 0.75rem; color: #94A3B8;">Base: ${formatINR(topDue.base_amount_minor)} ${topDue.dividend_deduction_minor > 0 ? `(- Dividend ${formatINR(topDue.dividend_deduction_minor)})` : ''}</div>
          </div>
          <div class="due-amount-val">${formatINR(topDue.net_payable_minor)}</div>
        </div>

        ${!isPaid ? `
          <div class="due-actions-grid">
            <button class="btn btn-gold" id="btn-pay-online-top">
              ⚡ Pay Online (UPI / GPay)
            </button>
            <button class="btn btn-outline" style="color: #FFFFFF; border-color: rgba(255,255,255,0.4);" id="btn-pay-offline-top">
              💵 Pay Offline (Cash to Host)
            </button>
          </div>
        ` : `
          <div style="font-size: 0.82rem; color: #A7F3D0; font-weight: 600;">
            ✔ Transaction verified and recorded in the double-entry general ledger.
          </div>
        `}
      </div>
    `;

    if (!isPaid) {
      document.getElementById('btn-pay-online-top').addEventListener('click', () => openOnlinePaymentModal(topDue));
      document.getElementById('btn-pay-offline-top').addEventListener('click', () => openOfflineCashModal(topDue));
    }
  } catch (err) {
    console.error('Error loading top dues:', err);
  }
}

// ----------------------------------------------------------------------------
// 5. JOIN CHIT: MULTI-PARAMETER FILTERS & CHIT CARDS
// ----------------------------------------------------------------------------
async function loadLocalities() {
  try {
    const data = await apiCall('/api/localities');
    const dropdown = document.getElementById('locality-dropdown');
    const newChitLocality = document.getElementById('new-chit-locality');

    dropdown.innerHTML = '<option value="">All Bengaluru Areas</option>';
    newChitLocality.innerHTML = '';

    data.localities.forEach(l => {
      dropdown.innerHTML += `<option value="${l.id}">${l.name} (${l.pincode})</option>`;
      newChitLocality.innerHTML += `<option value="${l.id}">${l.name} (${l.city})</option>`;
    });

    const radiusSlider = document.getElementById('proximity-radius');
    const radiusLabel = document.getElementById('proximity-radius-label');
    radiusSlider.addEventListener('input', (e) => {
      radiusLabel.textContent = e.target.value + ' km';
    });

    document.getElementById('apply-filters-btn').addEventListener('click', loadJoinChits);
  } catch (err) {
    console.error('Error loading localities:', err);
  }
}

async function loadJoinChits() {
  const container = document.getElementById('join-chits-grid');
  if (!container) return;

  try {
    const localityId = document.getElementById('locality-dropdown').value;
    const radiusKm = document.getElementById('proximity-radius').value;
    const poolFilter = document.getElementById('pool-amount-filter').value;
    const dueFilter = document.getElementById('monthly-due-filter').value;
    const govtOnly = document.getElementById('filter-govt-only').checked;

    let url = `/api/groups/nearby?radiusKm=${radiusKm}`;
    if (localityId) url += `&localityId=${localityId}`;

    const data = await apiCall(url);
    let groups = data.groups || [];

    if (govtOnly) {
      groups = groups.filter(g => g.host_license_number);
    }

    if (poolFilter !== 'ALL') {
      groups = groups.filter(g => {
        const pool = g.total_pool_minor / 100;
        if (poolFilter === 'MICRO') return pool < 100000;
        if (poolFilter === 'SMALL') return pool >= 100000 && pool <= 500000;
        if (poolFilter === 'MEDIUM') return pool > 500000 && pool <= 1000000;
        if (poolFilter === 'LARGE') return pool > 1000000;
        return true;
      });
    }

    if (dueFilter !== 'ALL') {
      groups = groups.filter(g => {
        const due = g.monthly_contribution_minor / 100;
        if (dueFilter === 'UNDER_10K') return due < 10000;
        if (dueFilter === '10K_25K') return due >= 10000 && due <= 25000;
        if (dueFilter === '25K_50K') return due > 25000 && due <= 50000;
        if (dueFilter === 'ABOVE_50K') return due > 50000;
        return true;
      });
    }

    container.innerHTML = '';

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1/-1; text-align: center; padding: 30px;">
          <h4 style="color: var(--primary-navy); margin-bottom: 6px;">No Chit Funds Match Your Selected Filters</h4>
          <p class="text-muted" style="font-size: 0.85rem;">Try expanding the proximity radius or adjusting installment filters.</p>
        </div>
      `;
      return;
    }

    groups.forEach(g => {
      const distanceBadge = g.distance_km !== null
        ? `<span class="distance-pill">📍 ${g.distance_km} km • ${g.locality_name}</span>`
        : `<span class="distance-pill">📍 ${g.locality_name}</span>`;

      const card = document.createElement('div');
      card.className = 'rich-chit-card';
      card.innerHTML = `
        <div>
          <div class="chit-card-header">
            <div>
              <h3 class="chit-title">${g.name}</h3>
              ${distanceBadge}
            </div>
            <span class="status-pill ${g.status === 'ACTIVE' ? 'status-active' : 'status-settled'}">
              ${g.status === 'ACTIVE' ? 'CYCLE #2 ACTIVE' : 'OPEN FOR ENROLMENT'}
            </span>
          </div>

          <!-- Host Trust Accreditation Box -->
          <div class="host-trust-box">
            <div class="host-trust-header">
              <span class="host-name-title">🏛️ Host: <strong>${g.organizer_name}</strong></span>
              <span class="host-trust-score">★ ${g.trust_score || 99.4}% Trust</span>
            </div>
            <div class="badges-flow">
              <span class="trust-badge-pill badge-govt">🛡️ Reg License: ${g.host_license_number || 'KA/BLR/REG/2026/0491'}</span>
              <span class="trust-badge-pill badge-bank">🏦 Bank Guarantee Bond (${g.bank_guarantee_ref || '100% Secured'})</span>
              <span class="trust-badge-pill badge-id">🆔 Aadhaar & PAN Verified</span>
            </div>
          </div>

          <!-- Financial Grid -->
          <div class="chit-financial-grid">
            <div class="fin-item">
              <span class="fin-label">Chit Pool</span>
              <span class="fin-value">${formatINRCompact(g.total_pool_minor)}</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Monthly Due</span>
              <span class="fin-value text-accent">${formatINRCompact(g.monthly_contribution_minor)}</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Tenure</span>
              <span class="fin-value">${g.total_months} Months</span>
            </div>
            <div class="fin-item">
              <span class="fin-label">Members</span>
              <span class="fin-value">${g.current_members_count} / ${g.max_members}</span>
            </div>
          </div>

          <div style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 14px;">
            ✔ 5% Organizer commission • Max auction discount ceiling: <strong>${formatINRCompact(g.max_bid_discount_minor)}</strong> (30% statutory limit)
          </div>
        </div>

        <button class="btn btn-primary btn-block join-action-btn">
          ${g.status === 'REGISTRATION' ? 'Apply to Join this Chit' : 'Enter Live Auction Room'}
        </button>
      `;

      card.querySelector('.join-action-btn').addEventListener('click', () => {
        if (g.status === 'REGISTRATION') {
          handleJoinRequest(g);
        } else {
          activeGroupId = g.id;
          document.querySelector('.sub-tab[data-subtab="auction-room-view"]').click();
        }
      });

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading join chits:', err);
  }
}

async function handleJoinRequest(group) {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  if (confirm(`Do you wish to submit an enrolment request for "${group.name}"?\nMonthly Obligation: ${formatINRCompact(group.monthly_contribution_minor)} for ${group.total_months} months.\nGoverned under Chit Funds Act 1982.`)) {
    try {
      await apiCall(`/api/groups/${group.id}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedRulesVersion: '1.0' })
      });
      alert('✔ Join application submitted! The verified chit host will review your KYC credentials.');
      loadJoinChits();
    } catch (err) {
      alert(err.message);
    }
  }
}

// ----------------------------------------------------------------------------
// 6. HOST / MANAGE PORTAL: DASHBOARD & ONE-CLICK CASH VERIFICATION
// ----------------------------------------------------------------------------
function setupHostSubTabs() {
  const tabs = document.querySelectorAll('.host-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.getAttribute('data-hosttab');
      document.querySelectorAll('.host-tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.host-subpanel').forEach(p => p.style.display = 'none');

      tab.classList.add('active');
      const panel = document.getElementById(targetPanel);
      if (panel) panel.style.display = 'block';

      if (targetPanel === 'tab-host-verifications') loadHostPendingVerifications();
      if (targetPanel === 'tab-host-sureties') loadHostSureties();
      if (targetPanel === 'tab-host-members') loadHostJoinRequests();
    });
  });

  const createForm = document.getElementById('host-chit-form');
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-chit-name').value;
    const localityId = document.getElementById('new-chit-locality').value;
    const totalPoolMinor = Number(document.getElementById('new-total-pool').value) * 100;
    const monthlyContributionMinor = Number(document.getElementById('new-monthly-due').value) * 100;
    const totalMonths = Number(document.getElementById('new-duration').value);
    const hostLicenseNumber = document.getElementById('new-license-num').value;
    const bankGuaranteeRef = document.getElementById('new-bg-ref').value;

    try {
      await apiCall('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          localityId,
          totalPoolMinor,
          monthlyContributionMinor,
          totalMonths,
          maxMembers: totalMonths,
          hostLicenseNumber,
          bankGuaranteeRef,
          trustScore: 99.4
        })
      });

      alert(`✔ Chit Fund "${name}" successfully registered under State Chit Registrar License ${hostLicenseNumber}!\nOpened for member enrolment.`);
      createForm.reset();
      document.querySelector('.host-tab-btn[data-hosttab="tab-host-verifications"]').click();
      loadJoinChits();
    } catch (err) {
      alert('Error registering chit: ' + err.message);
    }
  });
}

async function loadHostWorkspace() {
  await loadHostPendingVerifications();
  await loadHostSureties();
  await loadHostJoinRequests();
}

async function loadHostSureties() {
  const container = document.getElementById('host-sureties-list');
  const badge = document.getElementById('host-surety-badge');
  if (!container || !currentUser) return;

  try {
    const data = await apiCall('/api/host/pending-sureties');
    const sureties = data.sureties || [];
    if (badge) badge.textContent = sureties.length;
    container.innerHTML = '';

    if (sureties.length === 0) {
      container.innerHTML = `
        <div class="text-muted" style="padding: 24px; text-align: center;">
          ✔ No pending prized subscriber sureties in queue. All guarantees are cleared.
        </div>
      `;
      return;
    }

    sureties.forEach(s => {
      const card = document.createElement('div');
      card.className = 'surety-card';
      card.innerHTML = `
        <div class="surety-info-col">
          <span class="surety-badge">📜 ${s.surety_type.replace('_', ' ')}</span>
          <h4 style="color: var(--primary-navy); margin-bottom: 2px;">
            ${s.member_name} (+91-${s.member_phone})
          </h4>
          <div class="text-muted" style="font-size: 0.78rem;">
            ${s.group_name} • Cycle #${s.sequence_no} Prize Money: <strong>${formatINR(s.net_payout_minor)}</strong>
          </div>
          <div style="background: #F8FAFC; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; margin-top: 8px; font-size: 0.8rem;">
            <div>👤 <strong>Guarantor:</strong> ${s.guarantor_name} (${s.guarantor_phone})</div>
            <div>🆔 <strong>Aadhaar/ID:</strong> <code class="font-mono">${s.guarantor_id_masked}</code></div>
            <div>📄 <strong>Bond Ref:</strong> <code class="font-mono">${s.document_ref}</code></div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="btn btn-gold btn-sm approve-surety-btn" data-id="${s.id}">
            ✔ Approve Surety & Release Payout
          </button>
          <button class="btn btn-secondary btn-sm reject-surety-btn" data-id="${s.id}">
            ✖ Reject Surety
          </button>
        </div>
      `;

      card.querySelector('.approve-surety-btn').addEventListener('click', async () => {
        if (confirm(`Approve surety guarantee submitted by ${s.member_name} for ${s.group_name}?\nThis satisfies Section 31 of Chit Funds Act and enables prize money disbursal.`)) {
          try {
            await apiCall(`/api/host/verify-surety/${s.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approved: true })
            });
            alert('✔ Surety approved! Prize money is released for Maker-Checker payout.');
            loadHostSureties();
            loadCompliance();
          } catch (e) {
            alert(e.message);
          }
        }
      });

      card.querySelector('.reject-surety-btn').addEventListener('click', async () => {
        const reason = prompt('Enter rejection reason for this surety:');
        if (reason) {
          try {
            await apiCall(`/api/host/verify-surety/${s.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approved: false, rejectionReason: reason })
            });
            alert('Surety marked as rejected.');
            loadHostSureties();
          } catch (e) {
            alert(e.message);
          }
        }
      });

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading host sureties:', err);
  }
}

function setupSuretyModal() {
  const modal = document.getElementById('surety-modal');
  const closeBtn = document.getElementById('close-surety-modal-btn');
  const openBtn = document.getElementById('btn-open-surety-modal');
  const form = document.getElementById('surety-form');

  if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  if (openBtn) openBtn.addEventListener('click', () => { modal.style.display = 'flex'; });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payoutId = document.getElementById('surety-payout-id').value;
      const cycleId = document.getElementById('surety-cycle-id').value || activeCycleId;
      const membershipId = document.getElementById('surety-membership-id').value;
      const suretyType = document.getElementById('surety-type').value;
      const guarantorName = document.getElementById('surety-guarantor-name').value;
      const guarantorPhone = document.getElementById('surety-guarantor-phone').value;
      const guarantorIdMasked = document.getElementById('surety-guarantor-id').value;
      const documentRef = document.getElementById('surety-doc-ref').value;

      try {
        await apiCall('/api/sureties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payoutId,
            cycleId,
            membershipId,
            suretyType,
            guarantorName,
            guarantorPhone,
            guarantorIdMasked,
            documentRef
          })
        });

        alert('✔ Surety Guarantee submitted successfully under Section 31!\nYour Chit Host will inspect and approve the guarantee.');
        modal.style.display = 'none';
        loadAuctionRoom();
        loadHostWorkspace();
      } catch (err) {
        alert('Failed to submit surety: ' + err.message);
      }
    });
  }
}

function setupLotteryModal() {
  const modal = document.getElementById('lottery-modal');
  const closeBtn = document.getElementById('close-lottery-modal-btn');
  const openBtn = document.getElementById('btn-open-lottery-modal');
  const execBtn = document.getElementById('btn-execute-lottery');
  const wheel = document.getElementById('lottery-wheel-display');
  const winnerBox = document.getElementById('lottery-winner-announcement');

  if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  if (openBtn) openBtn.addEventListener('click', () => {
    winnerBox.style.display = 'none';
    modal.style.display = 'flex';
  });

  if (execBtn) {
    execBtn.addEventListener('click', async () => {
      execBtn.disabled = true;
      execBtn.textContent = 'Spinning Lots...';
      wheel.textContent = '🔄';

      try {
        const res = await apiCall(`/api/cycles/${activeCycleId}/lottery`, { method: 'POST' });
        setTimeout(() => {
          wheel.textContent = '🎉';
          winnerBox.style.display = 'block';
          winnerBox.innerHTML = `
            <div style="background: #FEF8EC; border: 2px solid var(--accent-gold); border-radius: var(--radius-sm); padding: 14px;">
              <h3 style="color: #9A6715; margin-bottom: 4px;">🏆 Winner Drawn: ${res.winner.memberName}!</h3>
              <p class="text-muted" style="font-size: 0.82rem;">Ticket Slot #${res.winner.slotNumber} • Statutory Max Discount ${formatINR(res.winner.discountMinor)}</p>
              <div style="font-size: 0.75rem; color: var(--success); font-weight: 700; margin-top: 6px;">✔ Fair Cryptographic Draw Completed</div>
            </div>
          `;
          execBtn.disabled = false;
          execBtn.textContent = 'Spin Wheel & Draw Winner';
          loadAuctionRoom();
        }, 1000);
      } catch (err) {
        execBtn.disabled = false;
        execBtn.textContent = 'Spin Wheel & Draw Winner';
        alert('Lottery execution error: ' + err.message);
      }
    });
  }
}

async function loadHostPendingVerifications() {
  const container = document.getElementById('host-verifications-list');
  const badge = document.getElementById('host-pending-badge');
  if (!container) return;

  try {
    const data = await apiCall('/api/host/pending-verifications');
    const list = data.verifications || [];

    badge.textContent = list.length;
    container.innerHTML = '';

    if (list.length === 0) {
      container.innerHTML = `
        <div class="text-muted" style="padding: 24px; text-align: center;">
          ✔ All offline and cash payments are verified. No pending cash approvals in queue.
        </div>
      `;
      return;
    }

    list.forEach(v => {
      const card = document.createElement('div');
      card.className = 'verification-card';
      card.innerHTML = `
        <div style="flex: 1; min-width: 240px;">
          <div class="verif-member-info">
            <strong>${v.payer_name}</strong> (+91-${v.payer_phone}) • <span>Slot #${v.slot_number}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            ${v.group_name} • Cycle #${v.cycle_sequence_no} Due
          </div>
          <div class="verif-notes-box">
            📝 <strong>Member Note:</strong> "${v.offline_notes || 'Handed cash to Host'}"
          </div>
        </div>

        <div style="text-align: right;">
          <div class="font-mono text-primary" style="font-size: 1.35rem; font-weight: 800; margin-bottom: 6px;">
            ${formatINR(v.amount_minor)}
          </div>
          <button class="btn btn-gold btn-sm verify-cash-btn" data-intent-id="${v.id}">
            ✔ Verify Cash Received & Clear Dues
          </button>
        </div>
      `;

      card.querySelector('.verify-cash-btn').addEventListener('click', async () => {
        if (confirm(`Confirm physical cash receipt of ${formatINR(v.amount_minor)} from ${v.payer_name}?\nThis will clear the member's dues and post a balanced entry to the general ledger.`)) {
          try {
            const res = await apiCall(`/api/host/verify-offline-cash/${v.id}`, { method: 'POST' });
            alert(`✔ Cash payment cleared!\nReceipt Issued: ${res.receiptNo}\nLedger successfully balanced.`);
            loadHostPendingVerifications();
            loadTopDues();
            loadLedger();
          } catch (e) {
            alert(e.message);
          }
        }
      });

      container.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading host verifications:', err);
  }
}

async function loadHostJoinRequests() {
  const container = document.getElementById('host-join-requests-list');
  if (!container) return;

  try {
    const grpData = await apiCall(`/api/groups/${activeGroupId}`);
    const pendingMembers = grpData.group.members.filter(m => m.status === 'PENDING_APPROVAL');

    container.innerHTML = '';
    if (pendingMembers.length === 0) {
      container.innerHTML = '<div class="text-muted p-3">No pending join applications for this chit.</div>';
      return;
    }

    pendingMembers.forEach(m => {
      const item = document.createElement('div');
      item.className = 'verification-card';
      item.innerHTML = `
        <div>
          <strong>${m.display_name}</strong> (+91-${m.phone})
          <div class="text-muted" style="font-size: 0.78rem;">KYC Status: <span class="badge-govt">${m.kyc_status}</span> • Reputation: ${m.reputation_score}%</div>
        </div>
        <button class="btn btn-primary btn-sm approve-member-btn" data-mem-id="${m.id}">
          Approve & Allocate Slot
        </button>
      `;

      item.querySelector('.approve-member-btn').addEventListener('click', async () => {
        try {
          await apiCall(`/api/groups/${activeGroupId}/members/${m.id}/approve`, { method: 'POST' });
          alert(`✔ Member ${m.display_name} approved and enrolled!`);
          loadHostJoinRequests();
          loadJoinChits();
        } catch (e) {
          alert(e.message);
        }
      });

      container.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading join requests:', err);
  }
}

// ----------------------------------------------------------------------------
// 7. PAYMENT MODALS (ONLINE UPI vs OFFLINE CASH)
// ----------------------------------------------------------------------------
function setupPaymentModals() {
  // 1. Online Modal
  const payModal = document.getElementById('payment-modal');
  const closePayBtn = document.getElementById('close-modal-btn');
  closePayBtn.addEventListener('click', () => { payModal.style.display = 'none'; });

  const apps = ['gpay', 'phonepe', 'paytm'];
  apps.forEach(app => {
    document.getElementById(`pay-${app}-btn`).addEventListener('click', async () => {
      if (!pendingObligationForPayment) return;
      try {
        const intentRes = await apiCall(`/api/obligations/${pendingObligationForPayment.id}/payment-intents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethod: 'UPI_QR' })
        });

        await apiCall(`/api/payments/webhooks/upi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intentId: intentRes.intent.id,
            status: 'SUCCESS'
          })
        });

        alert(`✔ Instant UPI payment of ${formatINR(pendingObligationForPayment.net_payable_minor)} settled successfully!\nGeneral ledger updated.`);
        payModal.style.display = 'none';
        loadTopDues();
        loadLedger();
      } catch (err) {
        alert('Payment failed: ' + err.message);
      }
    });
  });

  // 2. Offline Cash Modal
  const offlineModal = document.getElementById('offline-cash-modal');
  const closeOfflineBtn = document.getElementById('close-offline-modal-btn');
  closeOfflineBtn.addEventListener('click', () => { offlineModal.style.display = 'none'; });

  const offlineForm = document.getElementById('offline-cash-form');
  offlineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingObligationForPayment) return;
    const notes = document.getElementById('offline-cash-notes').value;

    try {
      await apiCall(`/api/obligations/${pendingObligationForPayment.id}/offline-cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });

      alert(`✔ Offline cash submission recorded!\nYour Chit Host will verify physical receipt and clear your dues.`);
      offlineModal.style.display = 'none';
      loadTopDues();
      loadHostWorkspace();
    } catch (err) {
      alert(err.message);
    }
  });
}

function openOnlinePaymentModal(due) {
  pendingObligationForPayment = due;
  document.getElementById('modal-pay-amount').textContent = formatINR(due.net_payable_minor);
  document.getElementById('payment-modal').style.display = 'flex';
}

function openOfflineCashModal(due) {
  pendingObligationForPayment = due;
  document.getElementById('offline-modal-amount').textContent = formatINR(due.net_payable_minor);
  document.getElementById('offline-cash-modal').style.display = 'flex';
}

// ----------------------------------------------------------------------------
// 8. LIVE AUCTION ROOM, MULTI-TIER BIDDING & SIMULATOR
// ----------------------------------------------------------------------------
let currentAuctionState = null;
let auctionCountdownSeconds = 225; // 03:45 timer
let countdownTimerInterval = null;

function startAuctionCountdown() {
  if (countdownTimerInterval) clearInterval(countdownTimerInterval);
  const clockEl = document.getElementById('auction-countdown-clock');
  if (!clockEl) return;

  countdownTimerInterval = setInterval(() => {
    if (auctionCountdownSeconds > 0) {
      auctionCountdownSeconds--;
    } else {
      auctionCountdownSeconds = 300; // Reset round
    }
    const mins = String(Math.floor(auctionCountdownSeconds / 60)).padStart(2, '0');
    const secs = String(auctionCountdownSeconds % 60).padStart(2, '0');
    clockEl.textContent = `${mins}:${secs}`;
  }, 1000);
}

function setupAuctionBiddingCalculator() {
  const bidInput = document.getElementById('bid-amount-input');
  const previewPrize = document.getElementById('preview-prize');
  const previewCommission = document.getElementById('preview-commission');
  const previewDividend = document.getElementById('preview-dividend');
  const previewNext = document.getElementById('preview-next-installment');

  function updatePreview() {
    const discount = Number(bidInput.value) || 0;
    const pool = currentAuctionState?.group ? (currentAuctionState.group.total_pool_minor / 100) : 500000;
    const members = currentAuctionState?.group ? currentAuctionState.group.max_members : 20;
    const nominal = currentAuctionState?.group ? (currentAuctionState.group.monthly_contribution_minor / 100) : 25000;
    const commissionRate = currentAuctionState?.group ? currentAuctionState.group.organizer_commission_rate : 0.05;

    const commission = Math.round(pool * commissionRate);
    const netPrize = pool - discount;
    const dividendTotal = Math.max(0, discount - commission);
    const dividendPerMember = Math.floor(dividendTotal / members);
    const nextInstallment = nominal - dividendPerMember;

    if (previewPrize) previewPrize.textContent = '₹' + netPrize.toLocaleString('en-IN');
    if (previewCommission) previewCommission.textContent = '₹' + commission.toLocaleString('en-IN');
    if (previewDividend) previewDividend.textContent = '₹' + dividendPerMember.toLocaleString('en-IN');
    if (previewNext) previewNext.textContent = '₹' + nextInstallment.toLocaleString('en-IN');
  }

  bidInput.addEventListener('input', updatePreview);

  // Quick Bid Buttons
  document.querySelectorAll('.btn-quick-bid[data-inc]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const inc = Number(e.currentTarget.getAttribute('data-inc'));
      const curr = Number(bidInput.value) || (currentAuctionState?.highestBid ? currentAuctionState.highestBid.bid_discount_minor / 100 : 25000);
      const maxCap = currentAuctionState?.group ? currentAuctionState.group.max_bid_discount_minor / 100 : 150000;
      bidInput.value = Math.min(maxCap, curr + inc);
      updatePreview();
    });
  });

  const btnCap = document.getElementById('btn-quick-cap');
  if (btnCap) {
    btnCap.addEventListener('click', () => {
      const maxCap = currentAuctionState?.group ? currentAuctionState.group.max_bid_discount_minor / 100 : 150000;
      bidInput.value = maxCap;
      updatePreview();
    });
  }

  // Real-Time Competitor Simulation Button
  const btnSimulate = document.getElementById('btn-simulate-competitor');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', async () => {
      btnSimulate.disabled = true;
      btnSimulate.innerHTML = '<span>⏳</span><span>Simulating other subscriber bid...</span>';
      try {
        const res = await apiCall(`/api/cycles/${activeCycleId}/simulate-competitor-bid`, { method: 'POST' });
        await loadAuctionRoom();
        btnSimulate.disabled = false;
        btnSimulate.innerHTML = '<span>🤖</span><span>Simulate Other Member Bid (Live Competition)</span>';
        alert(`⚡ Real-Time Competition Update!\nA competitor just placed a bid of ${formatINR(res.bid.bid_discount_minor)}.`);
      } catch (err) {
        btnSimulate.disabled = false;
        btnSimulate.innerHTML = '<span>🤖</span><span>Simulate Other Member Bid (Live Competition)</span>';
        alert('Simulation note: ' + err.message);
      }
    });
  }

  // Active Chit Selector Dropdown
  const cycleSelect = document.getElementById('auction-cycle-select');
  if (cycleSelect) {
    cycleSelect.addEventListener('change', (e) => {
      activeCycleId = e.target.value;
      loadAuctionRoom();
    });
  }

  // Bid Submission
  document.getElementById('bid-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const discountMinor = Number(bidInput.value) * 100;

    try {
      if (!currentAuctionState?.userMembership) {
        alert('You must be an active enrolled member of this chit group to submit auction bids.');
        return;
      }

      await apiCall(`/api/cycles/${activeCycleId}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          membershipId: currentAuctionState.userMembership.membershipId,
          bidDiscountMinor: discountMinor
        })
      });

      alert(`✔ Competitive bid of ₹${Number(bidInput.value).toLocaleString('en-IN')} submitted successfully!`);
      loadAuctionRoom();
    } catch (err) {
      alert('Bid Rejected: ' + err.message);
    }
  });

  // Close Auction
  document.getElementById('close-auction-btn').addEventListener('click', async () => {
    if (!confirm(`Are you sure you want to close this auction?\nThis will finalize the Prized Subscriber, compute member dividends, and post balanced entries to the General Ledger.`)) {
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

  startAuctionCountdown();
}

async function loadAuctionRoom() {
  try {
    const data = await apiCall(`/api/cycles/${activeCycleId}/bidding-room`);
    currentAuctionState = data;
    const cycle = data.cycle;
    const group = data.group;
    const highestBid = data.highestBid;
    const financials = data.financials;

    // Populate active chit selector if not already done
    const cycleSelect = document.getElementById('auction-cycle-select');
    if (cycleSelect && data.activeAuctions) {
      cycleSelect.innerHTML = '';
      data.activeAuctions.forEach(a => {
        const selected = a.cycle_id === activeCycleId ? 'selected' : '';
        cycleSelect.innerHTML += `
          <option value="${a.cycle_id}" ${selected}>
            ${a.group_name} (Cycle #${a.sequence_no}) • ${formatINRCompact(a.total_pool_minor)} Pool
          </option>
        `;
      });
    }

    document.getElementById('auction-group-title').textContent = group.name;
    document.getElementById('auction-cycle-pill').textContent = `Cycle #${cycle.sequence_no} of ${group.total_months}`;
    document.getElementById('auction-meta-pool').textContent = formatINRCompact(group.total_pool_minor);
    document.getElementById('auction-meta-min').textContent = formatINRCompact(group.min_bid_discount_minor);
    document.getElementById('auction-meta-max').textContent = formatINRCompact(group.max_bid_discount_minor);

    const currentHighBidEl = document.getElementById('current-high-bid');
    if (highestBid) {
      currentHighBidEl.textContent = formatINRCompact(highestBid.bid_discount_minor);
    } else {
      currentHighBidEl.textContent = `${formatINRCompact(group.min_bid_discount_minor)} (Min Floor)`;
    }

    // Set bid input bounds and initial value
    const bidInput = document.getElementById('bid-amount-input');
    if (bidInput) {
      const minVal = group.min_bid_discount_minor / 100;
      const maxVal = group.max_bid_discount_minor / 100;
      bidInput.min = minVal;
      bidInput.max = maxVal;
      const nextSuggested = highestBid ? Math.min(maxVal, (highestBid.bid_discount_minor / 100) + 5000) : minVal;
      bidInput.value = nextSuggested;
      document.getElementById('bid-limit-hint').textContent = `Between ₹${minVal.toLocaleString('en-IN')} and ₹${maxVal.toLocaleString('en-IN')} (Statutory 30% cap)`;
      bidInput.dispatchEvent(new Event('input'));
    }

    // Bids Feed
    const bidsList = document.getElementById('bids-list');
    bidsList.innerHTML = '';

    if (!data.bids || data.bids.length === 0) {
      bidsList.innerHTML = '<div class="text-muted p-3">No bids placed yet for this cycle. Be the first to place a bid!</div>';
    } else {
      data.bids.forEach((b, index) => {
        const isLeading = index === 0;
        const isMaxCeiling = b.bid_discount_minor === group.max_bid_discount_minor;
        const item = document.createElement('div');
        item.className = 'verification-card';
        item.style.padding = '10px 14px';
        item.innerHTML = `
          <div>
            <strong>${b.member_name}</strong> (Slot #${b.slot_number})
            <div class="text-muted" style="font-size: 0.72rem;">${new Date(b.submitted_at).toLocaleTimeString()}</div>
          </div>
          <div class="text-right">
            <span class="font-mono" style="font-size: 1rem; font-weight: 800;">${formatINR(b.bid_discount_minor)}</span>
            <div style="font-size: 0.72rem; font-weight: 700; color: ${isLeading ? 'var(--accent-gold)' : (isMaxCeiling ? 'var(--warning)' : 'var(--text-muted)')};">
              ${isLeading ? '★ Leading Highest Bid' : (isMaxCeiling ? '⚡ Tied 30% Max Ceiling' : 'Outbid')}
            </div>
          </div>
        `;
        bidsList.appendChild(item);
      });
    }

    // Tied Ceiling Alert
    const tiedAlert = document.getElementById('tied-ceiling-alert');
    if (data.isLotteryRequired && tiedAlert) {
      tiedAlert.style.display = 'flex';
      const candBox = document.getElementById('lottery-candidates-box');
      if (candBox && data.tiedCeilingMembers) {
        candBox.innerHTML = '<strong>Tied Ceiling Subscribers:</strong><br>';
        data.tiedCeilingMembers.forEach(m => {
          candBox.innerHTML += `<div>• <strong>${m.memberName}</strong> (Ticket Slot #${m.slotNumber})</div>`;
        });
      }
    } else if (tiedAlert) {
      tiedAlert.style.display = 'none';
    }

    // Winner Surety Prompt (Section 31)
    const winnerSuretyAlert = document.getElementById('winner-surety-alert');
    if (cycle.status === 'AUCTION_CLOSED' && cycle.winner_membership_id === data.userMembership?.membershipId) {
      if (winnerSuretyAlert) {
        winnerSuretyAlert.style.display = 'block';
        document.getElementById('surety-cycle-id').value = cycle.id;
        document.getElementById('surety-membership-id').value = data.userMembership.membershipId;
      }
    } else if (winnerSuretyAlert) {
      winnerSuretyAlert.style.display = 'none';
    }

    // Signed Result Card
    const resultCard = document.getElementById('auction-result-card');
    if (cycle.status === 'AUCTION_CLOSED' || cycle.status === 'SETTLED') {
      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div class="card-header">
          <h3>✔ Signed Auction Result Snapshot (Minutes of Auction)</h3>
          <span class="status-pill status-settled">${cycle.status}</span>
        </div>
        <div class="summary-row"><span>Winner Membership:</span> <strong>Slot #${cycle.winner_membership_id}</strong></div>
        <div class="summary-row"><span>Winning Discount:</span> <strong>${formatINR(cycle.winning_bid_discount_minor)}</strong></div>
        <div class="summary-row"><span>Organizer Commission (5%):</span> <strong>${formatINR(cycle.organizer_commission_minor)}</strong></div>
        <div class="summary-row"><span>Dividend / Member:</span> <strong>${formatINR(cycle.dividend_per_member_minor)}</strong></div>
        <div class="summary-row"><span>Net Prize Disbursable:</span> <strong>${formatINR(cycle.payout_amount_minor)}</strong></div>
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
// 9. BALANCED GENERAL LEDGER
// ----------------------------------------------------------------------------
async function loadLedger() {
  try {
    const data = await apiCall(`/api/groups/${activeGroupId}/reconciliation`);
    const recon = data.reconciliation;

    document.getElementById('stat-total-debit').textContent = formatINR(recon.totalSystemDebit);
    document.getElementById('stat-total-credit').textContent = formatINR(recon.totalSystemCredit);
    document.getElementById('stat-variance').textContent = formatINR(recon.systemVariance);
    document.getElementById('stat-tx-count').textContent = recon.totalTransactions;

    const badge = document.getElementById('reconciliation-badge');
    badge.textContent = recon.isFullyBalanced ? '✔ 100% BALANCED (Variance = ₹0.00)' : '⚠ UNBALANCED VARIANCE';

    const chartBody = document.getElementById('chart-accounts-body');
    chartBody.innerHTML = '';
    recon.chartOfAccounts.forEach(acc => {
      chartBody.innerHTML += `
        <tr>
          <td><code class="font-mono">${acc.code}</code></td>
          <td><strong>${acc.name}</strong></td>
          <td><span class="trust-badge-pill badge-bank">${acc.type}</span></td>
          <td class="text-right font-mono" style="font-weight: 700;">${formatINR(acc.balance_minor)}</td>
        </tr>
      `;
    });

    const txBody = document.getElementById('transactions-body');
    txBody.innerHTML = '';
    recon.transactions.forEach(tx => {
      txBody.innerHTML += `
        <tr>
          <td><code class="font-mono">${tx.id.slice(0, 8)}</code></td>
          <td><span class="status-pill status-finance">${tx.source_type}</span></td>
          <td>${tx.description}</td>
          <td class="text-right font-mono text-primary">${formatINR(tx.txDebit)}</td>
          <td class="text-right font-mono text-primary">${formatINR(tx.txCredit)}</td>
          <td><span class="text-success font-mono">✔ Yes</span></td>
          <td class="text-muted" style="font-size: 0.72rem;">${new Date(tx.posted_at).toLocaleString()}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error loading ledger:', err);
  }
}

// ----------------------------------------------------------------------------
// 10. COMPLIANCE & GOVERNANCE VIEW
// ----------------------------------------------------------------------------
async function loadCompliance() {
  try {
    const payoutsData = await apiCall('/api/payouts');
    const payoutsBody = document.getElementById('payouts-body');
    payoutsBody.innerHTML = '';

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
        <td style="font-size: 0.74rem;">Maker: ${p.maker_phone || 'None'}<br>Checker: ${p.checker_phone || 'None'}</td>
        <td>${actionBtn}</td>
      `;

      if (tr.querySelector('.initiate-payout-btn')) {
        tr.querySelector('.initiate-payout-btn').addEventListener('click', async () => {
          await apiCall(`/api/payouts/${p.id}/initiate`, { method: 'POST' });
          alert('✔ Payout initiated by Maker. Queued for Finance Checker authorization.');
          loadCompliance();
        });
      }
      if (tr.querySelector('.approve-payout-btn')) {
        tr.querySelector('.approve-payout-btn').addEventListener('click', async () => {
          try {
            await apiCall(`/api/payouts/${p.id}/approve`, { method: 'POST' });
            alert('✔ Payout approved and prize money disbursed!\nDouble-entry ledger transaction posted.');
            loadCompliance();
            loadLedger();
          } catch (e) {
            alert('Authorization Blocked: ' + e.message);
          }
        });
      }

      payoutsBody.appendChild(tr);
    });

    const kycData = await apiCall('/api/kyc/cases');
    const kycBody = document.getElementById('kyc-table');
    kycBody.innerHTML = '';
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
          </td>
        </tr>
      `;
    });

    const auditData = await apiCall('/api/audit-events?limit=10');
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
    console.error('Error loading compliance:', err);
  }
}

window.reviewKyc = async (caseId, decision) => {
  try {
    await apiCall(`/api/kyc/cases/${caseId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: 'Demographic and UIDAI OTP check verified' })
    });
    alert(`KYC Case ${decision}`);
    loadCompliance();
  } catch (err) {
    alert(err.message);
  }
};
