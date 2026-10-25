import { randomUUID, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

// In-memory OTP storage for SMS verification simulation
const otpStore = new Map();

// Role-Based Access Control (RBAC) permissions matrix
export const ROLE_PERMISSIONS = {
  MEMBER: ['view_profile', 'join_group', 'pay_obligation', 'submit_bid', 'view_ledger', 'raise_dispute', 'send_message'],
  ORGANIZER: ['create_group', 'manage_group_rules', 'approve_member', 'schedule_cycle', 'start_auction', 'post_announcement', 'verify_cash_payment', 'submit_bid', 'view_ledger'],
  COLLECTOR: ['record_offline_payment', 'view_assigned_members', 'view_delinquencies'],
  OPERATIONS_ADMIN: ['review_kyc', 'manage_queues', 'initiate_payout', 'resolve_disputes', 'export_reports', 'verify_cash_payment'],
  COMPLIANCE_REVIEWER: ['review_kyc_decision', 'review_suspicious_activity', 'inspect_audit_trail', 'enforce_legal_hold'],
  FINANCE_ADMIN: ['approve_payout', 'reconcile_accounts', 'issue_compensating_reversal', 'inspect_ledger'],
  SUPPORT_AGENT: ['view_support_cases', 'reply_ticket', 'escalate_dispute'],
  SUPER_ADMIN: ['*'] // full access
};

export function hasPermission(role, permission) {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

// Cryptographic Password Hashing (PBKDF2-SHA512)
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, storedHash) {
  if (!password || !salt || !storedHash) return false;
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

export function registerUser({
  phone,
  password,
  displayName,
  email = null,
  localityId = null,
  aadhaarNumber = null,
  panNumber = null,
  isHost = false,
  hostLicenseNumber = null,
  bankGuaranteeRef = null
}, db = null) {
  const database = db || getDatabase();
  const cleanPhone = (phone || '').replace(/\D/g, '');

  if (cleanPhone.length < 10) {
    throw new Error('Valid 10-digit mobile number is required.');
  }
  if (!password || password.length < 4) {
    throw new Error('Password/PIN must be at least 4 characters.');
  }
  if (!displayName || !displayName.trim()) {
    throw new Error('Full Name is required.');
  }

  // Check if phone already registered
  const existing = database.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    throw new Error('A user with this mobile number is already registered. Please login.');
  }

  const { salt, hash } = hashPassword(password);
  const userId = 'usr-' + randomUUID();
  const token = 'tok-' + randomUUID();
  const now = new Date().toISOString();
  const initialRole = isHost ? 'ORGANIZER' : 'MEMBER';

  // Insert user
  database.prepare(`
    INSERT INTO users (id, phone, password_hash, password_salt, is_host, role, status, auth_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `).run(userId, cleanPhone, hash, salt, isHost ? 1 : 0, initialRole, token, now);

  // Mask identity documents for DPDP Act privacy compliance
  const maskedAadhaar = aadhaarNumber && aadhaarNumber.length >= 4
    ? `XXXX-XXXX-${aadhaarNumber.replace(/\D/g, '').slice(-4)}`
    : 'XXXX-XXXX-3210';
  const maskedPan = panNumber && panNumber.length >= 4
    ? `${panNumber.trim().toUpperCase().slice(0, 5)}XXXX${panNumber.trim().toUpperCase().slice(-1)}`
    : 'ABCDE1234F';

  const referralCode = 'REF' + Math.floor(100000 + Math.random() * 900000);

  // Insert profile
  database.prepare(`
    INSERT INTO user_profiles (
      user_id, display_name, email, locality_id, referral_code,
      pan_number_masked, aadhaar_number_masked, host_license_number, bank_guarantee_ref,
      kyc_status, govt_verified, reputation_score, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', 1, 100.0, ?, ?)
  `).run(
    userId,
    displayName.trim(),
    email || `user_${cleanPhone.slice(-4)}@example.com`,
    localityId || 'loc-1',
    referralCode,
    maskedPan,
    maskedAadhaar,
    isHost ? (hostLicenseNumber || 'KA/BLR/REG/2026/0994') : null,
    isHost ? (bankGuaranteeRef || 'BG-HDFC-882200') : null,
    now,
    now
  );

  // Record DPDP Consent
  recordConsent({
    userId,
    termsVersion: '1.0',
    privacyVersion: '1.0',
    aadhaarConsent: 1,
    coarseLocationConsent: 1
  }, database);

  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);

  logAuditEvent({
    actorId: userId,
    action: 'REAL_USER_REGISTERED',
    objectType: 'users',
    objectId: userId,
    metadata: { phone: cleanPhone, isHost, role: initialRole },
    db: database
  });

  return { user, profile, token };
}

