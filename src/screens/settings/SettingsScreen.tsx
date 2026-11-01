import { Link } from 'react-router-dom';
import { ChevronRight, DatabaseBackup, HandCoins, Lock, Tags, Wallet, type LucideIcon } from 'lucide-react';
import { setSetting } from '../../db/db';
import type { ThemePreference } from '../../db/types';
import { useSetting } from '../../hooks/data';
import { PageHeader } from '../../components/ui/PageHeader';
import { CardList } from '../../components/ui/ListRow';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

interface SettingsLink {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const MONEY_LINKS: SettingsLink[] = [
  { to: '/settings/accounts', label: 'Accounts', description: 'Cash, bank accounts and cards', icon: Wallet },
  { to: '/settings/categories', label: 'Categories', description: 'Add, edit, reorder or archive', icon: Tags },
  { to: '/settings/paychecks', label: 'Paycheck templates', description: 'Regular income and how it’s split', icon: HandCoins },
];

const THEME_OPTIONS = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
];

export function SettingsScreen() {
  const theme = useSetting('theme') ?? 'system';
  const pinHash = useSetting('pinHash');
  const lastBackupAt = useSetting('lastBackupAt');

  const links: { title: string; items: SettingsLink[] }[] = [
    { title: 'Money', items: MONEY_LINKS },
    {
      title: 'Privacy & data',
      items: [
        { to: '/settings/security', label: 'PIN lock', description: pinHash ? 'On' : 'Off', icon: Lock },
        {
          to: '/settings/data',
          label: 'Backup & data',
          description: lastBackupAt ? `Last backup ${new Date(lastBackupAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Never backed up',
          icon: DatabaseBackup,
        },
      ],
    },
  ];

  return (
    <>
      <PageHeader title="Settings" backTo="/more" backLabel="Back to More" />
      <div className="flex flex-col gap-6">
        {links.map((section) => (
          <section key={section.title} aria-labelledby={`settings-${section.title}`}>
            <h2 id={`settings-${section.title}`} className="mb-2 px-1 text-sm font-semibold text-muted">
              {section.title}
            </h2>
            <CardList>
              {section.items.map(({ to, label, description, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="flex min-h-16 items-center gap-3 bg-surface px-4 py-2 transition hover:bg-surface-2">
                    <Icon size={20} aria-hidden className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{label}</span>
                      <span className="block truncate text-sm text-muted">{description}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="text-muted" />
                  </Link>
                </li>
              ))}
            </CardList>
          </section>
        ))}

        <section aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="mb-2 px-1 text-sm font-semibold text-muted">
            Appearance
          </h2>
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 font-medium">Theme</p>
            <SegmentedControl<ThemePreference> label="Theme" options={THEME_OPTIONS} value={theme} onChange={(v) => void setSetting('theme', v)} />
          </div>
        </section>

        <section aria-labelledby="settings-about">
          <h2 id="settings-about" className="mb-2 px-1 text-sm font-semibold text-muted">
            About
          </h2>
          <div className="rounded-card bg-surface p-4 text-sm shadow-sm">
            <p className="font-semibold">Coinkeep {__APP_VERSION__}</p>
            <p className="mt-1 text-muted">
              A calm, private money tracker in Moroccan dirhams. Everything stays on this device: no account, no cloud, no tracking, and it works
              offline. Because nothing is stored anywhere else, keep regular backups.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
