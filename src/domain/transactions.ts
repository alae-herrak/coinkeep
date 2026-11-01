import type { Account, Category, ISODate, Transaction, TransactionType } from '../db/types';
import { formatMAD, toInputString } from '../lib/money';

export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: number;
  /** Matches either side of a transfer. */
  accountId?: number;
  from?: ISODate;
  to?: ISODate;
  query?: string;
}

export interface Lookups {
  categories: Map<number, Pick<Category, 'name'>>;
  accounts: Map<number, Pick<Account, 'name'>>;
}

/** Lowercase and strip accents so "cafe" matches "Café". */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function matchesQuery(t: Transaction, query: string, lookups: Lookups): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = [
    t.note,
    t.categoryId !== null ? lookups.categories.get(t.categoryId)?.name ?? '' : '',
    lookups.accounts.get(t.accountId)?.name ?? '',
    t.toAccountId !== null ? lookups.accounts.get(t.toAccountId)?.name ?? '' : '',
  ]
    .map(normalizeText)
    .join(' \u0000 ');
  if (haystack.includes(q)) return true;
  // Amount search: "45" matches 45,00; "45,5" or "45.5" matches 45,50.
  const amountQuery = q.replace(/\s/g, '').replace('.', ',');
  if (/^\d+(,\d{0,2})?$/.test(amountQuery)) {
    const plain = toInputString(t.amount);
    const full = formatMAD(t.amount, { suffix: false }).replace(/\s/g, '');
    return plain.startsWith(amountQuery) || full.startsWith(amountQuery);
  }
  return false;
}

export function filterTransactions(txs: readonly Transaction[], f: TransactionFilters, lookups: Lookups): Transaction[] {
  return txs.filter((t) => {
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId !== undefined && t.categoryId !== f.categoryId) return false;
    if (f.accountId !== undefined && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.query && !matchesQuery(t, f.query, lookups)) return false;
    return true;
  });
}

/** Newest first: by date, then by creation time within a day. */
export function compareNewestFirst(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

export interface DayGroup {
  date: ISODate;
  items: Transaction[];
  income: number;
  expense: number;
  /** income − expense; transfers don't change your net worth so they're excluded. */
  net: number;
}

/** Groups transactions (assumed sorted newest first) into days, keeping order. */
export function groupByDay(txs: readonly Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | undefined;
  for (const t of txs) {
    if (!current || current.date !== t.date) {
      current = { date: t.date, items: [], income: 0, expense: 0, net: 0 };
      groups.push(current);
    }
    current.items.push(t);
    if (t.type === 'income') current.income += t.amount;
    if (t.type === 'expense') current.expense += t.amount;
    current.net = current.income - current.expense;
  }
  return groups;
}

/** Signed effect of a transaction on your total money: + income, − expense, 0 for transfers. */
export function signedAmount(t: Pick<Transaction, 'type' | 'amount'>): number {
  if (t.type === 'income') return t.amount;
  if (t.type === 'expense') return -t.amount;
  return 0;
}

export function countActiveFilters(f: TransactionFilters): number {
  return [f.type, f.categoryId, f.accountId, f.from || f.to].filter((v) => v !== undefined && v !== '').length;
}
