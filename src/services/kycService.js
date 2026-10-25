import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

export function submitKycCase({ userId, docType = 'AADHAAR_OTP', aadhaarNumber, fullName }, db = null) {
  const database = db || getDatabase();
  const cleanNumber = (aadhaarNumber || '').replace(/\D/g, '');
  if (cleanNumber.length !== 12) {
    throw new Error('Aadhaar number must be exactly 12 digits.');
  }

  // Mask identity: store only last 4 digits (e.g. XXXX-XXXX-4567) as per UIDAI & Privacy requirements
  const maskedDoc = `XXXX-XXXX-${cleanNumber.slice(-4)}`;
  const caseId = 'kyc-' + randomUUID();
  const providerRef = 'UIDAI-SANDBOX-' + Math.floor(10000000 + Math.random() * 90000000);
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO kyc_cases (id, user_id, provider, provider_ref, doc_type, doc_number_masked, status, submitted_at)
    VALUES (?, ?, 'SANDBOX_UIDAI_ADAPTER', ?, ?, ?, 'PENDING', ?)
  `).run(caseId, userId, providerRef, docType, maskedDoc, now);

  // Update profile status to IN_REVIEW
  database.prepare(`
    UPDATE user_profiles
    SET kyc_status = 'IN_REVIEW', updated_at = ?
    WHERE user_id = ?
  `).run(now, userId);

  const kycCase = database.prepare('SELECT * FROM kyc_cases WHERE id = ?').get(caseId);

  logAuditEvent({
    actorId: userId,
    action: 'KYC_CASE_SUBMITTED',
    objectType: 'kyc_cases',
    objectId: caseId,
    afterState: kycCase,
    metadata: { docType, providerRef, maskedDoc },
    db: database
  });

  return kycCase;
}

export function reviewKycCase({ caseId, reviewerUserId, decision, reason = '' }, db = null) {
  const database = db || getDatabase();
  const existing = database.prepare('SELECT * FROM kyc_cases WHERE id = ?').get(caseId);
  if (!existing) throw new Error('KYC case not found.');

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new Error('Decision must be APPROVED or REJECTED.');
  }

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE kyc_cases
    SET status = ?, reviewed_by = ?, decision_reason = ?, decided_at = ?
    WHERE id = ?
  `).run(decision, reviewerUserId, reason, now, caseId);

  const newKycStatus = decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
  database.prepare(`
    UPDATE user_profiles
    SET kyc_status = ?, updated_at = ?
    WHERE user_id = ?
  `).run(newKycStatus, now, existing.user_id);

  const updatedCase = database.prepare('SELECT * FROM kyc_cases WHERE id = ?').get(caseId);

  logAuditEvent({
    actorId: reviewerUserId,
    action: `KYC_${decision}`,
    objectType: 'kyc_cases',
    objectId: caseId,
    beforeState: existing,
    afterState: updatedCase,
    metadata: { reason },
    db: database
  });

  return updatedCase;
}

export function getPendingKycCases(db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT k.*, u.phone, p.display_name, p.email, p.reputation_score
    FROM kyc_cases k
    JOIN users u ON k.user_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE k.status = 'PENDING'
    ORDER BY k.submitted_at ASC
  `).all();
}
