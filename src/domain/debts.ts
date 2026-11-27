import type { Debt, DebtPayment, Transaction } from '../db/types';

export interface DebtStatus {
  /** Paid so far (fees not included). */
  paid: number;
  /** Fees paid on top, across all payments. */
  fees: number;
  /** Still owed; never below zero. */
  remaining: number;
  settled: boolean;
}

/**
 * Where each debt stands. Payment amounts come from the linked transactions,
 * so a payment edited later in Transactions is reflected here.
 */
export function debtStatuses(
  debts: readonly Pick<Debt, 'id' | 'amount'>[],
  payments: readonly Pick<DebtPayment, 'debtId' | 'transactionId' | 'feeTransactionId'>[],
  transactions: readonly Pick<Transaction, 'id' | 'amount'>[],
): Map<number, DebtStatus> {
  const txById = new Map(transactions.map((t) => [t.id, t]));
  const paid = new Map<number, number>();
  const fees = new Map<number, number>();
  for (const p of payments) {
    paid.set(p.debtId, (paid.get(p.debtId) ?? 0) + (txById.get(p.transactionId)?.amount ?? 0));
    if (p.feeTransactionId !== null) fees.set(p.debtId, (fees.get(p.debtId) ?? 0) + (txById.get(p.feeTransactionId)?.amount ?? 0));
  }
  const out = new Map<number, DebtStatus>();
  for (const d of debts) {
    const p = paid.get(d.id) ?? 0;
    const remaining = Math.max(0, d.amount - p);
    out.set(d.id, { paid: p, fees: fees.get(d.id) ?? 0, remaining, settled: remaining === 0 });
  }
  return out;
}