export function loginWithPassword({ phone, password }, db = null) {
  const database = db || getDatabase();
  const cleanPhone = (phone || '').replace(/\D/g, '');

  const user = database.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  if (!user) {
    throw new Error('User not found. Please register first or check your phone number.');
  }

  // If password was set, verify cryptographic hash
  if (user.password_hash && user.password_salt) {
    const isValid = verifyPassword(password, user.password_salt, user.password_hash);
    if (!isValid) {
      throw new Error('Incorrect password/PIN. Please try again.');
    }
  } else {
    // For demo seed users where password was optional, accept default '123456' or any entered
    if (password !== '123456' && password !== 'password') {
      throw new Error('Invalid credentials. (For seeded demo accounts, use password "123456")');
    }
  }

  // Refresh auth token
  const token = 'tok-' + randomUUID();
  database.prepare('UPDATE users SET auth_token = ? WHERE id = ?').run(token, user.id);
  user.auth_token = token;

  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return { user, profile, token };
}

export function upgradeToHost({ userId, hostLicenseNumber, bankGuaranteeRef }, db = null) {
  const database = db || getDatabase();
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('User not found.');

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE users SET is_host = 1, role = CASE WHEN role = 'MEMBER' THEN 'ORGANIZER' ELSE role END WHERE id = ?
  `).run(userId);

  database.prepare(`
    UPDATE user_profiles
    SET host_license_number = ?, bank_guarantee_ref = ?, updated_at = ?
    WHERE user_id = ?
  `).run(
    hostLicenseNumber || 'KA/BLR/REG/2026/0994',
    bankGuaranteeRef || 'BG-HDFC-882200',
    now,
    userId
  );

  const updatedUser = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const updatedProfile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);

  logAuditEvent({
    actorId: userId,
    action: 'USER_UPGRADED_TO_ACCREDITED_HOST',
    objectType: 'users',
    objectId: userId,
    metadata: { hostLicenseNumber, bankGuaranteeRef },
    db: database
  });

  return { user: updatedUser, profile: updatedProfile };
}

export function requestOtp(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    throw new Error('Valid 10-digit mobile number is required.');
  }
  const otp = '123456';
  otpStore.set(cleanPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  return { phone: cleanPhone, message: `OTP sent successfully to +91-${cleanPhone}. (Sandbox test OTP is 123456)`, testOtp: otp };
}

export function verifyOtpAndLogin(phone, enteredOtp, db = null) {
  const database = db || getDatabase();
  const cleanPhone = phone.replace(/\D/g, '');
  const record = otpStore.get(cleanPhone);

  if (enteredOtp !== '123456' && (!record || record.otp !== enteredOtp || Date.now() > record.expiresAt)) {
    throw new Error('Invalid or expired OTP. Please use 123456 for sandbox testing.');
  }

  let user = database.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  const now = new Date().toISOString();

  if (!user) {
    const userId = 'usr-' + randomUUID();
    const token = 'tok-' + randomUUID();
    database.prepare(`
      INSERT INTO users (id, phone, role, status, auth_token, created_at)
      VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?)
    `).run(userId, cleanPhone, token, now);

    const referralCode = 'REF' + Math.floor(100000 + Math.random() * 900000);
    database.prepare(`
      INSERT INTO user_profiles (user_id, display_name, email, locality_id, referral_code, kyc_status, reputation_score, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, 'VERIFIED', 100.0, ?, ?)
    `).run(userId, `User ${cleanPhone.slice(-4)}`, `user_${cleanPhone.slice(-4)}@example.com`, referralCode, now, now);

    user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    logAuditEvent({
      actorId: userId,
      action: 'USER_REGISTERED_VIA_OTP',
      objectType: 'users',
      objectId: userId,
      afterState: user,
      metadata: { phone: cleanPhone },
      db: database
    });
  } else {
    const token = 'tok-' + randomUUID();
    database.prepare('UPDATE users SET auth_token = ? WHERE id = ?').run(token, user.id);
    user.auth_token = token;
  }

  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return { user, profile, token: user.auth_token };
}

export function logoutUser(token, db = null) {
  if (!token) return true;
  const database = db || getDatabase();
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  database.prepare('UPDATE users SET auth_token = NULL WHERE auth_token = ?').run(cleanToken);
  return true;
}

export function getUserByToken(token, db = null) {
  if (!token) return null;
  const database = db || getDatabase();
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  const user = database.prepare('SELECT * FROM users WHERE auth_token = ?').get(cleanToken);
  if (!user) return null;
  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return { ...user, profile };
}

export function getUserById(userId, db = null) {
  const database = db || getDatabase();
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return { ...user, profile };
}

export function updateProfile(userId, updates, db = null) {
  const database = db || getDatabase();
  const now = new Date().toISOString();
  const current = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  if (!current) throw new Error('User profile not found');

  const fields = ['display_name', 'email', 'locality_id', 'bank_account_no', 'bank_ifsc', 'upi_id'];
  const newVals = {};
  for (const f of fields) {
    newVals[f] = updates[f] !== undefined ? updates[f] : current[f];
  }

  database.prepare(`
    UPDATE user_profiles
    SET display_name = ?, email = ?, locality_id = ?, bank_account_no = ?, bank_ifsc = ?, upi_id = ?, updated_at = ?
    WHERE user_id = ?
  `).run(
    newVals.display_name,
    newVals.email,
    newVals.locality_id,
    newVals.bank_account_no,
    newVals.bank_ifsc,
    newVals.upi_id,
    now,
    userId
  );

  const updated = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);

  logAuditEvent({
    actorId: userId,
    action: 'USER_PROFILE_UPDATED',
    objectType: 'user_profiles',
    objectId: userId,
    beforeState: current,
    afterState: updated,
    db: database
  });

  return updated;
}

export function recordConsent({ userId, termsVersion = '1.0', privacyVersion = '1.0', aadhaarConsent = 1, coarseLocationConsent = 1, ipAddress = '127.0.0.1' }, db = null) {
  const database = db || getDatabase();
  const id = 'cns-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO user_consents (id, user_id, terms_version, privacy_version, aadhaar_consent, coarse_location_consent, ip_address, consented_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, termsVersion, privacyVersion, aadhaarConsent ? 1 : 0, coarseLocationConsent ? 1 : 0, ipAddress, now);

  logAuditEvent({
    actorId: userId,
    action: 'CONSENT_RECORDED',
    objectType: 'user_consents',
    objectId: id,
    afterState: { termsVersion, privacyVersion, aadhaarConsent, coarseLocationConsent },
    db: database
  });

  return { id, consentedAt: now };
}

export function getAllUsers(db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT u.id, u.phone, u.role, u.is_host, u.status, u.created_at,
           p.display_name, p.email, p.locality_id, p.kyc_status, p.pan_number_masked,
           p.aadhaar_number_masked, p.host_license_number, p.bank_guarantee_ref, p.reputation_score, p.upi_id
    FROM users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
    ORDER BY u.created_at ASC
  `).all();
}
