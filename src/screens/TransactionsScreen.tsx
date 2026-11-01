import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReceiptText, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { db } from '../db/db';
import type { Transaction, TransactionType } from '../db/types';
import { compareNewestFirst, countActiveFilters, filterTransactions, groupByDay, type TransactionFilters } from '../domain/transactions';
import { deleteTransaction, restoreTransaction } from '../data/transactions';
import { useAccounts, useCategories } from '../hooks/data';
import { formatDayLabel, formatShortDate } from '../lib/format';
import { isISODate } from '../lib/dates';
import { formatMAD } from '../lib/money';
import { toast, useUI, vibrate } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button, IconButton } from '../components/ui/Button';
import { SwipeToDelete } from '../components/ui/SwipeToDelete';
import { TransactionRow } from '../components/transactions/TransactionRow';
import { TransactionFiltersSheet } from '../components/transactions/TransactionFiltersSheet';

const PAGE_DAYS = 40;
const TYPES: TransactionType[] = ['income', 'expense', 'transfer'];

/** Filters live in the URL (?type=&category=&account=&from=&to=) so other screens can deep-link here. */
function readFilters(params: URLSearchParams): TransactionFilters {
  const num = (k: string) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) ? v : undefined;
  };
  const date = (k: string) => {
    const v = params.get(k);
    return v && isISODate(v) ? v : undefined;
  };
  const type = params.get('type') as TransactionType | null;
  return {
    type: type && TYPES.includes(type) ? type : undefined,
    categoryId: num('category'),
    accountId: num('account'),
    from: date('from'),
    to: date('to'),
  };
}

function writeFilters(f: TransactionFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.type) p.set('type', f.type);
  if (f.categoryId !== undefined) p.set('category', String(f.categoryId));
  if (f.accountId !== undefined) p.set('account', String(f.accountId));
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  return p;
}

export function TransactionsScreen() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleDays, setVisibleDays] = useState(PAGE_DAYS);
  const openEdit = useUI((s) => s.openEdit);
  const openQuickAdd = useUI((s) => s.openQuickAdd);

  const accounts = useAccounts();
  const categories = useCategories();
  const all = useLiveQuery(() => db.transactions.toArray());

  const filters = useMemo(() => ({ ...readFilters(params), query }), [params, query]);
  const activeCount = countActiveFilters(filters);

  const groups = useMemo(() => {
    if (!all || !accounts || !categories) return undefined;
    const filtered = filterTransactions(all, filters, { accounts: accounts.byId, categories: categories.byId });
    return groupByDay(filtered.sort(compareNewestFirst));
  }, [all, accounts, categories, filters]);

  const applyFilters = (f: TransactionFilters) => {
    setParams(writeFilters(f), { replace: true });
    setFiltersOpen(false);
    setVisibleDays(PAGE_DAYS);
  };

  const remove = async (t: Transaction) => {
    const deleted = await deleteTransaction(t.id);
    if (!deleted) return;
    vibrate();
    toast('Transaction deleted', { label: 'Undo', onClick: () => void restoreTransaction(deleted) });
  };

  if (!accounts || !categories || !groups || !all) {
    return <PageHeader title="Transactions" />;
  }

  const chips: { key: string; label: string; clear: Partial<TransactionFilters> }[] = [];
  if (filters.type) chips.push({ key: 'type', label: filters.type[0]!.toUpperCase() + filters.type.slice(1), clear: { type: undefined } });
  if (filters.categoryId !== undefined)
    chips.push({ key: 'cat', label: categories.byId.get(filters.categoryId)?.name ?? 'Category', clear: { categoryId: undefined } });
  if (filters.accountId !== undefined)
    chips.push({ key: 'acc', label: accounts.byId.get(filters.accountId)?.name ?? 'Account', clear: { accountId: undefined } });
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${formatShortDate(filters.from)} – ${formatShortDate(filters.to)}`
        : filters.from
          ? `From ${formatShortDate(filters.from)}`
          : `Until ${formatShortDate(filters.to!)}`;
    chips.push({ key: 'date', label, clear: { from: undefined, to: undefined } });
  }

  const shown = groups.slice(0, visibleDays);
  const hasAny = all.length > 0;

  return (
    <>
      <PageHeader
        title="Transactions"
        action={
          hasAny && (
            <IconButton label={activeCount ? `Filters (${activeCount} active)` : 'Filters'} onClick={() => setFiltersOpen(true)} className="relative">
              <SlidersHorizontal size={20} />
              {activeCount > 0 && (
                <span aria-hidden className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
                  {activeCount}
                </span>
              )}
            </IconButton>
          )
        }
      />

      {!hasAny ? (
        <EmptyState
          icon={ReceiptText}
          title="No transactions yet"
          description="Log what you spend and earn — it takes two taps. Everything shows up here, grouped by day."
          action={<Button onClick={() => openQuickAdd('expense')}>Add your first expense</Button>}
        />
      ) : (
        <>
          <div className="relative">
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <label htmlFor="tx-search" className="sr-only">
              Search transactions
            </label>
            <input
              id="tx-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleDays(PAGE_DAYS);
              }}
              placeholder="Search notes, categories, amounts"
              enterKeyHint="search"
              className="block min-h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-base placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => applyFilters({ ...filters, ...c.clear })}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-2 text-sm font-medium text-accent"
                    aria-label={`Remove filter: ${c.label}`}
                  >
                    {c.label}
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {groups.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching transactions"
              description="Try a different search or loosen the filters."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    applyFilters({});
                  }}
                >
                  Clear search and filters
                </Button>
              }
            />
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {shown.map((g) => (
                <section key={g.date} aria-label={formatDayLabel(g.date)}>
                  <div className="mb-1.5 flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold text-muted">{formatDayLabel(g.date)}</h2>
                    {(g.income > 0 || g.expense > 0) && (
                      <span className={`tabular text-sm font-medium ${g.net > 0 ? 'text-income' : 'text-muted'}`}>
                        <span className="sr-only">Day total </span>
                        {formatMAD(g.net, { sign: 'always' })}
                      </span>
                    )}
                  </div>
                  <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
                    {g.items.map((t) => (
                      <li key={t.id} className="border-b border-border last:border-b-0">
                        <SwipeToDelete onDelete={() => void remove(t)}>
                          <TransactionRow
                            transaction={t}
                            category={t.categoryId !== null ? categories.byId.get(t.categoryId) : undefined}
                            accounts={accounts.byId}
                            showAccount={accounts.all.length > 1}
                            onSelect={(tx) => openEdit(tx.id)}
                          />
                        </SwipeToDelete>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length > visibleDays && (
                <Button variant="secondary" block onClick={() => setVisibleDays((n) => n + PAGE_DAYS)}>
                  Show older transactions
                </Button>
              )}
              <p className="text-center text-xs text-muted">Tip: swipe a transaction left to delete it.</p>
            </div>
          )}
        </>
      )}

      <TransactionFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={applyFilters}
        accounts={accounts}
        categories={categories}
      />
    </>
  );
}
