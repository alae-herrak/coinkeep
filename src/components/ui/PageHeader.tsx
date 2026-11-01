import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Optional element on the right, e.g. an icon button. */
  action?: ReactNode;
  /** Shows a back button linking here (for sub-pages like Settings → Accounts). */
  backTo?: string;
  backLabel?: string;
}

export function PageHeader({ title, subtitle, action, backTo, backLabel = 'Back' }: PageHeaderProps) {
  // The browser tab / task switcher names the current screen.
  useEffect(() => {
    document.title = title === 'Home' ? 'Coinkeep' : `${title} · Coinkeep`;
  }, [title]);

  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-6">
      <div className="flex min-w-0 items-center gap-1">
        {backTo && (
          <Link
            to={backTo}
            aria-label={backLabel}
            title={backLabel}
            className="-ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text"
          >
            <ChevronLeft size={24} aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          <h1 tabIndex={-1} className="truncate text-2xl font-semibold tracking-tight outline-none">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  );
}
