import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HandCoins, Plus } from 'lucide-react';
import { useCategories } from '../hooks/data';
import { useDebts, type DebtWithStatus } from '../hooks/money';
import { formatShortDate } from '../lib/format';
import { formatMAD } from '../lib/money';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button, IconButton } from '../components/ui/Button';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { ProgressBar } from '../components/ui/ProgressBar';
import { DebtSheet, PayDebtSheet } from '../components/debts/DebtSheets';

export function DebtsScreen() {
  const debts = useDebts();
  const categories = useCategories();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<DebtWithStatus | null>(null);

  const header = (
    <PageHeader
      title="Debts"
      subtitle="Pay them off when you’re ready"
      backTo="/more"
      backLabel="Back to More"
      action={
        <IconButton label="Add debt" onClick={() => setAdding(true)}>
          <Plus size={22} />
        </IconButton>
      }
    />
  );
  if (!debts || !categories) return header;

  return (
    <>
      {header}

      {debts.open.length === 0 && debts.settled.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No debts"
          description="Log what you owe — instalments, a friend who covered you — and pay it off whenever you want, from any account, fees included."
          action={<Button onClick={() => setAdding(true)}>Add a debt</Button>}
        />
      ) : (
        <>
          {debts.open.length > 0 ? (
            <p className="mb-3 px-1 text-sm text-muted">
              You owe <strong className="tabular text-text">{formatMAD(debts.totalRemaining)}</strong> across {debts.open.length === 1 ? '1 debt' : `${debts.open.length} debts`}.
            </p>
          ) : (
            <p className="mb-3 rounded-card bg-accent-soft px-4 py-3 text-sm font-medium text-accent">All paid off — nothing owed.</p>
          )}

          <ul className="flex flex-col gap-3" aria-label="Debts to pay">
            {debts.open.map((d) => {
              const category = categories.byId.get(d.categoryId);
              return (
                <li key={d.id} className="rounded-card bg-surface shadow-sm">
                  <Link
                    to={`/debts/${d.id}`}
                    className="flex items-center gap-3 rounded-t-card px-4 pb-2 pt-4 transition hover:bg-surface-2"
                    aria-label={`${d.name}: ${formatMAD(d.remaining)} left of ${formatMAD(d.amount)}. Details`}
                  >
                    <CategoryIcon icon={category?.icon ?? 'HandCoins'} color={category?.color ?? '#64748b'} size={40} />
                    <span aria-hidden className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{d.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {d.paid > 0 ? `${formatMAD(d.paid)} paid of ${formatMAD(d.amount)}` : `Since ${formatShortDate(d.date)}`}
                      </span>
                    </span>
                    <span aria-hidden className="tabular shrink-0 font-semibold">
                      {formatMAD(d.remaining)}
                    </span>
                  </Link>
                  <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                    <ProgressBar className="flex-1" value={d.paid / d.amount} label={`${d.name} paid`} valueText={`${formatMAD(d.paid)} of ${formatMAD(d.amount)}`} />
                    <Button onClick={() => setPaying(d)} aria-label={`Pay ${d.name}`}>
                      <HandCoins size={18} aria-hidden />
                      Pay
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {debts.settled.length > 0 && (
            <section aria-labelledby="settled-heading" className="mt-6">
              <h2 id="settled-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
                Paid off
              </h2>
              <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
                {debts.settled.map((d) => {
                  const category = categories.byId.get(d.categoryId);
                  return (
                    <li key={d.id} className="border-b border-border last:border-b-0">
                      <Link to={`/debts/${d.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 opacity-80 transition hover:bg-surface-2">
                        <CategoryIcon icon={category?.icon ?? 'HandCoins'} color={category?.color ?? '#64748b'} size={36} />
                        <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                        <span className="tabular text-sm text-muted">{formatMAD(d.amount)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <DebtSheet open={adding} onClose={() => setAdding(false)} />
      <PayDebtSheet debt={paying} onClose={() => setPaying(null)} />
    </>
  );
}
