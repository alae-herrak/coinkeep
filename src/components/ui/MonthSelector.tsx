import { ChevronLeft, ChevronRight } from 'lucide-react';
import { shiftMonth, type MonthKey } from '../../domain/insights';
import { formatMonth } from '../../lib/format';
import { IconButton } from './Button';

interface MonthSelectorProps {
  value: MonthKey;
  onChange: (month: MonthKey) => void;
  /** Latest selectable month (usually the current one). */
  max?: MonthKey;
}

export function MonthSelector({ value, onChange, max }: MonthSelectorProps) {
  const canNext = !max || value < max;
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface p-1 shadow-sm">
      <IconButton label={`Previous month (${formatMonth(shiftMonth(value, -1))})`} onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft size={22} />
      </IconButton>
      <p className="text-base font-semibold" aria-live="polite">
        {formatMonth(value)}
      </p>
      <IconButton label={`Next month (${formatMonth(shiftMonth(value, 1))})`} onClick={() => onChange(shiftMonth(value, 1))} disabled={!canNext}>
        <ChevronRight size={22} />
      </IconButton>
    </div>
  );
}
