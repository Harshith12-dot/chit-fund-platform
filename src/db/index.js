import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let instance = null;

export function getDatabase(dbPath = null) {
  if (instance) return instance;

  const targetPath = dbPath || process.env.DB_PATH || join(__dirname, '../../data/chitfund.db');
  const db = new DatabaseSync(targetPath);

  // Enable WAL mode for high concurrency and Foreign Keys for relational integrity
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch (e) {
    // In-memory or fallback might not support WAL
  }
  db.exec('PRAGMA foreign_keys = ON;');

  // Apply schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Initialize Standard Chart of Accounts if empty
  const countAccounts = db.prepare('SELECT COUNT(*) as count FROM chart_of_accounts').get();
  if (countAccounts.count === 0) {
    const insertAccount = db.prepare('INSERT INTO chart_of_accounts (id, code, name, type, balance_minor) VALUES (?, ?, ?, ?, ?)');
    const standardAccounts = [
      ['acc-1001', '1001', 'Chit Pool Bank Account', 'ASSET', 0],
      ['acc-1002', '1002', 'Member Receivables (Contributions Due)', 'ASSET', 0],
      ['acc-2001', '2001', 'Auction Prize Money Payable', 'LIABILITY', 0],
      ['acc-2002', '2002', 'Dividend Equalization Pool', 'LIABILITY', 0],
      ['acc-3001', '3001', 'Members Capital & Float', 'EQUITY', 0],
      ['acc-4001', '4001', 'Organizer Commission Revenue (5%)', 'REVENUE', 0],
      ['acc-4002', '4002', 'Delinquency Penalty Income', 'REVENUE', 0]
    ];
    for (const acc of standardAccounts) {
      insertAccount.run(...acc);
    }
  }

  instance = db;
  return db;
}

export function resetDatabaseForTest() {
  if (instance) {
    try { instance.close(); } catch (_) {}
    instance = null;
  }
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const schemaPath = join(__dirname, 'schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Chart of accounts
  const insertAccount = db.prepare('INSERT INTO chart_of_accounts (id, code, name, type, balance_minor) VALUES (?, ?, ?, ?, ?)');
  const standardAccounts = [
    ['acc-1001', '1001', 'Chit Pool Bank Account', 'ASSET', 0],
    ['acc-1002', '1002', 'Member Receivables (Contributions Due)', 'ASSET', 0],
    ['acc-2001', '2001', 'Auction Prize Money Payable', 'LIABILITY', 0],
    ['acc-2002', '2002', 'Dividend Equalization Pool', 'LIABILITY', 0],
    ['acc-3001', '3001', 'Members Capital & Float', 'EQUITY', 0],
    ['acc-4001', '4001', 'Organizer Commission Revenue (5%)', 'REVENUE', 0],
    ['acc-4002', '4002', 'Delinquency Penalty Income', 'REVENUE', 0]
  ];
  for (const acc of standardAccounts) {
    insertAccount.run(...acc);
  }

  // Seed default test localities for FK integrity
  db.prepare(`
    INSERT INTO localities (id, name, parent_id, city, state, latitude, longitude, pincode, created_at)
    VALUES ('loc-1', 'Indiranagar', NULL, 'Bengaluru', 'Karnataka', 12.9784, 77.6408, '560038', '2026-10-25T00:00:00.000Z'),
           ('loc-2', 'Koramangala', NULL, 'Bengaluru', 'Karnataka', 12.9352, 77.6245, '560034', '2026-10-25T00:00:00.000Z')
  `).run();

  instance = db;
  return db;
}
