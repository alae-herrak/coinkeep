import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { IconButton } from './Button';

interface ListRowProps {
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onSelect?: () => void;
  /** Accessible name for the main row button. */
  selectLabel?: string;
  /** When set, shows up/down buttons instead of the chevron. */
  reorder?: { onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean; name: string };
}

/** A tappable list row with optional reorder controls. Put it inside a rounded card list. */
export function ListRow({ leading, title, subtitle, trailing, onSelect, selectLabel, reorder }: ListRowProps) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );

  if (reorder) {
    return (
      <div className="flex min-h-16 items-center gap-3 bg-surface py-2 pl-4 pr-2">
        {body}
        <div className="flex">
          <IconButton label={`Move ${reorder.name} up`} onClick={reorder.onUp} disabled={!reorder.canUp}>
            <ChevronUp size={20} />
          </IconButton>
          <IconButton label={`Move ${reorder.name} down`} onClick={reorder.onDown} disabled={!reorder.canDown}>
            <ChevronDown size={20} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={selectLabel}
      className="flex min-h-16 w-full items-center gap-3 bg-surface px-4 py-2 text-left transition hover:bg-surface-2"
    >
      {body}
      <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" />
    </button>
  );
}

export function CardList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="overflow-hidden rounded-card bg-surface shadow-sm [&>li]:border-b [&>li]:border-border [&>li:last-child]:border-b-0">
      {children}
    </ul>
  );
}
