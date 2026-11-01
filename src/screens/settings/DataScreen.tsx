import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, HardDrive, Share2, Trash2, Upload } from 'lucide-react';
import { db, setSetting } from '../../db/db';
import { backupFileName, createBackup, eraseAllData, restoreBackup, summarizeBackup, validateBackup, type Backup } from '../../data/backup';
import { transactionsToCsv } from '../../data/csv';
import { errorMessage } from '../../data/errors';
import { useSetting } from '../../hooks/data';
import { canShareFiles, downloadText, readFileText, shareText } from '../../lib/files';
import { formatShortDate } from '../../lib/format';
import { formatBytes, isStoragePersisted, requestPersistentStorage, storageApiAvailable, storageEstimate } from '../../lib/storage';
import { confirm, toast, toastError } from '../../store/ui';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';

const JSON_MIME = 'application/json';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DataScreen() {
  const navigate = useNavigate();
  const lastBackupAt = useSetting('lastBackupAt');
  const counts = useLiveQuery(async () => ({ transactions: await db.transactions.count(), accounts: await db.accounts.count() }));
  const [pending, setPending] = useState<Backup | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const shareable = canShareFiles();

  const exportBackup = async (via: 'download' | 'share') => {
    setBusy(true);
    try {
      const backup = await createBackup();
      const text = JSON.stringify(backup, null, 1);
      const name = backupFileName();
      if (via === 'share') {
        if (!(await shareText(name, text, JSON_MIME, 'Coinkeep backup'))) return;
      } else {
        downloadText(name, text, JSON_MIME);
      }
      await setSetting('lastBackupAt', Date.now());
      toast(via === 'share' ? 'Backup shared' : `Backup saved as ${name}`);
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    const [transactions, accounts, categories] = await Promise.all([db.transactions.toArray(), db.accounts.toArray(), db.categories.toArray()]);
    if (transactions.length === 0) {
      toastError('There are no transactions to export yet.');
      return;
    }
    const csv = transactionsToCsv(transactions, {
      accounts: new Map(accounts.map((a) => [a.id, a])),
      categories: new Map(categories.map((c) => [c.id, c])),
    });
    // BOM so Excel opens the UTF-8 file with accents intact.
    downloadText(`coinkeep-transactions-${todayStamp()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
    toast(`Exported ${transactions.length} transactions`);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setErrors(null);
    const result = validateBackup(await readFileText(file));
    if (fileInput.current) fileInput.current.value = '';
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setPending(result.backup);
  };

  const doRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const previous = await createBackup();
      await restoreBackup(pending);
      setPending(null);
      navigate('/');
      toast('Backup restored', { label: 'Undo', onClick: () => void restoreBackup(previous) });
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    const ok = await confirm({
      title: 'Erase all data on this phone?',
      message: 'All accounts, transactions, goals, budgets and bills will be deleted, and you’ll start over. Back up first if you might need them.',
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!ok) return;
    const previous = await createBackup();
    // Go Home first, so finishing onboarding (or Undo) doesn't land back on this screen.
    navigate('/', { replace: true });
    await eraseAllData();
    // Onboarding takes over the screen; the toast's Undo still works there.
    toast('All data erased', { label: 'Undo', onClick: () => void restoreBackup(previous) });
  };

  const backupAge = lastBackupAt ? Math.floor((Date.now() - lastBackupAt) / 86_400_000) : null;

  return (
    <>
      <PageHeader title="Backup & data" backTo="/settings" backLabel="Back to settings" />

      <div className="flex flex-col gap-4">
        {/* Backup */}
        <section aria-labelledby="backup-heading" className="rounded-card bg-surface p-5 shadow-sm">
          <h2 id="backup-heading" className="font-semibold">
            Back up your data
          </h2>
          <p className="mt-1 text-sm text-muted">
            Coinkeep keeps everything on this phone only. If you lose the phone, clear the browser’s data or uninstall the app, it’s gone — a backup
            file is the only copy. Save it somewhere safe, like Google Drive or your email.
          </p>
          <p className={`mt-3 flex items-center gap-2 text-sm font-medium ${backupAge === null || backupAge > 30 ? 'text-warn' : 'text-income'}`}>
            {backupAge === null || backupAge > 30 ? <AlertTriangle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
            {lastBackupAt ? `Last backup: ${formatShortDate(new Date(lastBackupAt).toISOString().slice(0, 10))}` : 'You haven’t made a backup yet'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {shareable && (
              <Button block disabled={busy} onClick={() => void exportBackup('share')}>
                <Share2 size={18} aria-hidden />
                Save to Drive, email…
              </Button>
            )}
            <Button block variant={shareable ? 'secondary' : 'primary'} disabled={busy} onClick={() => void exportBackup('download')}>
              <Download size={18} aria-hidden />
              Download backup file
            </Button>
          </div>
        </section>

        {/* Restore */}
        <section aria-labelledby="restore-heading" className="rounded-card bg-surface p-5 shadow-sm">
          <h2 id="restore-heading" className="font-semibold">
            Restore from a backup
          </h2>
          <p className="mt-1 text-sm text-muted">Replaces everything on this phone with the backup’s contents. You’ll see what’s inside before anything changes.</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            // Hidden: the "Choose backup file" button below opens it, so there is one control, not two.
            hidden
            id="restore-file"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          <Button className="mt-4" variant="secondary" block onClick={() => fileInput.current?.click()}>
            <Upload size={18} aria-hidden />
            Choose backup file
          </Button>
          {errors && (
            <div role="alert" className="mt-3 rounded-xl bg-expense-soft p-3 text-sm">
              <p className="font-semibold text-expense">This file can’t be restored</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p className="mt-1 text-muted">Nothing was changed.</p>
            </div>
          )}
        </section>

        {/* CSV */}
        <section aria-labelledby="csv-heading" className="rounded-card bg-surface p-5 shadow-sm">
          <h2 id="csv-heading" className="font-semibold">
            Export to a spreadsheet
          </h2>
          <p className="mt-1 text-sm text-muted">All transactions as a CSV file for Excel or Google Sheets. (For moving to another phone, use a backup instead.)</p>
          <Button className="mt-4" variant="secondary" block onClick={() => void exportCsv()}>
            <FileSpreadsheet size={18} aria-hidden />
            Export transactions (CSV)
          </Button>
        </section>

        <StorageStatus />

        {/* Danger zone */}
        <section aria-labelledby="erase-heading" className="rounded-card border border-expense/30 bg-surface p-5 shadow-sm">
          <h2 id="erase-heading" className="font-semibold">
            Erase all data
          </h2>
          <p className="mt-1 text-sm text-muted">Start over from scratch on this phone. Your PIN and theme are kept.</p>
          <Button className="mt-4" variant="danger" block onClick={() => void erase()}>
            <Trash2 size={18} aria-hidden />
            Erase all data
          </Button>
        </section>
      </div>

      <BottomSheet open={pending !== null} onClose={() => setPending(null)} title="Restore this backup?">
        {pending && (
          <RestoreSummary
            backup={pending}
            current={counts}
            busy={busy}
            onBackupFirst={() => void exportBackup(shareable ? 'share' : 'download')}
            onConfirm={() => void doRestore()}
          />
        )}
      </BottomSheet>
    </>
  );
}

function RestoreSummary({
  backup,
  current,
  busy,
  onBackupFirst,
  onConfirm,
}: {
  backup: Backup;
  current?: { transactions: number; accounts: number };
  busy: boolean;
  onBackupFirst: () => void;
  onConfirm: () => void;
}) {
  const s = summarizeBackup(backup);
  const made = new Date(backup.exportedAt);
  return (
    <div className="flex flex-col gap-4 pt-2">
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 text-sm">
        <dt className="text-muted">Made on</dt>
        <dd className="text-right font-medium">{Number.isNaN(made.getTime()) ? 'Unknown' : made.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        <dt className="text-muted">Transactions</dt>
        <dd className="text-right font-medium">{s.transactions}</dd>
        <dt className="text-muted">Accounts</dt>
        <dd className="text-right font-medium">{s.accounts}</dd>
        <dt className="text-muted">Savings goals</dt>
        <dd className="text-right font-medium">{s.goals}</dd>
        <dt className="text-muted">Bills</dt>
        <dd className="text-right font-medium">{s.bills}</dd>
      </dl>
      <p className="flex gap-2 rounded-xl bg-warn-soft p-3 text-sm">
        <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <span>
          This replaces <strong>everything</strong> currently in Coinkeep{current ? ` (${plural(current.transactions, 'transaction')} in ${plural(current.accounts, 'account')})` : ''}.
        </span>
      </p>
      <Button variant="secondary" block onClick={onBackupFirst} disabled={busy}>
        <Download size={18} aria-hidden />
        Back up current data first
      </Button>
      <Button variant="danger" size="lg" block onClick={onConfirm} disabled={busy}>
        Replace my data
      </Button>
    </div>
  );
}

function StorageStatus() {
  const recorded = useSetting('storagePersisted');
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
    void storageEstimate().then(setEstimate);
  }, []);

  const status = persisted ?? recorded ?? null;
  const ask = async () => {
    const granted = await requestPersistentStorage();
    setPersisted(granted);
    if (granted) toast('Storage is now persistent');
    else toastError('The browser declined. Installing Coinkeep to your home screen usually helps.');
  };

  return (
    <section aria-labelledby="storage-heading" className="rounded-card bg-surface p-5 shadow-sm">
      <h2 id="storage-heading" className="flex items-center gap-2 font-semibold">
        <HardDrive size={18} aria-hidden className="text-muted" />
        Storage status
      </h2>
      <p className={`mt-2 flex items-center gap-2 text-sm font-medium ${status ? 'text-income' : 'text-warn'}`}>
        {status ? <CheckCircle2 size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
        {!storageApiAvailable()
          ? 'This browser can’t report storage protection.'
          : status
            ? 'Protected: the browser won’t clear your data to free up space.'
            : 'Not protected: the browser may clear Coinkeep’s data if the phone runs low on space.'}
      </p>
      {estimate && (
        <p className="mt-1 text-sm text-muted">
          Using {formatBytes(estimate.usage)}
          {estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ''}.
        </p>
      )}
      {storageApiAvailable() && !status && (
        <Button className="mt-4" variant="secondary" block onClick={() => void ask()}>
          Ask for protected storage
        </Button>
      )}
    </section>
  );
}
