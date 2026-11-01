import type { Account, Category, Transaction } from '../db/types';

/**
 * Transactions as CSV, oldest first, for spreadsheets.
 * Columns: date, type, amount, category, account, to_account, note.
 * `amount` is signed (− for expenses, + for income; transfers are positive)
 * and written as a plain number with a dot ("−1250.50" → "-1250.50") so every
 * spreadsheet locale can read it.
 */
export const CSV_HEADER = ['date', 'type', 'amount_mad', 'category', 'account', 'to_account', 'note'] as const;

/** Plain decimal with a dot, from centimes, without floats: 125050 → "1250.50". */
export function centimesToDecimal(centimes: number): string {
  const sign = centimes < 0 ? '-' : '';
  const abs = Math.abs(centimes);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Quotes a cell when needed and defuses spreadsheet formulas: text starting
 * with = + - @ (or tab/CR) gets a leading apostrophe so it can't execute.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  lookups: { accounts: Map<number, Pick<Account, 'name'>>; categories: Map<number, Pick<Category, 'name'>> },
): string {
  const rows = [...transactions].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt - b.createdAt));
  const lines = [CSV_HEADER.join(',')];
  for (const t of rows) {
    const signed = t.type === 'expense' ? -t.amount : t.amount;
    lines.push(
      [
        t.date,
        t.type,
        centimesToDecimal(signed),
        csvCell(t.categoryId !== null ? (lookups.categories.get(t.categoryId)?.name ?? '') : ''),
        csvCell(lookups.accounts.get(t.accountId)?.name ?? ''),
        csvCell(t.toAccountId !== null ? (lookups.accounts.get(t.toAccountId)?.name ?? '') : ''),
        csvCell(t.note),
      ].join(','),
    );
  }
  // Amounts are numbers, never formula-escaped (the minus sign is a sign, not a formula).
  return `${lines.join('\r\n')}\r\n`;
}
