import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { isISODate } from '../../lib/dates';
import { formatDayLabel } from '../../lib/format';

const CHIP =
  'relative inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-medium focus-within:ring-2 focus-within:ring-accent/40';

/**
 * A chip that looks like a pill but is a native date input underneath
 * (transparent and stretched over it), so tapping opens the system picker.
 */
export function DateChip({
  value,
  onChange,
  label,
  icon: Icon,
}: {
  value: string;
  onChange: (date: string) => void;
  label: string;
  icon: LucideIcon;
}) {
  const id = useId();
  return (
    <span className={CHIP}>
      <Icon size={16} aria-hidden className="text-muted" />
      <span aria-hidden>{formatDayLabel(value)}</span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        required
        onChange={(e) => {
          // Clearing the native field gives "" — keep the previous date instead.
          if (isISODate(e.target.value)) onChange(e.target.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

/** Same trick with a native <select> (great on Android: full-screen list). */
export function SelectChip<T extends string | number>({
  value,
  onChange,
  label,
  icon: Icon,
  options,
  prefix,
}: {
  value: T;
  onChange: (value: T) => void;
  label: string;
  icon: LucideIcon;
  options: { value: T; label: string }[];
  prefix?: ReactNode;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  return (
    <span className={CHIP}>
      <Icon size={16} aria-hidden className="text-muted" />
      {prefix && <span className="text-muted">{prefix}</span>}
      <span aria-hidden className="max-w-[9rem] truncate">
        {current?.label ?? '—'}
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
