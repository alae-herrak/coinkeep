import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BellRing, ChevronRight, Gauge, HandCoins, PiggyBank, ReceiptText } from 'lucide-react';
import { db } from '../db/db';
import { compareNewestFirst } from '../domain/transactions';
import { billsDueSoon, describeDue } from '../domain/bills';
import { useAccounts, useCategories } from '../hooks/data';
import { categoryBudgets, useBills, useGoals, useMonthSummary, useSafeToSpend } from '../hooks/money';
import { todayISO } from '../lib/dates';
import { formatMonth, formatShortDate } from '../lib/format';
import { formatMAD } from '../lib/money';
import { useUI } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { TransactionRow } from '../components/transactions/TransactionRow';
import { BalanceCarousel } from '../components/home/BalanceCarousel';
import { GoalMiniRow } from '../components/goals/GoalBits';
import { BackupReminder } from '../components/home/BackupReminder';

function SectionHeader({ id, title, to, linkLabel = 'See all' }: { id: string; title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex min-h-11 items-center justify-between px-1">
      <h2 id={id} className="text-sm font-semibold text-muted">
        {title}
      </h2>
      {to && (
        <Link to={to} className="flex min-h-11 items-center gap-0.5 text-sm font-semibold text-accent">
          {linkLabel}
          <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function HomeScreen() {
  const today = todayISO();
  const safe = useSafeToSpend();
  const month = useMonthSummary(today);
  const goals = useGoals();
  const bills = useBills();
  const accounts = useAccounts();
  const categories = useCategories();
  const recent = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(30).toArray());
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openEdit = useUI((s) => s.openEdit);

  if (!safe || !month || !goals || !bills || !accounts || !categories || !recent) {
    return <PageHeader title="Home" subtitle={formatMonth(today)} />;
  }

  const lastFive = [...recent].sort(compareNewestFirst).slice(0, 5);
  const dueSoon = billsDueSoon(bills, today, 7);
  const budgets = categoryBudgets(categories.all, month.spentByCategory).slice(0, 3);
  const topGoals = [...goals.active].sort((a, b) => b.held - a.held).slice(0, 3);

  return (
    <>
      <PageHeader title="Home" subtitle={formatMonth(today)} />

      <div className="flex flex-col gap-6">
        <BalanceCarousel safe={safe} accounts={accounts.active} balances={accounts.balances} />

        <BackupReminder />

        {dueSoon.length > 0 && (
          <Link
            to="/bills"
            className="-mt-2 flex items-center gap-3 rounded-card bg-warn-soft px-4 py-3 text-sm transition hover:brightness-95"
          >
            <BellRing size={20} aria-hidden className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {dueSoon.length === 1 ? `${dueSoon[0]!.bill.name} ${describeDue(dueSoon[0]!.daysUntil)}` : `${dueSoon.length} bills due soon`}
              </span>
              <span className="block truncate text-muted">
                {dueSoon.length === 1
                  ? `${formatMAD(dueSoon[0]!.bill.amount)} · ${formatShortDate(dueSoon[0]!.dueDate)}`
                  : dueSoon
                      .slice(0, 3)
                      .map((d) => `${d.bill.name} · ${formatMAD(d.bill.amount)}`)
                      .join(', ')}
              </span>
            </span>
            <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
          </Link>
        )}

        <section aria-labelledby="month-heading">
          <SectionHeader id="month-heading" title="This month" to="/insights" linkLabel="Insights" />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Income" value={formatMAD(month.income, { decimals: false, sign: month.income > 0 ? 'always' : 'auto' })} className="text-income" />
            <Stat label="Spent" value={formatMAD(-month.spent, { decimals: false })} />
            <Stat label="Saved" value={formatMAD(month.saved, { decimals: false })} className="text-accent" />
          </div>
          <Link
            to="/paycheck"
            className="mt-2 flex min-h-12 items-center gap-3 rounded-card bg-surface px-4 text-sm font-semibold shadow-sm transition hover:bg-surface-2"
          >
            <HandCoins size={20} aria-hidden className="text-income" />
            <span className="flex-1">Log paycheck</span>
            <ChevronRight size={18} aria-hidden className="text-muted" />
          </Link>
        </section>

        <section aria-labelledby="budgets-heading">
          <SectionHeader id="budgets-heading" title="Budgets" to="/budgets" />
          {budgets.length === 0 ? (
            <Link to="/budgets" className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-sm transition hover:bg-surface-2">
              <Gauge size={22} aria-hidden className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Set monthly budgets</span>
                <span className="block text-muted">Get a heads-up before a category runs over.</span>
              </span>
              <ChevronRight size={18} aria-hidden className="text-muted" />
            </Link>
          ) : (
            <ul className="space-y-3 rounded-card bg-surface p-4 shadow-sm">
              {budgets.map(({ category, progress }) => (
                <li key={category.id} className="flex items-center gap-3">
                  <CategoryIcon icon={category.icon} color={category.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{category.name}</span>
                      <span className={`tabular shrink-0 ${progress.status === 'over' ? 'font-semibold text-expense' : 'text-muted'}`}>
                        {progress.status === 'over'
                          ? `${formatMAD(-progress.remaining, { decimals: false })} over`
                          : `${formatMAD(progress.remaining, { decimals: false })} left`}
                      </span>
                    </div>
                    <ProgressBar
                      className="mt-1.5"
                      value={progress.ratio}
                      tone={progress.status}
                      label={`${category.name} budget`}
                      valueText={`${formatMAD(progress.spent)} of ${formatMAD(progress.budget)}${progress.status === 'over' ? ', over budget' : ''}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="goals-heading">
          <SectionHeader id="goals-heading" title="Savings goals" to="/goals" />
          {topGoals.length === 0 ? (
            <Link to="/goals" className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-sm transition hover:bg-surface-2">
              <PiggyBank size={22} aria-hidden className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Start a savings goal</span>
                <span className="block text-muted">Money in goals is kept out of Safe to spend.</span>
              </span>
              <ChevronRight size={18} aria-hidden className="text-muted" />
            </Link>
          ) : (
            <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
              {topGoals.map((g) => (
                <li key={g.id} className="border-b border-border last:border-b-0">
                  <GoalMiniRow goal={g} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent-heading">
          <SectionHeader id="recent-heading" title="Recent transactions" to={lastFive.length ? '/transactions' : undefined} />
          {lastFive.length === 0 ? (
            <div className="rounded-card bg-surface shadow-sm">
              <EmptyState
                icon={ReceiptText}
                title="Nothing logged yet"
                description="Tap + to add your first expense. It only takes a few taps."
                action={<Button onClick={() => openQuickAdd('expense')}>Add expense</Button>}
              />
            </div>
          ) : (
            <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
              {lastFive.map((t) => (
                <li key={t.id} className="border-b border-border last:border-b-0">
                  <TransactionRow
                    transaction={t}
                    category={t.categoryId !== null ? categories.byId.get(t.categoryId) : undefined}
                    accounts={accounts.byId}
                    showAccount={accounts.all.length > 1}
                    onSelect={(tx) => openEdit(tx.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-card bg-surface px-3 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`tabular mt-0.5 truncate text-base font-semibold ${className}`} title={value}>
        {value}
      </p>
    </div>
  );
}
