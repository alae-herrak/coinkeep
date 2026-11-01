import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { SavingsGoal } from '../../db/types';
import { addMovement, createGoal, updateGoal } from '../../data/goals';
import { errorMessage } from '../../data/errors';
import { todayISO } from '../../lib/dates';
import { formatMAD } from '../../lib/money';
import { toast, toastError, vibrate } from '../../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { AmountField, DateField, TextField } from '../ui/Fields';
import { ColorPicker, IconPicker } from '../ui/Pickers';
import { CategoryIcon } from '../ui/CategoryIcon';
import { DateChip } from '../ui/Chips';

const GOAL_ICONS = ['PiggyBank', 'Umbrella', 'Palmtree', 'Plane', 'Car', 'House', 'Smartphone', 'Laptop', 'GraduationCap', 'Baby', 'Gift', 'Gem', 'Sofa', 'Bike', 'HeartPulse', 'Target', 'Sparkles', 'Wallet'];

interface GoalSheetProps {
  open: boolean;
  onClose: () => void;
  goal: SavingsGoal | null;
  onCreated?: (id: number) => void;
}

export function GoalSheet({ open, onClose, goal, onCreated }: GoalSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}>
      {open && <GoalForm key={goal?.id ?? 'new'} goal={goal} onDone={onClose} onCreated={onCreated} />}
    </BottomSheet>
  );
}

function GoalForm({ goal, onDone, onCreated }: { goal: SavingsGoal | null; onDone: () => void; onCreated?: (id: number) => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? 'PiggyBank');
  const [color, setColor] = useState(goal?.color ?? '#4f46e5');
  const [target, setTarget] = useState<number | null>(goal?.targetAmount ?? null);
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const input = { name, icon, color, targetAmount: target && target > 0 ? target : null, targetDate: targetDate || null };
      if (goal) {
        await updateGoal(goal.id, input);
        toast('Goal updated');
      } else {
        const id = await createGoal(input);
        toast('Goal created');
        onCreated?.(id);
      }
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
      <div className="flex items-end gap-3">
        <CategoryIcon icon={icon} color={color} size={48} />
        <div className="flex-1">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Emergency fund" autoComplete="off" required />
        </div>
      </div>
      <AmountField label="Target (optional)" value={target} onChange={setTarget} placeholder="e.g. 10 000" />
      <DateField
        label="Target date (optional)"
        value={targetDate}
        min={todayISO()}
        onChange={(e) => setTargetDate(e.target.value)}
        hint="We’ll tell you how much to set aside each month."
      />
      <IconPicker value={icon} onChange={setIcon} color={color} names={GOAL_ICONS} />
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" size="lg" block disabled={busy}>
        {goal ? 'Save changes' : 'Create goal'}
      </Button>
    </form>
  );
}

interface MovementSheetProps {
  open: boolean;
  onClose: () => void;
  goal: { id: number; name: string; held: number } | null;
  direction: 'add' | 'withdraw';
  /** Shown as a hint when adding, so people don't set aside money they don't have. */
  safeToSpend?: number;
}

export function MovementSheet({ open, onClose, goal, direction, safeToSpend }: MovementSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={direction === 'add' ? `Add to ${goal?.name ?? 'goal'}` : `Withdraw from ${goal?.name ?? 'goal'}`}>
      {open && goal && <MovementForm key={`${goal.id}-${direction}`} goal={goal} direction={direction} safeToSpend={safeToSpend} onDone={onClose} />}
    </BottomSheet>
  );
}

function MovementForm({ goal, direction, safeToSpend, onDone }: { goal: { id: number; held: number }; direction: 'add' | 'withdraw'; safeToSpend?: number; onDone: () => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdd = direction === 'add';
  const tooMuch = !isAdd && amount !== null && amount > goal.held;

  const save = async () => {
    if (!amount || amount <= 0 || tooMuch) return;
    setBusy(true);
    try {
      await addMovement(goal.id, { amount: isAdd ? amount : -amount, date, note });
      vibrate();
      toast(isAdd ? `Set aside ${formatMAD(amount)}` : `Withdrew ${formatMAD(amount)}`);
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
      <AmountField
        label="Amount"
        value={amount}
        onChange={setAmount}
        autoFocus
        hint={
          isAdd
            ? safeToSpend !== undefined
              ? `Safe to spend right now: ${formatMAD(safeToSpend)}. This money stays in your accounts but won’t count as spendable.`
              : undefined
            : `The goal holds ${formatMAD(goal.held)}. Withdrawn money becomes spendable again.`
        }
      />
      {tooMuch && (
        <p role="alert" className="-mt-3 text-sm text-expense">
          That’s more than the goal holds.
        </p>
      )}
      {!isAdd && goal.held > 0 && (
        <Button variant="secondary" onClick={() => setAmount(goal.held)}>
          Withdraw everything ({formatMAD(goal.held)})
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <DateChip label="Date" icon={CalendarDays} value={date} onChange={setDate} />
      </div>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} autoComplete="off" />
      <Button type="submit" size="lg" block disabled={busy || !amount || amount <= 0 || tooMuch}>
        {isAdd ? 'Set aside' : 'Withdraw'}
      </Button>
    </form>
  );
}
