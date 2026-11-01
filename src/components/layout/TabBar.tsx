import { NavLink, useLocation } from 'react-router-dom';
import { ChartPie, House, LayoutGrid, PiggyBank, ReceiptText, type LucideIcon } from 'lucide-react';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only match the exact path (Home would otherwise match everything). */
  end?: boolean;
  /** Other path prefixes that should highlight this tab. */
  alsoActiveOn?: string[];
}

const TABS: Tab[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/insights', label: 'Insights', icon: ChartPie },
  { to: '/goals', label: 'Goals', icon: PiggyBank },
  { to: '/more', label: 'More', icon: LayoutGrid, alsoActiveOn: ['/budgets', '/bills', '/settings'] },
];

export function TabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <ul className="mx-auto flex h-tabbar max-w-xl">
        {TABS.map(({ to, label, icon: Icon, end, alsoActiveOn = [] }) => {
          const extraActive = alsoActiveOn.some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    isActive || extraActive ? 'text-accent' : 'text-muted hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                        isActive || extraActive ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <Icon aria-hidden size={20} strokeWidth={isActive || extraActive ? 2.25 : 1.75} />
                    </span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
