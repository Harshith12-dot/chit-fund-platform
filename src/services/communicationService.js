import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';

export function getGroupMessages(groupId, db = null) {
  const database = db || getDatabase();
  const conv = database.prepare('SELECT id FROM conversations WHERE group_id = ?').get(groupId);
  if (!conv) return [];

  return database.prepare(`
    SELECT m.*, u.phone as sender_phone, p.display_name as sender_name, u.role as sender_role
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(conv.id);
}

export function sendMessage({ groupId, senderUserId, message, isAnnouncement = false }, db = null) {
  const database = db || getDatabase();
  let conv = database.prepare('SELECT id FROM conversations WHERE group_id = ?').get(groupId);

  const now = new Date().toISOString();
  if (!conv) {
    const convId = 'cnv-' + randomUUID();
    database.prepare('INSERT INTO conversations (id, group_id, type, created_at) VALUES (?, ?, ?, ?)')
      .run(convId, groupId, 'GROUP_CHAT', now);
    conv = { id: convId };
  }

  const msgId = 'msg-' + randomUUID();
  database.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, message, is_announcement, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(msgId, conv.id, senderUserId, message, isAnnouncement ? 1 : 0, now);

  return database.prepare(`
    SELECT m.*, u.phone as sender_phone, p.display_name as sender_name, u.role as sender_role
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    JOIN user_profiles p ON u.id = p.user_id
    WHERE m.id = ?
  `).get(msgId);
}

export function createNotification({ userId, title, content, channel = 'IN_APP' }, db = null) {
  const database = db || getDatabase();
  const id = 'notif-' + randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO notifications (id, user_id, title, content, channel, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(id, userId, title, content, channel, now);

  return { id, userId, title, content, channel, is_read: 0, created_at: now };
}

export function getUserNotifications(userId, db = null) {
  const database = db || getDatabase();
  return database.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}
