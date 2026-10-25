import { URL } from 'node:url';
import * as authService from '../services/authService.js';
import * as localityService from '../services/localityService.js';
import * as kycService from '../services/kycService.js';
import * as groupService from '../services/groupService.js';
import * as cycleService from '../services/cycleService.js';
import * as auctionService from '../services/auctionService.js';
import * as ledgerService from '../services/ledgerService.js';
import * as paymentService from '../services/paymentService.js';
import * as payoutService from '../services/payoutService.js';
import * as disputeService from '../services/disputeService.js';
import * as communicationService from '../services/communicationService.js';
import * as auditService from '../services/auditService.js';
import { seedDatabase } from '../seed/seedData.js';

// Route matching helper
function matchRoute(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export async function handleApiRequest(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Extract auth context
  const authHeader = req.headers.authorization || '';
  const xUserId = req.headers['x-user-id'] || reqUrl.searchParams.get('userId');
  let currentUser = authService.getUserByToken(authHeader);
  if (!currentUser && xUserId) {
    currentUser = authService.getUserById(xUserId);
  }

  // Parse body helper
  const readBody = () =>
    new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });

  // Response helpers
  const json = (data, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
    });
    res.end(JSON.stringify(data));
  };

  const error = (msg, status = 400) => {
    json({ error: msg, success: false }, status);
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
    });
    return res.end();
  }

  try {
    // ------------------------------------------------------------------------
    // IDENTITY & AUTH
    // ------------------------------------------------------------------------
    if (method === 'POST' && pathname === '/api/auth/otp') {
      const body = await readBody();
      if (!body.phone) return error('Phone number is required.');
      const result = authService.requestOtp(body.phone);
      return json({ success: true, ...result });
    }

    if (method === 'POST' && pathname === '/api/auth/verify') {
      const body = await readBody();
      if (!body.phone || !body.otp) return error('Phone and OTP are required.');
      const result = authService.verifyOtpAndLogin(body.phone, body.otp);
      return json({ success: true, ...result });
    }

    if (method === 'GET' && pathname === '/api/me') {
      if (!currentUser) return error('Unauthorized. Please log in.', 401);
      return json({ success: true, user: currentUser });
    }

    if (method === 'PATCH' && pathname === '/api/me') {
      if (!currentUser) return error('Unauthorized.', 401);
      const body = await readBody();
      const updated = authService.updateProfile(currentUser.id, body);
      return json({ success: true, profile: updated });
    }

    if (method === 'POST' && pathname === '/api/consents') {
      if (!currentUser) return error('Unauthorized.', 401);
      const body = await readBody();
      const result = authService.recordConsent({
        userId: currentUser.id,
        termsVersion: body.termsVersion,
        privacyVersion: body.privacyVersion,
        aadhaarConsent: body.aadhaarConsent,
        coarseLocationConsent: body.coarseLocationConsent,
        ipAddress: req.socket.remoteAddress
      });
      return json({ success: true, ...result });
    }

    if (method === 'GET' && pathname === '/api/users') {
      const users = authService.getAllUsers();
      return json({ success: true, users });
    }

    // ------------------------------------------------------------------------
    // LOCALITIES & NEARBY DISCOVERY
    // ------------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/localities') {
      const localities = localityService.getAllLocalities();
      return json({ success: true, localities });
    }

    if (method === 'GET' && (pathname === '/api/groups/nearby' || pathname === '/api/localities/nearby')) {
      const lat = reqUrl.searchParams.get('lat') ? parseFloat(reqUrl.searchParams.get('lat')) : null;
      const lon = reqUrl.searchParams.get('lon') ? parseFloat(reqUrl.searchParams.get('lon')) : null;
      const locId = reqUrl.searchParams.get('localityId') || (currentUser?.profile?.locality_id);
      const radius = reqUrl.searchParams.get('radiusKm') ? parseFloat(reqUrl.searchParams.get('radiusKm')) : 15;

      const groups = localityService.findNearbyGroups({
        latitude: lat,
        longitude: lon,
        localityId: locId,
        radiusKm: radius
      });
      return json({ success: true, count: groups.length, groups });
    }

    // ------------------------------------------------------------------------
    // CHIT GROUPS
    // ------------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/groups') {
      const groups = groupService.getAllGroups();
      return json({ success: true, groups });
    }

    if (method === 'POST' && pathname === '/api/groups') {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const group = groupService.createChitGroup({
        organizerId: currentUser.id,
        localityId: body.localityId,
        name: body.name,
        totalPoolMinor: body.totalPoolMinor,
        monthlyContributionMinor: body.monthlyContributionMinor,
        totalMonths: body.totalMonths,
        maxMembers: body.maxMembers,
        organizerCommissionRate: body.organizerCommissionRate || 0.05,
        minBidDiscountMinor: body.minBidDiscountMinor,
        maxBidDiscountMinor: body.maxBidDiscountMinor,
        constitutionVersion: body.constitutionVersion || '1.0'
      });
      return json({ success: true, group }, 201);
    }

    let params = matchRoute('/api/groups/:id', pathname);
    if (method === 'GET' && params) {
      const group = groupService.getGroupDetails(params.id);
      if (!group) return error('Group not found', 404);
      return json({ success: true, group });
    }

    params = matchRoute('/api/groups/:id/join-requests', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const membership = groupService.requestToJoinGroup({
        groupId: params.id,
        userId: currentUser.id,
        acceptedRulesVersion: body.acceptedRulesVersion || '1.0'
      });
      return json({ success: true, membership });
    }

    params = matchRoute('/api/groups/:id/members/:memberId/approve', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const membership = groupService.approveGroupMember({
        membershipId: params.memberId,
        approverUserId: currentUser.id
      });
      return json({ success: true, membership });
    }

    // ------------------------------------------------------------------------
    // CYCLES & AUCTIONS
    // ------------------------------------------------------------------------
    params = matchRoute('/api/cycles/:id', pathname);
    if (method === 'GET' && params) {
      const cycle = cycleService.getCycleDetails(params.id);
      if (!cycle) return error('Cycle not found', 404);
      return json({ success: true, cycle });
    }

    params = matchRoute('/api/cycles/:id/start-auction', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const cycle = auctionService.startAuction({
        cycleId: params.id,
        startedByUserId: currentUser.id
      });
      return json({ success: true, cycle });
    }

    params = matchRoute('/api/cycles/:id/bids', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const bid = auctionService.submitBid({
        cycleId: params.id,
        membershipId: body.membershipId,
        bidDiscountMinor: body.bidDiscountMinor,
        actorUserId: currentUser.id
      });
      return json({ success: true, bid });
    }

    params = matchRoute('/api/cycles/:id/close', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const result = auctionService.closeAuction({
        cycleId: params.id,
        closedByUserId: currentUser.id
      });
      return json({ success: true, ...result });
    }

    params = matchRoute('/api/cycles/:id/result', pathname);
    if (method === 'GET' && params) {
      const cycle = cycleService.getCycleDetails(params.id);
      if (!cycle) return error('Cycle not found', 404);
      return json({
        success: true,
        cycleId: cycle.id,
        status: cycle.status,
        winnerMembershipId: cycle.winner_membership_id,
        winningBidDiscountMinor: cycle.winning_bid_discount_minor,
        dividendPerMemberMinor: cycle.dividend_per_member_minor,
        organizerCommissionMinor: cycle.organizer_commission_minor,
        payoutAmountMinor: cycle.payout_amount_minor,
        resultSignature: cycle.result_signature
      });
    }

    // ------------------------------------------------------------------------
    // PAYMENTS & OBLIGATIONS
    // ------------------------------------------------------------------------
    params = matchRoute('/api/obligations/:id/payment-intents', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const result = paymentService.createPaymentIntent({
        obligationId: params.id,
        payerUserId: currentUser.id,
        paymentMethod: body.paymentMethod || 'UPI_QR',
        collectorId: body.collectorId || null,
        idempotencyKey: body.idempotencyKey || null
      });
      return json({ success: true, ...result });
    }

    params = matchRoute('/api/obligations/:id/collector-cash', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const result = paymentService.recordCollectorCashPayment({
        obligationId: params.id,
        collectorUserId: currentUser.id,
        notes: body.notes
      });
      return json({ success: true, ...result });
    }

    params = matchRoute('/api/payments/webhooks/:provider', pathname);
    if (method === 'POST' && params) {
      const body = await readBody();
      const result = paymentService.processPaymentWebhook({
        intentId: body.intentId,
        providerRef: body.providerRef,
        status: body.status || 'SUCCESS',
        idempotencyKey: body.idempotencyKey
      });
      return json({ success: true, ...result });
    }

    // ------------------------------------------------------------------------
    // DOUBLE-ENTRY BALANCED LEDGER
    // ------------------------------------------------------------------------
    params = matchRoute('/api/members/:id/statement', pathname);
    if (method === 'GET' && params) {
      const statement = ledgerService.getMemberStatement(params.id);
      return json({ success: true, ...statement });
    }

    params = matchRoute('/api/groups/:id/reconciliation', pathname);
    if (method === 'GET' && params) {
      const reconciliation = ledgerService.getGroupReconciliation(params.id);
      return json({ success: true, reconciliation });
    }

    // ------------------------------------------------------------------------
    // PAYOUTS & MAKER-CHECKER WORKFLOW
    // ------------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/payouts') {
      const payouts = payoutService.getAllPayouts();
      return json({ success: true, payouts });
    }

    params = matchRoute('/api/payouts/:id/initiate', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const payout = payoutService.initiatePayout({
        payoutId: params.id,
        makerUserId: currentUser.id
      });
      return json({ success: true, payout });
    }

    params = matchRoute('/api/payouts/:id/approve', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const payout = payoutService.approveAndDisbursePayout({
        payoutId: params.id,
        checkerUserId: currentUser.id
      });
      return json({ success: true, payout });
    }

    // ------------------------------------------------------------------------
    // KYC CASES & COMPLIANCE REVIEW
    // ------------------------------------------------------------------------
    if (method === 'POST' && pathname === '/api/kyc/cases') {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const kycCase = kycService.submitKycCase({
        userId: currentUser.id,
        docType: body.docType || 'AADHAAR_OTP',
        aadhaarNumber: body.aadhaarNumber,
        fullName: body.fullName
      });
      return json({ success: true, kycCase });
    }

    if (method === 'GET' && pathname === '/api/kyc/cases') {
      const cases = kycService.getPendingKycCases();
      return json({ success: true, cases });
    }

    params = matchRoute('/api/kyc/cases/:id/review', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const reviewed = kycService.reviewKycCase({
        caseId: params.id,
        reviewerUserId: currentUser.id,
        decision: body.decision,
        reason: body.reason
      });
      return json({ success: true, kycCase: reviewed });
    }

    // ------------------------------------------------------------------------
    // DISPUTES & SUPPORT
    // ------------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/support/cases') {
      const cases = disputeService.getAllSupportCases();
      return json({ success: true, cases });
    }

    if (method === 'POST' && pathname === '/api/support/cases') {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const supportCase = disputeService.createSupportCase({
        raisedByUserId: currentUser.id,
        groupId: body.groupId,
        cycleId: body.cycleId,
        category: body.category,
        title: body.title,
        description: body.description
      });
      return json({ success: true, supportCase }, 201);
    }

    params = matchRoute('/api/support/cases/:id/resolve', pathname);
    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const resolved = disputeService.resolveSupportCase({
        caseId: params.id,
        resolvedByUserId: currentUser.id,
        decision: body.decision || 'RESOLVED',
        resolutionNotes: body.resolutionNotes,
        compensatingAmountMinor: body.compensatingAmountMinor || 0,
        compensatingGroupId: body.compensatingGroupId || null,
        compensatingMembershipId: body.compensatingMembershipId || null
      });
      return json({ success: true, supportCase: resolved });
    }

    // ------------------------------------------------------------------------
    // COMMUNICATION
    // ------------------------------------------------------------------------
    params = matchRoute('/api/groups/:id/messages', pathname);
    if (method === 'GET' && params) {
      const messages = communicationService.getGroupMessages(params.id);
      return json({ success: true, messages });
    }

    if (method === 'POST' && params) {
      if (!currentUser) return error('Unauthorized', 401);
      const body = await readBody();
      const msg = communicationService.sendMessage({
        groupId: params.id,
        senderUserId: currentUser.id,
        message: body.message,
        isAnnouncement: !!body.isAnnouncement
      });
      return json({ success: true, message: msg });
    }

    // ------------------------------------------------------------------------
    // AUDIT EVENTS & TAMPER-EVIDENT LOG
    // ------------------------------------------------------------------------
    if (method === 'GET' && pathname === '/api/audit-events') {
      const objectType = reqUrl.searchParams.get('objectType');
      const objectId = reqUrl.searchParams.get('objectId');
      const limit = parseInt(reqUrl.searchParams.get('limit') || '50', 10);
      const events = auditService.getAuditEvents({ objectType, objectId, limit });
      return json({ success: true, count: events.length, events });
    }

    // ------------------------------------------------------------------------
    // ADMIN RESET & SEED
    // ------------------------------------------------------------------------
    if (method === 'POST' && pathname === '/api/admin/reset-seed') {
      const result = seedDatabase();
      return json({ success: true, ...result });
    }

    return error(`Endpoint not found: ${method} ${pathname}`, 404);
  } catch (err) {
    console.error('API Error:', err);
    return error(err.message || 'Internal Server Error', 500);
  }
}
