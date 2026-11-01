import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Gauge, OctagonAlert, Plus } from 'lucide-react';
import { db } from '../db/db';
import type { Category } from '../db/types';
import { budgetProgress, type BudgetStatus } from '../domain/budgets';
import { isValidMonth, monthBounds, spendingByCategory, type MonthKey } from '../domain/insights';
import { setCategoryBudget } from '../data/categories';
import { errorMessage } from '../data/errors';
import { useCategories } from '../hooks/data';
import { todayISO } from '../lib/dates';
import { formatMAD } from '../lib/money';
import { toast, toastError } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { MonthSelector } from '../components/ui/MonthSelector';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { AmountField } from '../components/ui/Fields';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState } from '../components/ui/EmptyState';

const STATUS_ICON: Record<BudgetStatus, typeof CheckCircle2> = { ok: CheckCircle2, warning: AlertTriangle, over: OctagonAlert };
const STATUS_TEXT: Record<BudgetStatus, string> = { ok: 'On track', warning: 'Almost there', over: 'Over budget' };
const STATUS_CLASS: Record<BudgetStatus, string> = { ok: 'text-income', warning: 'text-warn', over: 'text-expense' };

export function BudgetsScreen() {
  const [params, setParams] = useSearchParams();
  const currentMonth = todayISO().slice(0, 7);
  const month: MonthKey = isValidMonth(params.get('month')) && params.get('month')! <= currentMonth ? params.get('month')! : currentMonth;
  const categories = useCategories();
  const { from, to } = monthBounds(month);
  const spent = useLiveQuery(async () => spendingByCategory(await db.transactions.where('date').between(from, to, true, true).toArray(), month), [from, to, month]);
  const [editing, setEditing] = useState<Category | null>(null);

  if (!categories || !spent) return <PageHeader title="Budgets" backTo="/more" backLabel="Back to More" />;

  const expense = categories.active('expense');
  const withBudget = expense.filter((c) => c.monthlyBudget !== null);
  const without = expense.filter((c) => c.monthlyBudget === null);
  const totalBudget = withBudget.reduce((s, c) => s + (c.monthlyBudget ?? 0), 0);
  const totalSpent = withBudget.reduce((s, c) => s + (spent.get(c.id) ?? 0), 0);
  const overall = budgetProgress(totalSpent, totalBudget);
  const setMonth = (m: MonthKey) => setParams(m === currentMonth ? {} : { month: m }, { replace: true });

  return (
    <>
      <PageHeader title="Budgets" subtitle="Monthly limits per category" backTo="/more" backLabel="Back to More" />
      <MonthSelector value={month} onChange={setMonth} max={currentMonth} />

      {withBudget.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No budgets yet"
          description="Pick a category below and give it a monthly limit. The bar turns amber at 80% and red when you go over."
        />
      ) : (
        <section aria-label="All budgets" className="mt-4 rounded-card bg-surface p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted">Spent of budgeted</p>
            <StatusTag status={overall.status} />
          </div>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatMAD(totalSpent, { decimals: false })} <span className="text-base font-medium text-muted">of {formatMAD(totalBudget, { decimals: false })}</span>
          </p>
          <ProgressBar className="mt-3" value={overall.ratio} tone={overall.status} label="All budgets" valueText={`${formatMAD(totalSpent)} of ${formatMAD(totalBudget)}`} />
          <p className="mt-2 text-sm text-muted">
            {overall.remaining >= 0 ? `${formatMAD(overall.remaining, { decimals: false })} left this month` : `${formatMAD(-overall.remaining, { decimals: false })} over in total`}
          </p>
        </section>
      )}

      {withBudget.length > 0 && (
        <ul className="mt-4 overflow-hidden rounded-card bg-surface shadow-sm" aria-label="Budgets by category">
          {withBudget
            .map((c) => ({ c, p: budgetProgress(spent.get(c.id) ?? 0, c.monthlyBudget!) }))
            .sort((a, b) => b.p.ratio - a.p.ratio)
            .map(({ c, p }) => (
              <li key={c.id} className="border-b border-border last:border-b-0">
                <button type="button" onClick={() => setEditing(c)} className="block w-full px-4 py-3.5 text-left transition hover:bg-surface-2" aria-label={`${c.name}: ${formatMAD(p.spent)} of ${formatMAD(p.budget)}, ${STATUS_TEXT[p.status]}. Edit budget`}>
                  <span aria-hidden className="flex items-center gap-3">
                    <CategoryIcon icon={c.icon} color={c.color} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tabular shrink-0 text-sm text-muted">
                          {formatMAD(p.spent, { decimals: false })} / {formatMAD(p.budget, { decimals: false })}
                        </span>
                      </span>
                      <ProgressBar className="mt-2" value={p.ratio} tone={p.status} label={`${c.name} budget`} />
                      <span className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                        <StatusTag status={p.status} />
                        <span className="tabular text-muted">
                          {p.remaining >= 0 ? `${formatMAD(p.remaining, { decimals: false })} left` : `${formatMAD(-p.remaining, { decimals: false })} over`}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}

      {without.length > 0 && (
        <section aria-labelledby="nobudget-heading" className="mt-6">
          <h2 id="nobudget-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
            No budget yet
          </h2>
          <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
            {without.map((c) => (
              <li key={c.id} className="border-b border-border last:border-b-0">
                <button type="button" onClick={() => setEditing(c)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-surface-2">
                  <CategoryIcon icon={c.icon} color={c.color} size={36} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="tabular text-sm text-muted">{spent.get(c.id) ? `${formatMAD(spent.get(c.id)!, { decimals: false })} spent` : ''}</span>
                  <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                    <Plus size={16} aria-hidden />
                    Set
                    <span className="sr-only"> budget for {c.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 px-1 text-sm text-muted">
        Budgets repeat every month. Manage categories in <Link to="/settings/categories" className="font-semibold text-accent">Settings</Link>.
      </p>

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `${editing.name} budget` : 'Budget'}>
        {editing && <BudgetForm key={editing.id} category={editing} spentThisMonth={spent.get(editing.id) ?? 0} onDone={() => setEditing(null)} />}
      </BottomSheet>
    </>
  );
}

function StatusTag({ status }: { status: BudgetStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold ${STATUS_CLASS[status]}`}>
      <Icon size={14} aria-hidden />
      {STATUS_TEXT[status]}
    </span>
  );
}

function BudgetForm({ category, spentThisMonth, onDone }: { category: Category; spentThisMonth: number; onDone: () => void }) {
  const [amount, setAmount] = useState<number | null>(category.monthlyBudget);
  const [busy, setBusy] = useState(false);

  const save = async (value: number | null) => {
    setBusy(true);
    try {
      const previous = category.monthlyBudget;
      await setCategoryBudget(category.id, value);
      toast(value === null ? 'Budget removed' : 'Budget saved', {
        label: 'Undo',
        onClick: () => void setCategoryBudget(category.id, previous),
      });
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount) void save(amount);
      }}
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} color={category.color} size={44} />
        <p className="text-sm text-muted">
          Spent this month: <strong className="text-text">{formatMAD(spentThisMonth)}</strong>
        </p>
      </div>
      <AmountField label="Monthly budget" value={amount} onChange={setAmount} autoFocus placeholder="e.g. 2 000" />
      <Button type="submit" size="lg" block disabled={busy || !amount || amount <= 0}>
        Save budget
      </Button>
      {category.monthlyBudget !== null && (
        <Button variant="danger" block disabled={busy} onClick={() => void save(null)}>
          Remove budget
        </Button>
      )}
    </form>
  );
}
