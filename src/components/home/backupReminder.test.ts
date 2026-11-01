import { describe, expect, it } from 'vitest';
import { shouldRemindBackup } from './BackupReminder';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 1);
const base = { now, lastBackupAt: null, installedAt: now - 10 * DAY, snoozedUntil: null, transactionCount: 5 };

describe('shouldRemindBackup', () => {
  it('waits 30 days after install before the first reminder', () => {
    expect(shouldRemindBackup(base)).toBe(false);
    expect(shouldRemindBackup({ ...base, installedAt: now - 30 * DAY })).toBe(true);
  });

  it('counts from the last backup when there is one', () => {
    expect(shouldRemindBackup({ ...base, installedAt: now - 400 * DAY, lastBackupAt: now - 29 * DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, lastBackupAt: now - 31 * DAY })).toBe(true);
  });

  it('stays quiet with no data or while snoozed', () => {
    expect(shouldRemindBackup({ ...base, installedAt: now - 60 * DAY, transactionCount: 0 })).toBe(false);
    expect(shouldRemindBackup({ ...base, installedAt: now - 60 * DAY, snoozedUntil: now + DAY })).toBe(false);
    expect(shouldRemindBackup({ ...base, installedAt: now - 60 * DAY, snoozedUntil: now - 1 })).toBe(true);
  });

  it('reminds when there is no reference date at all', () => {
    expect(shouldRemindBackup({ ...base, installedAt: null })).toBe(true);
  });
});
