import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { GoalWithHeld } from '../../hooks/money';
import { goalProgress, monthlyNeeded } from '../../domain/goals';
import { formatShortDate } from '../../lib/format';
import { formatMAD } from '../../lib/money';
import { todayISO } from '../../lib/dates';
import { CategoryIcon } from '../ui/CategoryIcon';
import { ProgressBar } from '../ui/ProgressBar';

/** One line explaining where a goal stands, e.g. "1 250,00 DH/month to reach it by 1 May 2027". */
export function goalStatusText(goal: GoalWithHeld, today = todayISO()): string {
  const need = monthlyNeeded(goal.held, goal.targetAmount, goal.targetDate, today);
  switch (need.kind) {
    case 'reached':
      return 'Target reached — well done!';
    case 'perMonth':
      return `${formatMAD(need.amount)}/month to reach it by ${formatShortDate(goal.targetDate!)}`;
    case 'overdue':
      return `Target date passed · ${formatMAD(need.remaining)} to go`;
    case 'none':
      return goal.targetAmount !== null ? `${formatMAD(goal.targetAmount - goal.held)} to go` : 'No target — save at your own pace';
  }
}

/** Card used in the goals list. */
export function GoalCard({ goal }: { goal: GoalWithHeld }) {
  const progress = goalProgress(goal.held, goal.targetAmount);
  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block rounded-card bg-surface p-4 shadow-sm transition hover:bg-surface-2"
      aria-label={`${goal.name}: ${formatMAD(goal.held)} saved${goal.targetAmount ? ` of ${formatMAD(goal.targetAmount)}` : ''}. ${goalStatusText(goal)}`}
    >
      <div aria-hidden className="flex items-center gap-3">
        <CategoryIcon icon={goal.icon} color={goal.color} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{goal.name}</p>
          <p className="tabular text-sm text-muted">
            <span className="font-semibold text-accent">{formatMAD(goal.held)}</span>
            {goal.targetAmount !== null && <> of {formatMAD(goal.targetAmount)}</>}
          </p>
        </div>
        <ChevronRight size={18} className="text-muted" />
      </div>
      {goal.targetAmount !== null && <ProgressBar className="mt-3" value={progress} label={`${goal.name} progress`} />}
      <p aria-hidden className="mt-2 text-sm text-muted">
        {goalStatusText(goal)}
      </p>
    </Link>
  );
}

/** Compact row for Home. */
export function GoalMiniRow({ goal }: { goal: GoalWithHeld }) {
  const progress = goalProgress(goal.held, goal.targetAmount);
  return (
    <Link to={`/goals/${goal.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2">
      <CategoryIcon icon={goal.icon} color={goal.color} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{goal.name}</span>
          <span className="tabular shrink-0 text-sm text-muted">
            <span className="font-semibold text-accent">{formatMAD(goal.held, { decimals: false })}</span>
            {goal.targetAmount !== null && ` / ${formatMAD(goal.targetAmount, { decimals: false })}`}
          </span>
        </div>
        {goal.targetAmount !== null && (
          <ProgressBar className="mt-1.5" value={progress} label={`${goal.name} progress`} valueText={`${Math.round(progress * 100)}%`} />
        )}
      </div>
    </Link>
  );
}
