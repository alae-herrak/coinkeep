import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, ArrowDownLeft, ArrowUpRight, HandCoins, Pencil, PiggyBank, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import type { SavingsMovement } from '../db/types';
import { archiveGoal, deleteGoal, deleteMovement, restoreGoal, restoreMovement, unarchiveGoal, undoArchiveGoal } from '../data/goals';
import { errorMessage } from '../data/errors';
import { goalProgress } from '../domain/goals';
import { useGoals, useSafeToSpend } from '../hooks/money';
import { formatDayLabel, formatShortDate } from '../lib/format';
import { formatMAD } from '../lib/money';
import { confirm, toast, toastError } from '../store/ui';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, IconButton } from '../components/ui/Button';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState } from '../components/ui/EmptyState';
import { SwipeToDelete } from '../components/ui/SwipeToDelete';
import { GoalSheet, MovementSheet } from '../components/goals/GoalSheets';
import { goalStatusText } from '../components/goals/GoalBits';

export function GoalDetailScreen() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const goals = useGoals();
  const safe = useSafeToSpend();
  const movements = useLiveQuery(
    async () => (await db.savingsMovements.where('goalId').equals(id).toArray()).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id)),
    [id],
  );
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<'add' | 'withdraw' | null>(null);

  if (!goals || !movements) return <PageHeader title="Goal" backTo="/goals" />;
  const goal = goals.byId.get(id);
  if (!goal) {
    return (
      <>
        <PageHeader title="Goal" backTo="/goals" backLabel="Back to goals" />
        <EmptyState icon={PiggyBank} title="Goal not found" description="It may have been deleted." action={<Button onClick={() => navigate('/goals')}>See all goals</Button>} />
      </>
    );
  }

  const progress = goalProgress(goal.held, goal.targetAmount);

  const onArchive = async () => {
    if (goal.archived) {
      await unarchiveGoal(goal.id);
      toast('Goal restored');
      return;
    }
    const ok = await confirm({
      title: `Archive “${goal.name}”?`,
      message:
        goal.held > 0
          ? `The ${formatMAD(goal.held)} it holds will be released back into Safe to spend. You can undo this right after.`
          : 'It will be hidden from your goals and the paycheck split.',
      confirmLabel: 'Archive',
    });
    if (!ok) return;
    try {
      const archived = await archiveGoal(goal.id);
      toast('Goal archived', { label: 'Undo', onClick: () => void undoArchiveGoal(archived) });
    } catch (err) {
      toastError(errorMessage(err));
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${goal.name}”?`,
      message: `Its history will be removed${goal.held > 0 ? ` and the ${formatMAD(goal.held)} it holds becomes spendable again` : ''}.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const deleted = await deleteGoal(goal.id);
    navigate('/goals');
    if (deleted) toast('Goal deleted', { label: 'Undo', onClick: () => void restoreGoal(deleted) });
  };

  const onDeleteMovement = async (m: SavingsMovement) => {
    // Removing an allocation must not leave the goal below zero (money already withdrawn).
    if (m.amount > 0 && goal.held - m.amount < 0) {
      toastError('Remove the later withdrawal first — the goal can’t go below zero.');
      return;
    }
    const deleted = await deleteMovement(m.id);
    if (deleted) toast('Entry removed', { label: 'Undo', onClick: () => void restoreMovement(deleted) });
  };

  return (
    <>
      <PageHeader
        title={goal.name}
        backTo="/goals"
        backLabel="Back to goals"
        action={
          <IconButton label="Edit goal" onClick={() => setEditing(true)}>
            <Pencil size={20} />
          </IconButton>
        }
      />

      <section aria-label="Progress" className="rounded-card bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <CategoryIcon icon={goal.icon} color={goal.color} size={56} />
          <div className="min-w-0">
            <p className="text-sm text-muted">Set aside</p>
            <GoalAmount centimes={goal.held} />
            {goal.targetAmount !== null && <p className="tabular text-sm text-muted">of {formatMAD(goal.targetAmount)} target</p>}
          </div>
        </div>
        {goal.targetAmount !== null && (
          <div className="mt-4">
            <ProgressBar value={progress} label={`${goal.name} progress`} valueText={`${Math.round(progress * 100)}%`} />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{Math.round(progress * 100)}%</span>
              {goal.targetDate && <span>Target: {formatShortDate(goal.targetDate)}</span>}
            </div>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent">{goalStatusText(goal)}</p>

        {goal.archived ? (
          <p className="mt-4 text-sm text-muted">This goal is archived. Restore it to add money again.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setMoving('add')}>
              <ArrowDownLeft size={18} aria-hidden />
              Add money
            </Button>
            <Button variant="secondary" onClick={() => setMoving('withdraw')} disabled={goal.held <= 0}>
              <ArrowUpRight size={18} aria-hidden />
              Withdraw
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="history-heading" className="mt-6">
        <h2 id="history-heading" className="mb-2 px-1 text-sm font-semibold text-muted">
          History
        </h2>
        {movements.length === 0 ? (
          <p className="rounded-card bg-surface p-5 text-center text-sm text-muted shadow-sm">
            Nothing yet. Add money here or split your next paycheck into this goal.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-card bg-surface shadow-sm">
            {movements.map((m) => (
              <li key={m.id} className="border-b border-border last:border-b-0">
                <SwipeToDelete onDelete={() => void onDeleteMovement(m)}>
                  <div className="flex min-h-14 items-center gap-3 bg-surface px-4 py-2.5">
                    <span
                      aria-hidden
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.amount > 0 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}
                    >
                      {m.linkedTransactionId !== null ? <HandCoins size={18} /> : m.amount > 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.note || (m.amount > 0 ? 'Added' : 'Withdrawn')}</span>
                      <span className="block text-xs text-muted">{formatDayLabel(m.date)}</span>
                    </span>
                    <span className={`tabular shrink-0 font-semibold ${m.amount > 0 ? 'text-accent' : ''}`}>{formatMAD(m.amount, { sign: 'always' })}</span>
                    <IconButton label={`Remove ${formatMAD(m.amount, { sign: 'always' })} entry from ${formatDayLabel(m.date)}`} onClick={() => void onDeleteMovement(m)} className="-mr-2 h-10 w-10">
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </SwipeToDelete>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => void onArchive()}>
          {goal.archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}
          {goal.archived ? 'Restore' : 'Archive'}
        </Button>
        <Button variant="danger" onClick={() => void onDelete()}>
          <Trash2 size={18} aria-hidden />
          Delete
        </Button>
      </div>

      <GoalSheet open={editing} onClose={() => setEditing(false)} goal={goal} />
      <MovementSheet open={moving !== null} onClose={() => setMoving(null)} goal={goal} direction={moving ?? 'add'} safeToSpend={safe?.amount} />
    </>
  );
}

/** The goal's balance; rolls to the new value after adding or withdrawing. */
function GoalAmount({ centimes }: { centimes: number }) {
  const shown = useAnimatedNumber(centimes);
  return <p className={`text-3xl font-semibold tracking-tight text-accent ${shown.animating ? 'tabular' : ''}`}>{formatMAD(shown.value)}</p>;
}
