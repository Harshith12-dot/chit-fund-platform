import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/index.js';
import { logAuditEvent } from './auditService.js';

export function postBalancedTransaction({
  groupId,
  cycleId = null,
  sourceType,
  sourceId,
  description,
  entries, // Array of { accountId, entryType: 'DEBIT' | 'CREDIT', amountMinor, membershipId }
  postedBy
}, db = null) {
  const database = db || getDatabase();

  if (!entries || entries.length < 2) {
    throw new Error('A balanced transaction must contain at least 2 entries (debit and credit).');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    if (entry.amountMinor <= 0) {
      throw new Error(`Invalid entry amount ${entry.amountMinor}. Amounts must be strictly positive minor integers.`);
    }
    if (entry.entryType === 'DEBIT') {
      totalDebit += entry.amountMinor;
    } else if (entry.entryType === 'CREDIT') {
      totalCredit += entry.amountMinor;
    } else {
      throw new Error(`Invalid entry type ${entry.entryType}. Must be DEBIT or CREDIT.`);
    }
  }

  // Strict double-entry invariant: Debits MUST equal Credits
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Ledger balance invariant violated: Total Debits (₹${(totalDebit / 100).toFixed(2)}) ` +
      `does not equal Total Credits (₹${(totalCredit / 100).toFixed(2)}). Variance: ${totalDebit - totalCredit} paise.`
    );
  }

  const transactionId = 'tx-' + randomUUID();
  const postedAt = new Date().toISOString();

  database.prepare(`
    INSERT INTO ledger_transactions (
      id, group_id, cycle_id, source_type, source_id, description,
      total_amount_minor, posted_at, posted_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transactionId,
    groupId,
    cycleId,
    sourceType,
    sourceId,
    description,
    totalDebit,
    postedAt,
    postedBy
  );

  const insertEntry = database.prepare(`
    INSERT INTO ledger_entries (
      id, transaction_id, account_id, entry_type, amount_minor, membership_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateAccount = database.prepare(`
    UPDATE chart_of_accounts
    SET balance_minor = balance_minor + ?
    WHERE id = ?
  `);

  for (const entry of entries) {
    const entryId = 'ent-' + randomUUID();
    insertEntry.run(
      entryId,
      transactionId,
      entry.accountId,
      entry.entryType,
      entry.amountMinor,
      entry.membershipId || null,
      postedAt
    );

    // Update running account balance
    // For Assets and Expenses, Debit is positive (+), Credit is negative (-)
    // For Liabilities, Equity, and Revenue, Credit is positive (+), Debit is negative (-)
    const account = database.prepare('SELECT type FROM chart_of_accounts WHERE id = ?').get(entry.accountId);
    if (account) {
      const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
      let delta = 0;
      if (entry.entryType === 'DEBIT') {
        delta = isDebitNormal ? entry.amountMinor : -entry.amountMinor;
      } else {
        delta = isDebitNormal ? -entry.amountMinor : entry.amountMinor;
      }
      updateAccount.run(delta, entry.accountId);
    }
  }

  logAuditEvent({
    actorId: postedBy,
    action: 'LEDGER_TRANSACTION_POSTED',
    objectType: 'ledger_transactions',
    objectId: transactionId,
    metadata: {
      sourceType,
      sourceId,
      totalAmountMinor: totalDebit,
      entryCount: entries.length
    },
    db: database
  });

  return { transactionId, totalAmountMinor: totalDebit, postedAt };
}

export function getMemberStatement(membershipId, db = null) {
  const database = db || getDatabase();

  const entries = database.prepare(`
    SELECT e.id as entry_id, e.entry_type, e.amount_minor, e.created_at,
           t.id as tx_id, t.source_type, t.description, t.cycle_id,
           a.name as account_name, a.code as account_code
    FROM ledger_entries e
    JOIN ledger_transactions t ON e.transaction_id = t.id
    JOIN chart_of_accounts a ON e.account_id = a.id
    WHERE e.membership_id = ?
    ORDER BY e.created_at DESC
  `).all(membershipId);

  let netPaidMinor = 0;
  for (const e of entries) {
    if (e.source_type === 'CONTRIBUTION_PAYMENT' && e.entry_type === 'CREDIT') {
      netPaidMinor += e.amount_minor;
    }
  }

  return {
    membershipId,
    netPaidMinor,
    statementEntries: entries
  };
}

export function getGroupReconciliation(groupId, db = null) {
  const database = db || getDatabase();

  const transactions = database.prepare(`
    SELECT * FROM ledger_transactions
    WHERE group_id = ?
    ORDER BY posted_at DESC
  `).all(groupId);

  let totalSystemDebit = 0;
  let totalSystemCredit = 0;
  let transactionVariances = 0;

  const auditedTransactions = transactions.map(tx => {
    const entries = database.prepare(`
      SELECT e.*, a.name as account_name, a.code as account_code
      FROM ledger_entries e
      JOIN chart_of_accounts a ON e.account_id = a.id
      WHERE e.transaction_id = ?
    `).all(tx.id);

    let txDebit = 0;
    let txCredit = 0;
    for (const ent of entries) {
      if (ent.entry_type === 'DEBIT') txDebit += ent.amount_minor;
      if (ent.entry_type === 'CREDIT') txCredit += ent.amount_minor;
    }

    const variance = txDebit - txCredit;
    if (variance !== 0) transactionVariances++;

    totalSystemDebit += txDebit;
    totalSystemCredit += txCredit;

    return {
      ...tx,
      entries,
      txDebit,
      txCredit,
      isBalanced: variance === 0
    };
  });

  const chartOfAccounts = database.prepare('SELECT * FROM chart_of_accounts ORDER BY code ASC').all();

  return {
    groupId,
    totalTransactions: transactions.length,
    totalSystemDebit,
    totalSystemCredit,
    isFullyBalanced: totalSystemDebit === totalSystemCredit && transactionVariances === 0,
    systemVariance: totalSystemDebit - totalSystemCredit,
    transactions: auditedTransactions,
    chartOfAccounts
  };
}
