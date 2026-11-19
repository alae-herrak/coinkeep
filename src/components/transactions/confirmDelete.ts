import { db } from '../../db/db';
import type { Transaction } from '../../db/types';
import { formatDayLabel } from '../../lib/format';
import { formatMAD } from '../../lib/money';
import { confirm } from '../../store/ui';

interface Names {
  accountName: (id: number) => string | undefined;
  categoryName: (id: number) => string | undefined;
}

/**
 * Asks before deleting a transaction, naming what will go ("20,00 DH · Cafés · Today")
 * and any savings allocations that would go with it (paycheck splits).
 */
export async function confirmDeleteTransaction(t: Transaction, names: Names): Promise<boolean> {
  const what =
    t.type === 'transfer'
      ? `${names.accountName(t.accountId) ?? '?'} → ${names.accountName(t.toAccountId ?? -1) ?? '?'}`
      : (names.categoryName(t.categoryId ?? -1) ?? 'Uncategorised');
  const linked = await db.savingsMovements.where('linkedTransactionId').equals(t.id).count();
  const parts = [`${formatMAD(t.amount)} · ${what} · ${formatDayLabel(t.date)}`];
  if (t.note.trim()) parts.push(`“${t.note.trim()}”`);
  if (linked > 0) parts.push(`Its ${linked === 1 ? 'savings allocation' : `${linked} savings allocations`} will be removed too.`);
  return confirm({
    title: t.type === 'transfer' ? 'Delete this transfer?' : `Delete this ${t.type}?`,
    message: parts.join('\n'),
    confirmLabel: 'Delete',
    destructive: true,
  });
}
