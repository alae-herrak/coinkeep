import type { Account, Transaction } from '../db/types';

/**
 * Current balance per account: starting balance, plus income, minus expenses,
 * minus transfers out, plus transfers in. Integer centimes throughout.
 */
export function computeAccountBalances(
  accounts: readonly Pick<Account, 'id' | 'startingBalance'>[],
  transactions: readonly Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>[],
): Map<number, number> {
  const balances = new Map<number, number>();
  for (const a of accounts) balances.set(a.id, a.startingBalance);

  const add = (id: number | null, delta: number) => {
    // Transactions pointing at an unknown account (shouldn't happen) are ignored.
    if (id === null || !balances.has(id)) return;
    balances.set(id, (balances.get(id) ?? 0) + delta);
  };

  for (const t of transactions) {
    switch (t.type) {
      case 'income':
        add(t.accountId, t.amount);
        break;
      case 'expense':
        add(t.accountId, -t.amount);
        break;
      case 'transfer':
        add(t.accountId, -t.amount);
        add(t.toAccountId, t.amount);
        break;
    }
  }
  return balances;
}

export function sumBalances(balances: Map<number, number>): number {
  let total = 0;
  for (const v of balances.values()) total += v;
  return total;
}
