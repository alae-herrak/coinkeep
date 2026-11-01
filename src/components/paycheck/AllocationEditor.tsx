import type { Allocation, AllocationMode } from '../../db/types';
import { FULL_PERCENT } from '../../domain/allocation';
import type { GoalWithHeld } from '../../hooks/money';
import { formatMAD, parseAmount, toInputString } from '../../lib/money';
import { CategoryIcon } from '../ui/CategoryIcon';

/** One goal's split as typed by the user. */
export interface AllocationRow {
  goalId: number;
  mode: AllocationMode;
  /** A percentage ("12,5") or an amount ("500"), exactly as typed. */
  text: string;
}

/** Percent text → basis points, amount text → centimes (parseAmount's ×100 fits both). null = invalid. */
export function rowValue(row: AllocationRow): number | null {
  if (row.text.trim() === '') return 0;
  const v = parseAmount(row.text);
  if (v === null || v < 0) return null;
  if (row.mode === 'percent' && v > FULL_PERCENT) return null;
  return v;
}

export function rowsFromAllocations(goals: readonly { id: number }[], allocations: readonly Allocation[]): AllocationRow[] {
  return goals.map((g) => {
    const a = allocations.find((x) => x.goalId === g.id);
    if (!a) return { goalId: g.id, mode: 'percent', text: '' };
    return { goalId: g.id, mode: a.mode, text: a.value === 0 ? '' : toInputString(a.value) };
  });
}

export function rowsToAllocations(rows: readonly AllocationRow[]): Allocation[] {
  return rows.map((r) => ({ goalId: r.goalId, mode: r.mode, value: rowValue(r) ?? 0 }));
}

interface AllocationEditorProps {
  goals: readonly GoalWithHeld[];
  rows: readonly AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  /** Resulting amount per goal (paycheck flow); omitted for templates. */
  amountFor?: (goalId: number) => number;
}

/** Per-goal "% or DH" inputs used by the paycheck flow and template editor. */
export function AllocationEditor({ goals, rows, onChange, amountFor }: AllocationEditorProps) {
  // Goals created after the rows were built get a row on first edit.
  const rowFor = (goalId: number): AllocationRow => rows.find((r) => r.goalId === goalId) ?? { goalId, mode: 'percent', text: '' };
  const update = (goalId: number, patch: Partial<AllocationRow>) =>
    onChange(rows.some((r) => r.goalId === goalId) ? rows.map((r) => (r.goalId === goalId ? { ...r, ...patch } : r)) : [...rows, { ...rowFor(goalId), ...patch }]);

  return (
    <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
      {goals.map((g) => {
        const row = rowFor(g.id);
        const invalid = rowValue(row) === null;
        const inputId = `alloc-${g.id}`;
        const amount = amountFor?.(g.id);
        return (
          <li key={g.id} className="border-b border-border p-4 last:border-b-0">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={g.icon} color={g.color} size={36} />
              <label htmlFor={inputId} className="min-w-0 flex-1 truncate font-medium">
                {g.name}
              </label>
              {amount !== undefined && (
                <span className="tabular shrink-0 font-semibold text-accent" aria-live="polite">
                  {formatMAD(amount, { sign: amount > 0 ? 'always' : 'auto' })}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div role="radiogroup" aria-label={`${g.name}: split by`} className="flex shrink-0 rounded-xl bg-surface-2 p-1">
                {(['percent', 'fixed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={row.mode === mode}
                    onClick={() => update(g.id, { mode, text: '' })}
                    className={`min-h-10 min-w-11 rounded-lg px-3 text-sm font-semibold ${row.mode === mode ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}
                  >
                    {mode === 'percent' ? '%' : 'DH'}
                  </button>
                ))}
              </div>
              <div className="relative flex-1">
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={row.text}
                  onChange={(e) => update(g.id, { text: e.target.value })}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${inputId}-err` : undefined}
                  className="tabular block min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 pr-12 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-expense"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium text-muted">
                  {row.mode === 'percent' ? '%' : 'DH'}
                </span>
              </div>
            </div>
            {invalid && (
              <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-sm text-expense">
                {row.mode === 'percent' ? 'Enter a percentage between 0 and 100.' : 'Enter an amount like 500 or 500,50.'}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
