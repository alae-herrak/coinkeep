import { useState } from 'react';
import { ArrowUpDown, Banknote, CircleDollarSign, CreditCard, Landmark, Plus, type LucideIcon } from 'lucide-react';
import type { Account, AccountType } from '../../db/types';
import {
  accountUsageCount,
  createAccount,
  deleteAccount,
  moveAccount,
  setAccountArchived,
  updateAccount,
} from '../../data/accounts';
import { errorMessage } from '../../data/errors';
import { sumBalances } from '../../domain/balances';
import { useAccounts } from '../../hooks/data';
import { ACCOUNT_TYPE_LABELS } from '../../lib/format';
import { formatMAD } from '../../lib/money';
import { confirm, toast, toastError } from '../../store/ui';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button, IconButton } from '../../components/ui/Button';
import { AmountField, TextField } from '../../components/ui/Fields';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { CardList, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  card: CreditCard,
  other: CircleDollarSign,
};

export function AccountIcon({ type }: { type: AccountType }) {
  const Icon = ACCOUNT_ICONS[type];
  return (
    <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
      <Icon size={20} />
    </span>
  );
}

const TYPE_OPTIONS = (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

type SheetState = { mode: 'create' } | { mode: 'edit'; account: Account } | null;

export function AccountsScreen() {
  const accounts = useAccounts();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [reordering, setReordering] = useState(false);

  if (!accounts) return <PageHeader title="Accounts" backTo="/settings" />;

  const total = sumBalances(accounts.balances);
  const move = (id: number, dir: 'up' | 'down') => moveAccount(id, dir).catch((e) => toastError(errorMessage(e)));

  return (
    <>
      <PageHeader
        title="Accounts"
        backTo="/settings"
        backLabel="Back to settings"
        action={
          <>
            {accounts.active.length > 1 && (
              <IconButton label={reordering ? 'Done reordering' : 'Reorder accounts'} aria-pressed={reordering} onClick={() => setReordering((r) => !r)} className={reordering ? 'bg-accent-soft text-accent' : ''}>
                <ArrowUpDown size={20} />
              </IconButton>
            )}
            <IconButton label="Add account" onClick={() => setSheet({ mode: 'create' })}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />

      <div className="mb-5 rounded-card bg-surface p-5 shadow-sm">
        <p className="text-sm text-muted">Total across all accounts</p>
        <Money amount={total} className="mt-1 block text-3xl font-semibold tracking-tight" />
      </div>

      <CardList label="Accounts">
        {accounts.active.map((a, i) => (
          <li key={a.id}>
            <ListRow
              leading={<AccountIcon type={a.type} />}
              title={a.name}
              subtitle={ACCOUNT_TYPE_LABELS[a.type]}
              trailing={<Money amount={accounts.balances.get(a.id) ?? 0} className="font-semibold" />}
              onSelect={() => setSheet({ mode: 'edit', account: a })}
              selectLabel={`${a.name}, ${formatMAD(accounts.balances.get(a.id) ?? 0)}. Edit`}
              reorder={
                reordering
                  ? { name: a.name, onUp: () => void move(a.id, 'up'), onDown: () => void move(a.id, 'down'), canUp: i > 0, canDown: i < accounts.active.length - 1 }
                  : undefined
              }
            />
          </li>
        ))}
      </CardList>

      {accounts.archived.length > 0 && (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer px-1 py-2 text-sm font-semibold text-muted">Archived ({accounts.archived.length})</summary>
          <CardList label="Archived accounts">
            {accounts.archived.map((a) => (
              <li key={a.id}>
                <ListRow
                  leading={<AccountIcon type={a.type} />}
                  title={a.name}
                  subtitle="Archived"
                  trailing={<Money amount={accounts.balances.get(a.id) ?? 0} tone="muted" />}
                  onSelect={() => setSheet({ mode: 'edit', account: a })}
                  selectLabel={`${a.name}, archived. Edit`}
                />
              </li>
            ))}
          </CardList>
        </details>
      )}

      <p className="mt-4 px-1 text-sm text-muted">Archived accounts are hidden from pickers but their balance still counts in your totals.</p>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit account' : 'New account'}>
        {sheet && (
          <AccountForm
            key={sheet.mode === 'edit' ? sheet.account.id : 'new'}
            account={sheet.mode === 'edit' ? sheet.account : null}
            balance={sheet.mode === 'edit' ? (accounts.balances.get(sheet.account.id) ?? 0) : null}
            onDone={() => setSheet(null)}
          />
        )}
      </BottomSheet>
    </>
  );
}

function AccountForm({ account, balance, onDone }: { account: Account | null; balance: number | null; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [startingBalance, setStartingBalance] = useState<number | null>(account?.startingBalance ?? null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const input = { name, type, startingBalance: startingBalance ?? 0 };
      if (account) await updateAccount(account.id, input);
      else await createAccount(input);
      toast(account ? 'Account updated' : 'Account added');
    });

  const toggleArchive = async () => {
    if (!account) return;
    if (!account.archived && balance) {
      const ok = await confirm({
        title: `Archive “${account.name}”?`,
        message: `It still holds ${formatMAD(balance)}. Archived accounts are hidden from pickers, but the balance keeps counting in your totals.`,
        confirmLabel: 'Archive',
      });
      if (!ok) return;
    }
    await run(async () => {
      await setAccountArchived(account.id, !account.archived);
      toast(account.archived ? 'Account restored' : 'Account archived', {
        label: 'Undo',
        onClick: () => void setAccountArchived(account.id, account.archived).catch((e) => toastError(errorMessage(e))),
      });
    });
  };

  const remove = async () => {
    if (!account) return;
    if ((await accountUsageCount(account.id)) > 0) {
      toastError('This account has transactions or bills. Archive it instead.');
      return;
    }
    const ok = await confirm({ title: `Delete “${account.name}”?`, message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (ok) await run(async () => deleteAccount(account.id).then(() => toast('Account deleted')));
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. CIH Bank" autoComplete="off" required />
      <div>
        <p className="mb-1.5 text-sm font-medium">Type</p>
        <SegmentedControl label="Account type" options={TYPE_OPTIONS} value={type} onChange={setType} />
      </div>
      <AmountField
        label="Starting balance"
        value={startingBalance}
        onChange={setStartingBalance}
        allowNegative
        hint={
          account && balance !== null
            ? `Current balance: ${formatMAD(balance)}. Changing the starting balance shifts it by the same amount.`
            : 'What’s in the account right now. Can be negative for a card you owe on.'
        }
      />
      <Button type="submit" size="lg" block disabled={busy}>
        {account ? 'Save changes' : 'Add account'}
      </Button>
      {account && (
        <div className="flex gap-2">
          <Button variant="secondary" block disabled={busy} onClick={() => void toggleArchive()}>
            {account.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button variant="danger" block disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}
