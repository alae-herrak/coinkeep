import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HandCoins, Pencil, Trash2 } from 'lucide-react';
import type { DebtPayment } from '../db/types';
import { deleteDebt, restoreDebt } from '../data/debts';
import { useAccounts } from '../hooks/data';
import { useDebts } from '../hooks/money';
import { formatDayLabel, formatShortDate } from '../lib/format';
import { formatMAD } from '../lib/money';
import { confirm, toast } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SwipeToDelete } from '../components/ui/SwipeToDelete';
import { DebtSheet, PayDebtSheet, removePaymentWithUndo } from '../components/debts/DebtSheets';

export function DebtDetailScreen() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const debts = useDebts();
  const accounts = useAccounts();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);

  if (!debts || !accounts) return <PageHeader title="Debt" backTo="/debts" />;
  const debt = debts.byId.get(id);
  if (!debt) {
    return (
      <>
        <PageHeader title="Debt" backTo="/debts" backLabel="Back to debts" />
        <EmptyState icon={HandCoins} title="Debt not found" description="It may have been deleted." action={<Button onClick={() => navigate('/debts')}>See all debts</Button>} />
      </>
    );
  }

  const tx = debts.transactionsById;
  const payments = debts.payments
    .filter((p) => p.debtId === id && tx.has(p.transactionId))
    .sort((a, b) => {
      const da = tx.get(a.transactionId)!.date;
      const db = tx.get(b.transactionId)!.date;
      return da !== db ? (da < db ? 1 : -1) : b.id - a.id;
    });

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${debt.name}”?`,
      message: debt.paid > 0 ? 'Payments you made stay in your transactions.' : 'It will be removed from your backlog.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const deleted = await deleteDebt(debt.id);
    navigate('/debts');
    if (deleted) toast('Debt deleted', { label: 'Undo', onClick: () => void restoreDebt(deleted) });
  };

  const onRemovePayment = async (p: DebtPayment): Promise<boolean> => {
    const t = tx.get(p.transactionId)!;
    const fee = p.feeTransactionId !== null ? tx.get(p.feeTransactionId) : undefined;
    const ok = await confirm({
      title: 'Remove this payment?',
      message: `${formatMAD(t.amount)}${fee ? ` + ${formatMAD(fee.amount)} fee` : ''} · ${formatDayLabel(t.date)}\nThe money goes back to ${accounts.byId.get(t.accountId)?.name ?? 'the account'} and is owed again.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return false;
    await removePaymentWithUndo(p.id);
    return true;
  };

  return (
    <>
      <PageHeader
        title={debt.name}
        backTo="/debts"
        backLabel="Back to debts"
        action={
          <IconButton label="Edit debt" onClick={() => setEditing(true)}>
            <Pencil size={20} />
          </IconButton>
        }
      />

      <section aria-label="Balance" className="rounded-card bg-surface p-5 shadow-sm">
        <p className="text-sm text-muted">{debt.settled ? 'Paid off' : 'Still owed'}</p>
        <p className={`tabular text-3xl font-semibold tracking-tight ${debt.settled ? 'text-accent' : ''}`}>{formatMAD(debt.settled ? debt.amount : debt.remaining)}</p>
        <p className="tabular text-sm text-muted">
          {formatMAD(debt.paid)} paid of {formatMAD(debt.amount)} · since {formatShortDate(debt.date)}
        </p>
        <ProgressBar className="mt-4" value={debt.paid / debt.amount} label={`${debt.name} paid`} valueText={`${Math.round((debt.paid / debt.amount) * 100)}%`} />
        {debt.fees > 0 && <p className="mt-2 text-xs text-muted">Plus {formatMAD(debt.fees)} in fees.</p>}
        {debt.note && <p className="mt-3 text-sm">{debt.note}</p>}
        {!debt.settled && (
          <Button className="mt-4" block onClick={() => setPaying(true)}>
            <HandCoins size={18} aria-hidden />
            Pay
          </Button>
        )}
      </section>

      <section aria-labelledby="payments-heading" className="mt-6">
        <h2 id="payments-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
          Payments
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-card bg-surface p-5 text-center text-sm text-muted shadow-sm">No payments yet. Pay it whenever you’re ready.</p>
        ) : (
          <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
            {payments.map((p) => {
              const t = tx.get(p.transactionId)!;
              const fee = p.feeTransactionId !== null ? tx.get(p.feeTransactionId) : undefined;
              return (
                <li key={p.id} className="border-b border-border last:border-b-0">
                  <SwipeToDelete onDelete={() => onRemovePayment(p)}>
                    <div className="flex min-h-14 items-center gap-3 bg-surface px-4 py-2.5">
                      <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <HandCoins size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">From {accounts.byId.get(t.accountId)?.name ?? 'unknown account'}</span>
                        <span className="block text-xs text-muted">
                          {formatDayLabel(t.date)}
                          {fee ? ` · fee ${formatMAD(fee.amount)}` : ''}
                        </span>
                      </span>
                      <span className="tabular shrink-0 font-semibold">{formatMAD(t.amount)}</span>
                      <IconButton label={`Remove ${formatMAD(t.amount)} payment from ${formatDayLabel(t.date)}`} onClick={() => void onRemovePayment(p)} className="-mr-2 h-10 w-10">
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </SwipeToDelete>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6">
        <Button variant="danger" block onClick={() => void onDelete()}>
          <Trash2 size={18} aria-hidden />
          Delete debt
        </Button>
      </div>

      <DebtSheet open={editing} onClose={() => setEditing(false)} debt={debt} />
      <PayDebtSheet debt={paying ? debt : null} onClose={() => setPaying(false)} />
    </>
  );
}
