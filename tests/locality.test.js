import test from 'node:test';
import assert from 'node:assert';
import { getHaversineDistanceKm, anonymizeToCoarseCoords, findNearbyGroups } from '../src/services/localityService.js';
import { resetDatabaseForTest } from '../src/db/index.js';

test('Locality & Proximity Discovery Engine', async (t) => {
  await t.test('Haversine distance calculation is accurate', () => {
    // Indiranagar: 12.9784, 77.6408
    // Koramangala: 12.9352, 77.6245
    // Great circle distance is ~5.1 km
    const dist = getHaversineDistanceKm(12.9784, 77.6408, 12.9352, 77.6245);
    assert.ok(dist >= 4.8 && dist <= 5.5, `Distance was ${dist} km, expected ~5.1 km`);
  });

  await t.test('Coarse coordinates anonymization preserves privacy', () => {
    const rawLat = 12.97841234;
    const rawLon = 77.64085678;
    const coarse = anonymizeToCoarseCoords(rawLat, rawLon);

    assert.strictEqual(coarse.lat, 12.98);
    assert.strictEqual(coarse.lon, 77.64);
  });

  await t.test('findNearbyGroups filters and sorts by radius correctly', () => {
    const db = resetDatabaseForTest();
    const now = new Date().toISOString();

    // Locality 1: Indiranagar
    // Locality 2: Whitefield (~14 km away)
    db.prepare(`
      INSERT INTO localities (id, name, parent_id, city, state, latitude, longitude, pincode, created_at)
      VALUES ('loc-ind', 'Indiranagar', NULL, 'Bengaluru', 'Karnataka', 12.9784, 77.6408, '560038', ?),
             ('loc-whi', 'Whitefield', NULL, 'Bengaluru', 'Karnataka', 12.9698, 77.7500, '560066', ?)
    `).run(now, now);

    db.prepare(`
      INSERT INTO users (id, phone, role, status, created_at)
      VALUES ('u-org1', '9000000010', 'ORGANIZER', 'ACTIVE', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO chit_groups (
        id, organizer_id, locality_id, name, total_pool_minor, monthly_contribution_minor,
        total_months, max_members, current_members_count, organizer_commission_rate,
        min_bid_discount_minor, max_bid_discount_minor, constitution_version, status, created_at
      ) VALUES
      ('grp-ind', 'u-org1', 'loc-ind', 'Indiranagar Chit', 50000000, 2500000, 20, 20, 1, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?),
      ('grp-whi', 'u-org1', 'loc-whi', 'Whitefield Chit', 50000000, 2500000, 20, 20, 1, 0.05, 2500000, 15000000, '1.0', 'ACTIVE', ?)
    `).run(now, now);

    // Search from Indiranagar with 5 km radius -> Should only return Indiranagar group
    const nearGroups = findNearbyGroups({
      latitude: 12.9784,
      longitude: 77.6408,
      radiusKm: 5,
      db
    });

    assert.strictEqual(nearGroups.length, 1);
    assert.strictEqual(nearGroups[0].id, 'grp-ind');

    // Search with 20 km radius -> Should return both, with Indiranagar first (nearest)
    const allGroups = findNearbyGroups({
      latitude: 12.9784,
      longitude: 77.6408,
      radiusKm: 20,
      db
    });

    assert.strictEqual(allGroups.length, 2);
    assert.strictEqual(allGroups[0].id, 'grp-ind');
    assert.strictEqual(allGroups[1].id, 'grp-whi');
  });
});
