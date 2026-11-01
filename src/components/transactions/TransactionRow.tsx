import { ArrowLeftRight } from 'lucide-react';
import type { Account, Category, Transaction } from '../../db/types';
import { formatMAD } from '../../lib/money';
import { CategoryIcon } from '../ui/CategoryIcon';

interface TransactionRowProps {
  transaction: Transaction;
  category?: Category;
  accounts: Map<number, Account>;
  onSelect: (t: Transaction) => void;
  /** Show the account name in the subtitle (useful when there are several accounts). */
  showAccount?: boolean;
}

export function TransactionRow({ transaction: t, category, accounts, onSelect, showAccount = true }: TransactionRowProps) {
  const from = accounts.get(t.accountId)?.name ?? 'Unknown account';
  const isTransfer = t.type === 'transfer';
  const title = isTransfer ? 'Transfer' : (category?.name ?? 'Uncategorised');
  const subtitleParts = isTransfer
    ? [`${from} → ${t.toAccountId !== null ? (accounts.get(t.toAccountId)?.name ?? 'Unknown account') : '?'}`, t.note]
    : [t.note, showAccount ? from : ''];
  const subtitle = subtitleParts.filter(Boolean).join(' · ');

  // Signs are always shown so meaning never relies on color alone.
  const amountText = isTransfer ? formatMAD(t.amount) : formatMAD(t.type === 'income' ? t.amount : -t.amount, { sign: 'always' });
  const amountClass = t.type === 'income' ? 'text-income' : isTransfer ? 'text-muted' : '';
  const kindLabel = t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : 'Transfer';

  return (
    <button
      type="button"
      onClick={() => onSelect(t)}
      className="flex min-h-16 w-full items-center gap-3 bg-surface px-4 py-2.5 text-left transition hover:bg-surface-2"
      aria-label={`${kindLabel}: ${title}, ${amountText}${subtitle ? `, ${subtitle}` : ''}. Edit`}
    >
      {isTransfer ? (
        <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ArrowLeftRight size={20} />
        </span>
      ) : (
        <CategoryIcon icon={category?.icon ?? 'Ellipsis'} color={category?.color ?? '#64748b'} />
      )}
      <span aria-hidden className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      <span aria-hidden className={`tabular shrink-0 whitespace-nowrap font-semibold ${amountClass}`}>
        {amountText}
      </span>
    </button>
  );
}
