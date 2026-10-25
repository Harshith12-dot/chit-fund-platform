import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';

export function computeHash(obj) {
  if (!obj) return null;
  const serialized = typeof obj === 'string' ? obj : JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

export function logAuditEvent({
  actorId,
  action,
  objectType,
  objectId,
  beforeState = null,
  afterState = null,
  metadata = {},
  ipAddress = '127.0.0.1',
  db = null
}) {
  const database = db || getDatabase();
  const id = 'aud-' + randomUUID();
  const timestamp = new Date().toISOString();
  const beforeHash = computeHash(beforeState);
  const afterHash = computeHash(afterState) || computeHash({ timestamp, action, objectId });

  const stmt = database.prepare(`
    INSERT INTO audit_events (
      id, actor_id, action, object_type, object_id,
      before_state_hash, after_state_hash, metadata_json, ip_address, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    actorId,
    action,
    objectType,
    objectId,
    beforeHash,
    afterHash,
    JSON.stringify(metadata),
    ipAddress,
    timestamp
  );

  return { id, timestamp, beforeHash, afterHash };
}

export function getAuditEvents({ objectType = null, objectId = null, limit = 50, db = null }) {
  const database = db || getDatabase();
  let query = 'SELECT * FROM audit_events';
  const params = [];

  if (objectType && objectId) {
    query += ' WHERE object_type = ? AND object_id = ?';
    params.push(objectType, objectId);
  } else if (objectType) {
    query += ' WHERE object_type = ?';
    params.push(objectType);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  return database.prepare(query).all(...params);
}
