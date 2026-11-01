import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, Gauge, Settings } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

const MORE_LINKS = [
  { to: '/budgets', label: 'Budgets', icon: Gauge },
  { to: '/bills', label: 'Bills', icon: CalendarClock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function MoreScreen() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
        {MORE_LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to} className="border-b border-border last:border-b-0">
            <Link to={to} className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <Icon aria-hidden size={20} className="text-muted" />
              <span className="flex-1 font-medium">{label}</span>
              <ChevronRight aria-hidden size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
