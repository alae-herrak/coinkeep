import { useState } from 'react';
import { Lock, PiggyBank, Wallet } from 'lucide-react';
import type { AccountType } from '../db/types';
import { completeOnboarding, type OnboardingInput } from '../data/onboarding';
import { errorMessage } from '../data/errors';
import { ACCOUNT_TYPE_LABELS } from '../lib/format';
import { toastError } from '../store/ui';
import { Button } from '../components/ui/Button';
import { AmountField, TextField } from '../components/ui/Fields';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { CategoryIcon } from '../components/ui/CategoryIcon';

const GOAL_SUGGESTIONS = [
  { name: 'Emergency fund', icon: 'Umbrella', color: '#4f46e5' },
  { name: 'Holiday', icon: 'Palmtree', color: '#0891b2' },
  { name: 'New phone', icon: 'Smartphone', color: '#db2777' },
  { name: 'Car', icon: 'Car', color: '#ea580c' },
];

const ACCOUNT_TYPES = (Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

/** First launch only: two short, skippable steps. */
export function OnboardingScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('bank');
  const [startingBalance, setStartingBalance] = useState<number | null>(null);

  const [goalName, setGoalName] = useState('');
  const [goalStyle, setGoalStyle] = useState(GOAL_SUGGESTIONS[0]!);
  const [goalTarget, setGoalTarget] = useState<number | null>(null);
  const [goalSaved, setGoalSaved] = useState<number | null>(null);

  const account: OnboardingInput['account'] = {
    name: accountName.trim() || ACCOUNT_TYPE_LABELS[accountType],
    type: accountType,
    startingBalance: startingBalance ?? 0,
  };

  const finish = async (input: OnboardingInput) => {
    setBusy(true);
    try {
      await completeOnboarding(input);
      // The app switches to the main screens automatically once onboardingDone is saved.
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <main className="pt-safe px-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex items-center justify-between pt-4">
        <p className="text-sm font-medium text-muted" aria-live="polite">
          Step {step} of 2
        </p>
        <Button variant="ghost" disabled={busy} onClick={() => void finish({ account: step === 2 ? account : null, goal: null })}>
          Skip
        </Button>
      </div>

      {step === 1 ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
          }}
        >
          <div className="mb-6 mt-6">
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              <Wallet size={28} aria-hidden />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome to Coinkeep</h1>
            <p className="mt-2 text-muted">Let’s add the account you use most — your bank account, or the cash in your wallet.</p>
          </div>

          <div className="flex flex-col gap-5">
            <TextField
              label="Account name"
              placeholder={accountType === 'cash' ? 'e.g. Wallet' : 'e.g. CIH Bank'}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
            <div>
              <p className="mb-1.5 text-sm font-medium" id="acc-type-label">
                Type
              </p>
              <SegmentedControl label="Account type" options={ACCOUNT_TYPES} value={accountType} onChange={setAccountType} />
            </div>
            <AmountField
              label="Current balance"
              value={startingBalance}
              onChange={setStartingBalance}
              allowNegative
              hint="What’s in it right now. You can add more accounts later."
            />
          </div>

          <p className="mt-6 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
            <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
            Your data stays on this phone. No account, no cloud, no tracking.
          </p>

          <div className="mt-auto pb-4 pt-8">
            <Button type="submit" size="lg" block>
              Continue
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void finish({
              account,
              goal: {
                name: goalName.trim() || goalStyle.name,
                icon: goalStyle.icon,
                color: goalStyle.color,
                targetAmount: goalTarget && goalTarget > 0 ? goalTarget : null,
                alreadySaved: goalSaved ?? 0,
              },
            });
          }}
        >
          <div className="mb-6 mt-6">
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              <PiggyBank size={28} aria-hidden />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Saving for something?</h1>
            <p className="mt-2 text-muted">
              Money set aside for a goal isn’t counted in “Safe to spend”, so you won’t spend it by accident. Optional.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Pick one or name your own</legend>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_SUGGESTIONS.map((g) => {
                  const selected = g.name === goalStyle.name;
                  return (
                    <button
                      key={g.name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setGoalStyle(g);
                        setGoalName('');
                      }}
                      className={`flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium transition ${
                        selected ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border bg-surface hover:bg-surface-2'
                      }`}
                    >
                      <CategoryIcon icon={g.icon} color={g.color} size={32} />
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <TextField
              label="Goal name"
              placeholder={goalStyle.name}
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
            <AmountField label="Target (optional)" value={goalTarget} onChange={setGoalTarget} placeholder="e.g. 10 000" />
            <AmountField
              label="Already set aside (optional)"
              value={goalSaved}
              onChange={setGoalSaved}
              placeholder="0"
              hint="Only money that’s already part of your account balance."
            />
          </div>

          <div className="mt-auto flex flex-col gap-2 pb-4 pt-8">
            <Button type="submit" size="lg" block disabled={busy}>
              Create goal and finish
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={() => void finish({ account, goal: null })}>
              Skip for now
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
