import { getDatabase } from '../db/index.js';

// Haversine formula to compute great-circle distance between two GPS coordinates in kilometers
export function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100; // Round to 2 decimal places
}

// Coarse coordinates mask for privacy compliance (DPDP Act)
export function anonymizeToCoarseCoords(lat, lon) {
  return {
    lat: Math.round(lat * 100) / 100, // ~1.1km grid precision
    lon: Math.round(lon * 100) / 100
  };
}

export function getAllLocalities(db = null) {
  const database = db || getDatabase();
  return database.prepare('SELECT * FROM localities ORDER BY city ASC, name ASC').all();
}

export function getLocalityById(id, db = null) {
  const database = db || getDatabase();
  return database.prepare('SELECT * FROM localities WHERE id = ?').get(id);
}

export function findNearbyGroups({
  latitude = null,
  longitude = null,
  localityId = null,
  radiusKm = 15,
  db = null
}) {
  const database = db || getDatabase();

  let targetLat = latitude;
  let targetLon = longitude;

  if ((targetLat === null || targetLon === null) && localityId) {
    const loc = getLocalityById(localityId, database);
    if (loc) {
      targetLat = loc.latitude;
      targetLon = loc.longitude;
    }
  }

  // Fetch groups with their locality coordinates
  const groups = database.prepare(`
    SELECT g.*, l.name as locality_name, l.city as locality_city, l.pincode,
           l.latitude as group_lat, l.longitude as group_lon,
           u.phone as organizer_phone, p.display_name as organizer_name, p.reputation_score as organizer_reputation
    FROM chit_groups g
    JOIN localities l ON g.locality_id = l.id
    JOIN users u ON g.organizer_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE g.status IN ('REGISTRATION', 'ACTIVE')
  `).all();

  if (targetLat === null || targetLon === null) {
    // If no coordinates provided, return all eligible groups with distance = null
    return groups.map(g => ({
      ...g,
      distance_km: null,
      is_nearby: true
    }));
  }

  // Calculate distance using Haversine formula
  const groupsWithDistance = groups.map(g => {
    const distance = getHaversineDistanceKm(targetLat, targetLon, g.group_lat, g.group_lon);
    return {
      ...g,
      distance_km: distance,
      is_nearby: distance <= radiusKm
    };
  });

  // Filter within radius and sort nearest first
  return groupsWithDistance
    .filter(g => g.is_nearby)
    .sort((a, b) => a.distance_km - b.distance_km);
}
