import { useState } from 'react';
import { BellRing, CalendarClock, Check, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { BillFrequency, RecurringBill } from '../db/types';
import { createBill, deleteBill, markBillPaid, restoreBill, setBillActive, undoBillPaid, updateBill } from '../data/bills';
import { errorMessage } from '../data/errors';
import { describeDue } from '../domain/bills';
import { useAccounts, useCategories, type AccountsData, type CategoriesData } from '../hooks/data';
import { useBills } from '../hooks/money';
import { diffDays, todayISO } from '../lib/dates';
import { formatShortDate } from '../lib/format';
import { formatMAD } from '../lib/money';
import { confirm, toast, toastError, vibrate } from '../store/ui';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button, IconButton } from '../components/ui/Button';
import { AmountField, DateField, SelectField, TextField } from '../components/ui/Fields';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { CategoryIcon } from '../components/ui/CategoryIcon';

const FREQUENCY_LABEL: Record<BillFrequency, string> = { weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };
const FREQUENCY_OPTIONS = [
  { value: 'weekly' as const, label: 'Weekly' },
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'yearly' as const, label: 'Yearly' },
];

type SheetState = { mode: 'create' } | { mode: 'edit'; bill: RecurringBill } | null;

export function BillsScreen() {
  const bills = useBills();
  const categories = useCategories();
  const accounts = useAccounts();
  const [sheet, setSheet] = useState<SheetState>(null);
  const today = todayISO();

  if (!bills || !categories || !accounts) return <PageHeader title="Bills" backTo="/more" backLabel="Back to More" />;

  const active = bills.filter((b) => b.active).sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : a.nextDueDate > b.nextDueDate ? 1 : a.name.localeCompare(b.name)));
  const paused = bills.filter((b) => !b.active).sort((a, b) => a.name.localeCompare(b.name));
  const monthlyTotal = active.reduce((s, b) => s + (b.frequency === 'monthly' ? b.amount : b.frequency === 'weekly' ? Math.round((b.amount * 52) / 12) : Math.round(b.amount / 12)), 0);

  const pay = async (bill: RecurringBill) => {
    try {
      const paid = await markBillPaid(bill.id);
      vibrate();
      toast(`${bill.name} paid · ${formatMAD(bill.amount)}`, { label: 'Undo', onClick: () => void undoBillPaid(paid) });
    } catch (err) {
      toastError(errorMessage(err));
    }
  };

  const headerAction = (
    <IconButton label="Add bill" onClick={() => setSheet({ mode: 'create' })}>
      <Plus size={22} />
    </IconButton>
  );

  return (
    <>
      <PageHeader title="Bills" subtitle="Recurring payments" backTo="/more" backLabel="Back to More" action={headerAction} />

      {bills.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No recurring bills"
          description="Add rent, phone or internet. Unpaid bills due this month are set aside in Safe to spend, and you’ll get a heads-up a week before."
          action={<Button onClick={() => setSheet({ mode: 'create' })}>Add a bill</Button>}
        />
      ) : (
        <>
          {active.length > 0 && (
            <p className="mb-3 px-1 text-sm text-muted">
              About <strong className="text-text">{formatMAD(monthlyTotal, { decimals: false })}</strong> a month in active bills.
            </p>
          )}
          <ul className="flex flex-col gap-3" aria-label="Active bills">
            {active.map((b) => {
              const days = diffDays(today, b.nextDueDate);
              const category = categories.byId.get(b.categoryId);
              const urgent = days <= 7;
              return (
                <li key={b.id} className="rounded-card bg-surface shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: 'edit', bill: b })}
                    className="flex w-full items-center gap-3 rounded-t-card px-4 pb-2 pt-4 text-left transition hover:bg-surface-2"
                    aria-label={`${b.name}, ${formatMAD(b.amount)}, ${describeDue(days)}. Edit`}
                  >
                    <CategoryIcon icon={category?.icon ?? 'Receipt'} color={category?.color ?? '#64748b'} size={40} />
                    <span aria-hidden className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {FREQUENCY_LABEL[b.frequency]} · {accounts.byId.get(b.accountId)?.name ?? 'Unknown account'}
                      </span>
                    </span>
                    <span aria-hidden className="tabular shrink-0 font-semibold">
                      {formatMAD(b.amount)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 px-4 pb-3 pt-1">
                    <span
                      className={`inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm ${days < 0 ? 'font-semibold text-expense' : urgent ? 'font-semibold text-warn' : 'text-muted'}`}
                    >
                      {urgent ? <BellRing size={16} aria-hidden className="shrink-0" /> : <CalendarClock size={16} aria-hidden className="shrink-0" />}
                      {/* Wraps instead of truncating: "due in N days" is the important part. */}
                      <span>
                        {formatShortDate(b.nextDueDate)} · {describeDue(days)}
                      </span>
                    </span>
                    <Button variant={urgent ? 'primary' : 'secondary'} onClick={() => void pay(b)} aria-label={`Mark as paid: ${b.name}`}>
                      <Check size={18} aria-hidden />
                      Mark as paid
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {paused.length > 0 && (
            <section aria-labelledby="paused-heading" className="mt-6">
              <h2 id="paused-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
                Paused
              </h2>
              <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
                {paused.map((b) => {
                  const category = categories.byId.get(b.categoryId);
                  return (
                    <li key={b.id} className="border-b border-border last:border-b-0">
                      <button type="button" onClick={() => setSheet({ mode: 'edit', bill: b })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left opacity-80 transition hover:bg-surface-2">
                        <CategoryIcon icon={category?.icon ?? 'Receipt'} color={category?.color ?? '#64748b'} size={36} />
                        <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                        <span className="tabular text-sm text-muted">{formatMAD(b.amount)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit bill' : 'New bill'}>
        {sheet && (
          <BillForm
            key={sheet.mode === 'edit' ? sheet.bill.id : 'new'}
            bill={sheet.mode === 'edit' ? sheet.bill : null}
            categories={categories}
            accounts={accounts}
            onDone={() => setSheet(null)}
          />
        )}
      </BottomSheet>
    </>
  );
}

interface BillFormProps {
  bill: RecurringBill | null;
  // Passed in already loaded: the form's initial state is computed once from them.
  categories: CategoriesData;
  accounts: AccountsData;
  onDone: () => void;
}

function BillForm({ bill, categories, accounts, onDone }: BillFormProps) {
  const expenseCategories = categories.all.filter((c) => c.kind === 'expense' && (!c.archived || c.id === bill?.categoryId));
  const accountOptions = accounts.all.filter((a) => !a.archived || a.id === bill?.accountId);
  const defaultCategory = expenseCategories.find((c) => c.name === 'Bills & Utilities') ?? expenseCategories[0];

  const [name, setName] = useState(bill?.name ?? '');
  const [amount, setAmount] = useState<number | null>(bill?.amount ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(bill?.categoryId ?? defaultCategory?.id ?? null);
  const [accountId, setAccountId] = useState<number | null>(bill?.accountId ?? accounts.active[0]?.id ?? null);
  const [frequency, setFrequency] = useState<BillFrequency>(bill?.frequency ?? 'monthly');
  const [nextDueDate, setNextDueDate] = useState(bill?.nextDueDate ?? todayISO());
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
      if (categoryId === null || accountId === null || amount === null) throw new Error('missing');
      const input = { name, amount, categoryId, accountId, frequency, nextDueDate, active: bill?.active ?? true };
      if (bill) await updateBill(bill.id, input);
      else await createBill(input);
      toast(bill ? 'Bill updated' : 'Bill added');
    });

  const remove = async () => {
    if (!bill) return;
    const ok = await confirm({
      title: `Delete “${bill.name}”?`,
      message: 'Past payments stay in your transactions.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      const deleted = await deleteBill(bill.id);
      if (deleted) toast('Bill deleted', { label: 'Undo', onClick: () => void restoreBill(deleted) });
    });
  };

  const togglePause = () =>
    run(async () => {
      if (!bill) return;
      await setBillActive(bill.id, !bill.active);
      toast(bill.active ? 'Bill paused — not counted in Safe to spend' : 'Bill resumed', {
        label: 'Undo',
        onClick: () => void setBillActive(bill.id, bill.active),
      });
    });

  const valid = name.trim() !== '' && amount !== null && amount > 0 && categoryId !== null && accountId !== null && nextDueDate !== '';

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void save();
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent, Internet, Phone" maxLength={40} autoComplete="off" required />
      <AmountField label="Amount" value={amount} onChange={setAmount} />
      <div>
        <p className="mb-1.5 text-sm font-medium">Repeats</p>
        <SegmentedControl label="Repeats" options={FREQUENCY_OPTIONS} value={frequency} onChange={setFrequency} />
      </div>
      <DateField
        label="Next due date"
        value={nextDueDate}
        onChange={(e) => e.target.value && setNextDueDate(e.target.value)}
        hint={frequency === 'monthly' ? 'Bills on the 29th–31st move to the last day of shorter months, then come back.' : undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Category" value={categoryId ?? ''} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Paid from" value={accountId ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
      </div>
      <Button type="submit" size="lg" block disabled={busy || !valid}>
        {bill ? 'Save changes' : 'Add bill'}
      </Button>
      {bill && (
        <div className="flex gap-2">
          <Button variant="secondary" block disabled={busy} onClick={() => void togglePause()}>
            {bill.active ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
            {bill.active ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="danger" block disabled={busy} onClick={() => void remove()}>
            <Trash2 size={18} aria-hidden />
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}
