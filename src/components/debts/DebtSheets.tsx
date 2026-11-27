import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Debt } from '../../db/types';
import { createDebt, payDebt, removeDebtPayment, restoreDebtPayment, updateDebt } from '../../data/debts';
import { errorMessage } from '../../data/errors';
import { useAccounts, useCategories, useSetting } from '../../hooks/data';
import type { DebtWithStatus } from '../../hooks/money';
import { todayISO } from '../../lib/dates';
import { formatMAD } from '../../lib/money';
import { toast, toastError, vibrate } from '../../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { DateChip } from '../ui/Chips';
import { AmountField, DateField, SelectField, TextField } from '../ui/Fields';

/** New debt, or edit one (pass `debt`). */
export function DebtSheet({ open, onClose, debt }: { open: boolean; onClose: () => void; debt?: DebtWithStatus | null }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={debt ? 'Edit debt' : 'New debt'}>
      {open && <DebtForm key={debt?.id ?? 'new'} debt={debt ?? null} onDone={onClose} />}
    </BottomSheet>
  );
}

function DebtForm({ debt, onDone }: { debt: DebtWithStatus | null; onDone: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(debt?.name ?? '');
  const [amount, setAmount] = useState<number | null>(debt?.amount ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(debt?.categoryId ?? null);
  const [date, setDate] = useState(debt?.date ?? todayISO());
  const [note, setNote] = useState(debt?.note ?? '');
  const [busy, setBusy] = useState(false);

  if (!categories) return null;
  const options = categories.all.filter((c) => c.kind === 'expense' && (!c.archived || c.id === debt?.categoryId));
  const fallback = options.find((c) => /debt|loan|credit/i.test(c.name)) ?? options.find((c) => c.name === 'Other') ?? options[0];
  const chosenCategory = categoryId ?? fallback?.id ?? null;
  const belowPaid = debt !== null && amount !== null && amount < debt.paid;
  const valid = name.trim() !== '' && amount !== null && amount > 0 && chosenCategory !== null && !belowPaid;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const input = { name, amount: amount!, categoryId: chosenCategory!, date, note };
      if (debt) await updateDebt(debt.id, input);
      else await createDebt(input);
      toast(debt ? 'Debt updated' : `Debt added · ${formatMAD(amount!)}`);
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField label="Owed to / for" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laptop instalments, Youssef" maxLength={40} autoComplete="off" required />
      <AmountField
        label="Total owed"
        value={amount}
        onChange={setAmount}
        hint={debt && debt.paid > 0 ? `You’ve paid ${formatMAD(debt.paid)} so far.` : 'Nothing leaves your accounts until you pay it.'}
      />
      {belowPaid && (
        <p role="alert" className="-mt-3 text-sm text-expense">
          The total can’t be less than what you’ve already paid.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Payments go under" value={chosenCategory ?? ''} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <DateField label="Since" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} autoComplete="off" />
      <Button type="submit" size="lg" block disabled={busy || !valid}>
        {debt ? 'Save changes' : 'Add to backlog'}
      </Button>
    </form>
  );
}

/** Pay a debt (all or part), choosing the account it comes out of and any fee. */
export function PayDebtSheet({ debt, onClose }: { debt: DebtWithStatus | null; onClose: () => void }) {
  return (
    <BottomSheet open={debt !== null} onClose={onClose} title={debt ? `Pay ${debt.name}` : 'Pay debt'}>
      {debt && <PayForm key={debt.id} debt={debt} onDone={onClose} />}
    </BottomSheet>
  );
}

function PayForm({ debt, onDone }: { debt: Pick<Debt, 'id' | 'name'> & { remaining: number }; onDone: () => void }) {
  const accounts = useAccounts();
  const lastUsed = useSetting('lastUsedAccountId');
  const [amount, setAmount] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  if (!accounts || lastUsed === undefined) return null;
  const options = accounts.active;
  const chosenAccount = accountId ?? (options.some((a) => a.id === lastUsed) ? lastUsed : options[0]?.id) ?? null;
  const tooMuch = amount !== null && amount > debt.remaining;
  const total = (amount ?? 0) + (fee ?? 0);
  const balance = chosenAccount !== null ? accounts.balances.get(chosenAccount) : undefined;
  const valid = amount !== null && amount > 0 && !tooMuch && (fee ?? 0) >= 0 && chosenAccount !== null;

  const pay = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const payment = await payDebt(debt.id, { amount: amount!, fee: fee ?? 0, accountId: chosenAccount!, date });
      vibrate();
      const settled = amount === debt.remaining;
      toast(`${settled ? `${debt.name} paid off` : `Paid ${formatMAD(amount!)} to ${debt.name}`}${fee ? ` · fee ${formatMAD(fee)}` : ''}`, {
        label: 'Undo',
        onClick: () => void removeDebtPayment(payment.id),
      });
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void pay();
      }}
    >
      <AmountField label="Amount" value={amount} onChange={setAmount} autoFocus hint={`Still owed: ${formatMAD(debt.remaining)}`} />
      {tooMuch && (
        <p role="alert" className="-mt-3 text-sm text-expense">
          That’s more than you still owe.
        </p>
      )}
      {amount !== debt.remaining && (
        <Button variant="secondary" onClick={() => setAmount(debt.remaining)}>
          Pay it all ({formatMAD(debt.remaining)})
        </Button>
      )}
      <SelectField
        label="Pay from"
        value={chosenAccount ?? ''}
        onChange={(e) => setAccountId(Number(e.target.value))}
        hint={balance !== undefined ? `Balance: ${formatMAD(balance)}${total > 0 ? ` → ${formatMAD(balance - total)} after` : ''}` : undefined}
      >
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </SelectField>
      <AmountField label="Fee (optional)" value={fee} onChange={setFee} hint="e.g. a bank transfer fee. Logged as a separate expense under Fees." />
      <div className="flex flex-wrap items-center gap-2">
        <DateChip label="Date" icon={CalendarDays} value={date} onChange={setDate} />
      </div>
      <Button type="submit" size="lg" block disabled={busy || !valid}>
        {valid ? `Pay ${formatMAD(total)}` : 'Pay'}
      </Button>
    </form>
  );
}

/** Removes a payment (and its fee) with Undo; the money goes back to the account. */
export async function removePaymentWithUndo(paymentId: number) {
  try {
    const removed = await removeDebtPayment(paymentId);
    if (removed) toast('Payment removed', { label: 'Undo', onClick: () => void restoreDebtPayment(removed) });
  } catch (err) {
    toastError(errorMessage(err));
  }
}
