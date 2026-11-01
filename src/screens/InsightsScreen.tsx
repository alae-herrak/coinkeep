import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartPie, ChevronRight, Equal, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { db } from '../db/db';
import type { Category } from '../db/types';
import {
  compareMonths,
  isValidMonth,
  monthBounds,
  monthsEndingAt,
  savingsRate,
  shiftMonth,
  spendingByCategory,
  topSlices,
  totalsByMonth,
  type CategoryChange,
  type MonthKey,
} from '../domain/insights';
import { useCategories } from '../hooks/data';
import { categoryChartColor, useChartTheme } from '../lib/chartColors';
import { todayISO } from '../lib/dates';
import { formatMonth } from '../lib/format';
import { formatMAD, formatMADCompact } from '../lib/money';
import { useUI } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { MonthSelector } from '../components/ui/MonthSelector';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

const MONTHS_IN_BAR_CHART = 6;

function shortMonth(month: MonthKey) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-GB', { month: 'short' });
}

function percent(ratio: number) {
  return `${Math.round(ratio * 100)}%`;
}

export function InsightsScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const { dark, colors } = useChartTheme();
  const currentMonth = todayISO().slice(0, 7);
  const requested = params.get('month');
  const month: MonthKey = isValidMonth(requested) && requested <= currentMonth ? requested : currentMonth;
  const setMonth = (m: MonthKey) => setParams(m === currentMonth ? {} : { month: m }, { replace: true });

  const categories = useCategories();
  const firstMonth = shiftMonth(month, -(MONTHS_IN_BAR_CHART - 1));
  const transactions = useLiveQuery(
    () => db.transactions.where('date').between(`${firstMonth}-01`, monthBounds(month).to, true, true).toArray(),
    [firstMonth, month],
  );
  const hasAnyTransaction = useLiveQuery(async () => (await db.transactions.count()) > 0);

  if (!categories || !transactions || hasAnyTransaction === undefined) return <PageHeader title="Insights" />;

  if (!hasAnyTransaction) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyState
          icon={ChartPie}
          title="Nothing to chart yet"
          description="Log a few expenses and your paycheck, and you’ll see where your money goes month by month."
          action={<Button onClick={() => openQuickAdd('expense')}>Add an expense</Button>}
        />
      </>
    );
  }

  const months = monthsEndingAt(month, MONTHS_IN_BAR_CHART);
  const totals = totalsByMonth(transactions, months);
  const thisMonth = totals.at(-1)!;
  const previousMonth = totals.at(-2)!;
  const spending = spendingByCategory(transactions, month);
  const previousSpending = spendingByCategory(transactions, shiftMonth(month, -1));
  const slices = topSlices(spending, 6);
  const rate = savingsRate(thisMonth.income, thisMonth.expense);
  const changes = compareMonths(spending, previousSpending);
  const { from, to } = monthBounds(month);

  const openCategory = (categoryId: number | null) => {
    const q = new URLSearchParams({ type: 'expense', from, to });
    if (categoryId !== null) q.set('category', String(categoryId));
    navigate(`/transactions?${q.toString()}`);
  };

  const sliceColor = (categoryId: number | null) =>
    categoryId === null ? colors.rest : categoryChartColor(categories.byId.get(categoryId)?.color ?? '#64748b', dark);
  const sliceName = (categoryId: number | null) => (categoryId === null ? 'Everything else' : (categories.byId.get(categoryId)?.name ?? 'Unknown'));

  return (
    <>
      <PageHeader title="Insights" />
      <MonthSelector value={month} onChange={setMonth} max={currentMonth} />

      {/* Month summary */}
      <section aria-label={`Summary for ${formatMonth(month)}`} className="mt-4 grid grid-cols-2 gap-2">
        <Tile label="Income" value={formatMAD(thisMonth.income, { decimals: false, sign: thisMonth.income ? 'always' : 'auto' })} valueClass="text-income" />
        <Tile label="Spent" value={formatMAD(-thisMonth.expense, { decimals: false })} />
        <Tile
          label="Left over"
          value={formatMAD(thisMonth.income - thisMonth.expense, { decimals: false, sign: 'always' })}
          valueClass={thisMonth.income - thisMonth.expense < 0 ? 'text-expense' : ''}
        />
        <Tile
          label="Savings rate"
          value={rate === null ? '—' : percent(rate)}
          hint={rate === null ? 'No income logged' : rate >= 0 ? 'of income not spent' : 'spent more than earned'}
          valueClass={rate !== null && rate < 0 ? 'text-expense' : 'text-accent'}
        />
      </section>

      {/* Spending by category */}
      <section aria-labelledby="donut-heading" className="mt-6 rounded-card bg-surface p-4 shadow-sm">
        <h2 id="donut-heading" className="font-semibold">
          Where your money went
        </h2>
        {slices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No expenses in {formatMonth(month)}.</p>
        ) : (
          <>
            <div
              className="relative mx-auto mt-2 h-56 max-w-xs"
              role="img"
              aria-label={`Donut chart of spending by category: ${slices.map((s) => `${sliceName(s.categoryId)} ${percent(s.share)}`).join(', ')}. Details in the list below.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                {/* No tooltip: a tap opens the transactions, and the list below shows every value. It is also the
                    keyboard/screen-reader equivalent, so the chart itself stays out of the tab order. */}
                <PieChart accessibilityLayer={false}>
                  <Pie
                    data={slices.map((s) => ({ ...s, name: sliceName(s.categoryId) }))}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke={colors.surface}
                    strokeWidth={2}
                    isAnimationActive
                    animationDuration={600}
                    onClick={(_, index) => openCategory(slices[index]?.categoryId ?? null)}
                    className="cursor-pointer"
                  >
                    {slices.map((s) => (
                      <Cell key={s.categoryId ?? 'rest'} fill={sliceColor(s.categoryId)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted">Spent</span>
                <span className="text-xl font-semibold">{formatMAD(thisMonth.expense, { decimals: false })}</span>
              </div>
            </div>

            {/* Legend + table view: every value readable without the chart. Tap to see the transactions. */}
            <ul className="mt-4 divide-y divide-border">
              {slices.map((s) => {
                return (
                  <li key={s.categoryId ?? 'rest'}>
                    <button
                      type="button"
                      onClick={() => openCategory(s.categoryId)}
                      className="flex min-h-12 w-full items-center gap-3 py-2 text-left transition hover:bg-surface-2"
                    >
                      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: sliceColor(s.categoryId) }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{sliceName(s.categoryId)}</span>
                      <span className="tabular text-sm text-muted">{percent(s.share)}</span>
                      <span className="tabular min-w-[4.5rem] text-right text-sm font-semibold">{formatMAD(s.amount, { decimals: false })}</span>
                      <ChevronRight size={16} aria-hidden className="text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Income vs expenses, last 6 months */}
      <section aria-labelledby="bars-heading" className="mt-6 rounded-card bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bars-heading" className="font-semibold">
            Income vs. expenses
          </h2>
          <div className="flex gap-3 text-xs text-muted" aria-hidden>
            <LegendKey color={colors.income} label="Income" />
            <LegendKey color={colors.expense} label="Expenses" />
          </div>
        </div>
        <p className="mt-0.5 text-xs text-muted">Last {MONTHS_IN_BAR_CHART} months · tap a month to open it</p>
        <div className="mt-3 h-52" role="img" aria-label="Bar chart of income and expenses for the last 6 months. Values are in the table below.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer={false}
              data={totals.map((t) => ({ ...t, label: shortMonth(t.month) }))}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              barGap={2}
              barCategoryGap="22%"
              onClick={(state) => {
                const i = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : Number(state?.activeTooltipIndex);
                const m = Number.isInteger(i) ? totals[i]?.month : undefined;
                if (m) setMonth(m);
              }}
            >
              <CartesianGrid vertical={false} stroke={colors.grid} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: colors.grid }} tick={{ fill: colors.axis, fontSize: 12 }} />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fill: colors.axis, fontSize: 12 }}
                tickFormatter={(v: number) => formatMADCompact(v, { suffix: false })}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: colors.grid, opacity: 0.5 }}
                content={({ active, payload }) => {
                  const p = payload?.[0];
                  if (!active || !p) return null;
                  const t = p.payload as (typeof totals)[number];
                  return (
                    <ChartTip
                      title={formatMonth(t.month)}
                      rows={[
                        { label: 'Income', value: formatMAD(t.income), color: colors.income },
                        { label: 'Expenses', value: formatMAD(t.expense), color: colors.expense },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="income" name="Income" fill={colors.income} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={600}>
                {totals.map((t) => (
                  <Cell key={t.month} fillOpacity={t.month === month ? 1 : 0.45} />
                ))}
              </Bar>
              <Bar dataKey="expense" name="Expenses" fill={colors.expense} radius={[4, 4, 0, 0]} maxBarSize={20} animationDuration={600}>
                {totals.map((t) => (
                  <Cell key={t.month} fillOpacity={t.month === month ? 1 : 0.45} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-accent">Show as table</summary>
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-1.5 font-medium">
                  Month
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Income
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Expenses
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.month} className={`border-t border-border ${t.month === month ? 'font-semibold' : ''}`}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {formatMonth(t.month)}
                  </th>
                  <td className="py-1.5 text-right">{formatMAD(t.income, { decimals: false })}</td>
                  <td className="py-1.5 text-right">{formatMAD(t.expense, { decimals: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      {/* Plain-language comparison */}
      <section aria-labelledby="compare-heading" className="mt-6 rounded-card bg-surface p-4 shadow-sm">
        <h2 id="compare-heading" className="font-semibold">
          Compared with {formatMonth(shiftMonth(month, -1)).split(' ')[0]}
        </h2>
        <Comparison
          changes={changes}
          categories={categories.byId}
          previousLabel={formatMonth(shiftMonth(month, -1)).split(' ')[0]!}
          totalNow={thisMonth.expense}
          totalBefore={previousMonth.expense}
        />
      </section>
    </>
  );
}

function Tile({ label, value, hint, valueClass = '' }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="rounded-card bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-semibold ${valueClass}`} title={value}>
        {value}
      </p>
      {hint && <p className="truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ChartTip({ title, rows }: { title: string; rows: { label: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="tabular mt-0.5 flex items-center gap-2 text-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
          {r.label}
          <span className="ml-auto pl-3 font-medium text-text">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function Comparison({
  changes,
  categories,
  previousLabel,
  totalNow,
  totalBefore,
}: {
  changes: CategoryChange[];
  categories: Map<number, Category>;
  previousLabel: string;
  totalNow: number;
  totalBefore: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (totalNow === 0 && totalBefore === 0) {
    return <p className="mt-2 text-sm text-muted">No spending in either month yet.</p>;
  }
  const overall = totalNow - totalBefore;
  const visible = showAll ? changes : changes.slice(0, 5);
  const amount = (v: number) => formatMAD(Math.abs(v), { decimals: false });

  return (
    <>
      <p className="mt-2 text-sm">
        {overall === 0
          ? `You spent the same as in ${previousLabel}.`
          : `Overall you spent ${amount(overall)} ${overall > 0 ? 'more' : 'less'} than in ${previousLabel}${totalBefore > 0 ? ` (${overall > 0 ? '+' : '−'}${Math.round(Math.abs(overall / totalBefore) * 100)}%)` : ''}.`}
      </p>
      <ul className="mt-3 space-y-2.5">
        {visible.map((c) => {
          const cat = categories.get(c.categoryId);
          const name = cat?.name ?? 'A deleted category';
          const pct = c.ratio !== null ? ` (${c.ratio > 0 ? '+' : '−'}${Math.round(Math.abs(c.ratio) * 100)}%)` : '';
          const { Icon, text } = (() => {
            switch (c.kind) {
              case 'new':
                return { Icon: Sparkles, text: `${amount(c.current)} on ${name} — nothing in ${previousLabel}.` };
              case 'stopped':
                return { Icon: Minus, text: `Nothing on ${name} this month (${amount(c.previous)} in ${previousLabel}).` };
              case 'up':
                return { Icon: TrendingUp, text: `${amount(c.diff)} more on ${name}${pct}.` };
              case 'down':
                return { Icon: TrendingDown, text: `${amount(c.diff)} less on ${name}${pct}.` };
              default:
                return { Icon: Equal, text: `Same as ${previousLabel} on ${name}: ${amount(c.current)}.` };
            }
          })();
          return (
            <li key={c.categoryId} className="flex items-start gap-2.5 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${c.diff > 0 ? 'bg-expense-soft text-expense' : c.diff < 0 ? 'bg-income-soft text-income' : 'bg-surface-2 text-muted'}`}
              >
                <Icon size={14} />
              </span>
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
      {changes.length > 5 && (
        <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-accent" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${changes.length} categories`}
        </button>
      )}
    </>
  );
}
