import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HandCoins, PiggyBank, Plus } from 'lucide-react';
import { useGoals } from '../hooks/money';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Button, IconButton } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { GoalCard } from '../components/goals/GoalBits';
import { GoalSheet } from '../components/goals/GoalSheets';

export function GoalsScreen() {
  const goals = useGoals();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const sheet = <GoalSheet open={creating} onClose={() => setCreating(false)} goal={null} onCreated={(id) => navigate(`/goals/${id}`)} />;

  if (!goals) return <PageHeader title="Savings goals" />;

  if (goals.active.length === 0 && goals.archived.length === 0) {
    return (
      <>
        <PageHeader title="Savings goals" />
        <EmptyState
          icon={PiggyBank}
          title="No goals yet"
          description="Set money aside for things that matter — an emergency fund, a trip, a new phone. Money in goals isn’t counted as safe to spend."
          action={<Button onClick={() => setCreating(true)}>Create your first goal</Button>}
        />
        {sheet}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Savings goals"
        action={
          <IconButton label="New goal" onClick={() => setCreating(true)}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <section aria-label="Total saved" className="mb-4 rounded-card bg-accent-soft p-5">
        <p className="text-sm font-medium text-accent">Set aside in goals</p>
        <Money amount={goals.totalHeld} tone="accent" className="mt-1 block text-3xl font-semibold tracking-tight" />
        <Link
          to="/paycheck"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:brightness-110"
        >
          <HandCoins size={18} aria-hidden />
          Log paycheck & split
        </Link>
      </section>

      {goals.active.length === 0 ? (
        <p className="rounded-card bg-surface p-5 text-center text-muted shadow-sm">All your goals are archived.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.active.map((g) => (
            <li key={g.id}>
              <GoalCard goal={g} />
            </li>
          ))}
        </ul>
      )}

      {goals.archived.length > 0 && (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer px-1 py-2 text-sm font-semibold text-muted">Archived ({goals.archived.length})</summary>
          <ul className="flex flex-col gap-3 opacity-80">
            {goals.archived.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {sheet}
    </>
  );
}
