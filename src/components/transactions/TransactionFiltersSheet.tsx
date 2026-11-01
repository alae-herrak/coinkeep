import { useState } from 'react';
import type { TransactionType } from '../../db/types';
import type { TransactionFilters } from '../../domain/transactions';
import type { AccountsData, CategoriesData } from '../../hooks/data';
import { addMonths, endOfMonth, startOfMonth, todayISO } from '../../lib/dates';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { DateField, SelectField } from '../ui/Fields';
import { SegmentedControl } from '../ui/SegmentedControl';

type TypeOption = TransactionType | 'all';

interface Props {
  open: boolean;
  onClose: () => void;
  filters: TransactionFilters;
  onApply: (filters: TransactionFilters) => void;
  accounts: AccountsData;
  categories: CategoriesData;
}

export function TransactionFiltersSheet({ open, onClose, filters, onApply, accounts, categories }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Filter transactions">
      {/* Remount on open so the draft starts from the current filters. */}
      {open && <FiltersForm filters={filters} onApply={onApply} accounts={accounts} categories={categories} />}
    </BottomSheet>
  );
}

function FiltersForm({ filters, onApply, accounts, categories }: Omit<Props, 'open' | 'onClose'>) {
  const [draft, setDraft] = useState<TransactionFilters>(filters);
  const set = (patch: Partial<TransactionFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const today = todayISO();
  const ranges = [
    { label: 'This month', from: startOfMonth(today), to: endOfMonth(today) },
    { label: 'Last month', from: startOfMonth(addMonths(today, -1)), to: endOfMonth(addMonths(today, -1)) },
    { label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  ];

  const kindsShown: ('expense' | 'income')[] =
    draft.type === 'income' ? ['income'] : draft.type === 'expense' ? ['expense'] : ['expense', 'income'];

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ ...draft, query: filters.query });
      }}
    >
      <SegmentedControl<TypeOption>
        label="Type"
        value={draft.type ?? 'all'}
        onChange={(v) => {
          const type = v === 'all' ? undefined : v;
          const cat = draft.categoryId !== undefined ? categories.byId.get(draft.categoryId) : undefined;
          // Drop a category filter that can't match the new type.
          set({ type, categoryId: type === 'transfer' || (type && cat && cat.kind !== type) ? undefined : draft.categoryId });
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
        ]}
      />

      {draft.type !== 'transfer' && (
        <SelectField
          label="Category"
          value={draft.categoryId ?? ''}
          onChange={(e) => set({ categoryId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">All categories</option>
          {kindsShown.map((kind) => (
            <optgroup key={kind} label={kind === 'expense' ? 'Expenses' : 'Income'}>
              {categories.all
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? ' (archived)' : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </SelectField>
      )}

      <SelectField
        label="Account"
        value={draft.accountId ?? ''}
        onChange={(e) => set({ accountId: e.target.value ? Number(e.target.value) : undefined })}
      >
        <option value="">All accounts</option>
        {accounts.all.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.archived ? ' (archived)' : ''}
          </option>
        ))}
      </SelectField>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Date range</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {ranges.map((r) => {
            const active = draft.from === r.from && draft.to === r.to;
            return (
              <button
                key={r.label}
                type="button"
                aria-pressed={active}
                onClick={() => set(active ? { from: undefined, to: undefined } : { from: r.from, to: r.to })}
                className={`min-h-10 rounded-full border px-3.5 text-sm font-medium ${
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-surface-2'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="From" value={draft.from ?? ''} max={draft.to} onChange={(e) => set({ from: e.target.value || undefined })} />
          <DateField label="To" value={draft.to ?? ''} min={draft.from} onChange={(e) => set({ to: e.target.value || undefined })} />
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button variant="secondary" block onClick={() => setDraft({})}>
          Reset
        </Button>
        <Button type="submit" block>
          Show results
        </Button>
      </div>
    </form>
  );
}
