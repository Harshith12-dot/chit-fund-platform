import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

// In-memory OTP storage for SMS verification simulation
const otpStore = new Map();

// Role-Based Access Control (RBAC) permissions matrix
export const ROLE_PERMISSIONS = {
  MEMBER: ['view_profile', 'join_group', 'pay_obligation', 'submit_bid', 'view_ledger', 'raise_dispute', 'send_message'],
  ORGANIZER: ['create_group', 'manage_group_rules', 'approve_member', 'schedule_cycle', 'start_auction', 'post_announcement'],
  COLLECTOR: ['record_offline_payment', 'view_assigned_members', 'view_delinquencies'],
  OPERATIONS_ADMIN: ['review_kyc', 'manage_queues', 'initiate_payout', 'resolve_disputes', 'export_reports'],
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

export function requestOtp(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    throw new Error('Valid 10-digit mobile number is required.');
  }
  // Deterministic 123456 for easy demo & test, or 6-digit random
  const otp = '123456';
  otpStore.set(cleanPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  return { phone: cleanPhone, message: `OTP sent successfully to +91-${cleanPhone}. (Sandbox test OTP is 123456)`, testOtp: otp };
}

export function verifyOtpAndLogin(phone, enteredOtp, db = null) {
  const database = db || getDatabase();
  const cleanPhone = phone.replace(/\D/g, '');
  const record = otpStore.get(cleanPhone);

  // In sandbox demo mode, allow 123456 anytime or match stored
  if (enteredOtp !== '123456' && (!record || record.otp !== enteredOtp || Date.now() > record.expiresAt)) {
    throw new Error('Invalid or expired OTP. Please use 123456 for sandbox testing.');
  }

  // Find or create user
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
      VALUES (?, ?, ?, NULL, ?, 'UNVERIFIED', 100.0, ?, ?)
    `).run(userId, `User ${cleanPhone.slice(-4)}`, `user_${cleanPhone.slice(-4)}@example.com`, referralCode, now, now);

    user = database.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    logAuditEvent({
      actorId: userId,
      action: 'USER_REGISTERED',
      objectType: 'users',
      objectId: userId,
      afterState: user,
      metadata: { phone: cleanPhone },
      db: database
    });
  } else {
    // Refresh token
    const token = 'tok-' + randomUUID();
    database.prepare('UPDATE users SET auth_token = ? WHERE id = ?').run(token, user.id);
    user.auth_token = token;
  }

  const profile = database.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(user.id);
  return { user, profile };
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
    SELECT u.id, u.phone, u.role, u.status, u.created_at,
           p.display_name, p.email, p.locality_id, p.kyc_status, p.reputation_score, p.upi_id
    FROM users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
    ORDER BY u.created_at ASC
  `).all();
}
