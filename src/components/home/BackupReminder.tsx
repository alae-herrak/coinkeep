import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DatabaseBackup } from 'lucide-react';
import { db, setSetting } from '../../db/db';

const DAY = 86_400_000;
export const BACKUP_REMINDER_DAYS = 30;
const SNOOZE_DAYS = 7;

/**
 * Should the "back up your data" reminder show? Only once there's something
 * worth saving, 30+ days after the last backup (or after install if never),
 * and not while snoozed.
 */
export function shouldRemindBackup(input: {
  now: number;
  lastBackupAt: number | null;
  installedAt: number | null;
  snoozedUntil: number | null;
  transactionCount: number;
}): boolean {
  if (input.transactionCount === 0) return false;
  if (input.snoozedUntil !== null && input.snoozedUntil > input.now) return false;
  const since = input.lastBackupAt ?? input.installedAt;
  // Without any reference date (older installs), remind right away: there's never been a backup.
  if (since === null) return true;
  return input.now - since >= BACKUP_REMINDER_DAYS * DAY;
}

export function BackupReminder() {
  const state = useLiveQuery(async () => {
    const [last, installed, snoozed, transactionCount] = await Promise.all([
      db.settings.get('lastBackupAt'),
      db.settings.get('installedAt'),
      db.settings.get('backupReminderSnoozedUntil'),
      db.transactions.count(),
    ]);
    return {
      lastBackupAt: (last?.value as number | null) ?? null,
      installedAt: (installed?.value as number | null) ?? null,
      snoozedUntil: (snoozed?.value as number | null) ?? null,
      transactionCount,
    };
  });

  if (!state || !shouldRemindBackup({ ...state, now: Date.now() })) return null;

  return (
    <section aria-label="Backup reminder" className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-sm ring-1 ring-warn/40">
      <DatabaseBackup size={22} aria-hidden className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{state.lastBackupAt ? 'Time for a fresh backup' : 'Back up your data'}</p>
        <p className="mt-0.5 text-muted">
          {state.lastBackupAt ? `It’s been over ${BACKUP_REMINDER_DAYS} days.` : 'You haven’t saved a backup yet.'} Coinkeep lives only on this phone — a backup
          file is your safety net.
        </p>
        <div className="mt-2 flex gap-1">
          <Link to="/settings/data" className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-accent hover:bg-accent-soft">
            Back up now
          </Link>
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 font-medium text-muted hover:bg-surface-2"
            onClick={() => void setSetting('backupReminderSnoozedUntil', Date.now() + SNOOZE_DAYS * DAY)}
          >
            Later
          </button>
        </div>
      </div>
    </section>
  );
}
