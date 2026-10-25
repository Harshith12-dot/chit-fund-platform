import test from 'node:test';
import assert from 'node:assert';
import { resetDatabaseForTest } from '../src/db/index.js';
import { registerUser, loginWithPassword, upgradeToHost, getUserByToken, logoutUser } from '../src/services/authService.js';

test('Authentication, Real Passwords & Combined Host-User Model', async (t) => {
  const db = resetDatabaseForTest();

  let registeredToken = null;
  let registeredUserId = null;

  await t.test('Registers a new real user with hashed password and masked govt documents', () => {
    const result = registerUser({
      phone: '9845001122',
      password: 'SecurePass@123',
      displayName: 'Kavitha Reddy',
      email: 'kavitha@example.com',
      localityId: 'loc-1',
      aadhaarNumber: '123456789012',
      panNumber: 'ABCDE9876Z',
      isHost: false
    }, db);

    assert.ok(result.user.id);
    assert.strictEqual(result.user.phone, '9845001122');
    assert.strictEqual(result.user.is_host, 0);
    assert.strictEqual(result.user.role, 'MEMBER');

    // Profile document masking
    assert.strictEqual(result.profile.aadhaar_number_masked, 'XXXX-XXXX-9012');
    assert.strictEqual(result.profile.pan_number_masked, 'ABCDEXXXXZ');
    assert.ok(result.token);

    registeredToken = result.token;
    registeredUserId = result.user.id;
  });

  await t.test('Prevents duplicate registration with the same phone number', () => {
    assert.throws(() => {
      registerUser({
        phone: '9845001122',
        password: 'AnotherPassword',
        displayName: 'Duplicate User'
      }, db);
    }, /already registered/);
  });

  await t.test('Login with password verifies PBKDF2 cryptographic hash', () => {
    // Incorrect password throws error
    assert.throws(() => {
      loginWithPassword({
        phone: '9845001122',
        password: 'WrongPassword'
      }, db);
    }, /Incorrect password/);

    // Correct password succeeds and issues token
    const loginRes = loginWithPassword({
      phone: '9845001122',
      password: 'SecurePass@123'
    }, db);

    assert.strictEqual(loginRes.user.phone, '9845001122');
    assert.ok(loginRes.token);
    registeredToken = loginRes.token;
  });

  await t.test('Authenticates request with Bearer session token', () => {
    const user = getUserByToken(registeredToken, db);
    assert.ok(user);
    assert.strictEqual(user.id, registeredUserId);
    assert.strictEqual(user.profile.display_name, 'Kavitha Reddy');
  });

  await t.test('Combined Host Model: Any user can upgrade to accredited Chit Host', () => {
    const upgradeRes = upgradeToHost({
      userId: registeredUserId,
      hostLicenseNumber: 'KA/BLR/REG/2026/1029',
      bankGuaranteeRef: 'BG-SBI-772211'
    }, db);

    assert.strictEqual(upgradeRes.user.is_host, 1);
    assert.strictEqual(upgradeRes.user.role, 'ORGANIZER');
    assert.strictEqual(upgradeRes.profile.host_license_number, 'KA/BLR/REG/2026/1029');
    assert.strictEqual(upgradeRes.profile.bank_guarantee_ref, 'BG-SBI-772211');
  });

  await t.test('Logout invalidates session token', () => {
    logoutUser(registeredToken, db);
    const userAfter = getUserByToken(registeredToken, db);
    assert.strictEqual(userAfter, null);
  });
});
