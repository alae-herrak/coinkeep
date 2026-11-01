import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, ChevronRight, HandCoins, Wallet } from 'lucide-react';
import { db } from '../db/db';
import type { PaycheckTemplate } from '../db/types';
import { allocatePaycheck } from '../domain/allocation';
import { logPaycheck, saveTemplate } from '../data/paycheck';
import { deleteTransaction } from '../data/transactions';
import { errorMessage } from '../data/errors';
import { useAccounts, useCategories } from '../hooks/data';
import { useGoals, type GoalWithHeld } from '../hooks/money';
import { todayISO } from '../lib/dates';
import { formatMAD } from '../lib/money';
import { toast, toastError, vibrate } from '../store/ui';
import { Button, IconButton } from '../components/ui/Button';
import { AmountField, DateField, SelectField, TextField } from '../components/ui/Fields';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { AllocationEditor, rowsFromAllocations, rowsToAllocations, rowValue, type AllocationRow } from '../components/paycheck/AllocationEditor';

export function PaycheckScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const accounts = useAccounts();
  const categories = useCategories();
  const goals = useGoals();
  const templates = useLiveQuery(() => db.paycheckTemplates.toArray());
  // 'loading' sentinel: the flow's defaults are computed once, so wait for the real value.
  const lastUsed = useLiveQuery(async () => (await db.settings.get('lastUsedAccountId'))?.value ?? null, [], 'loading' as const);

  if (!accounts || !categories || !goals || !templates || lastUsed === 'loading') return null;
  return (
    <PaycheckFlow
      accounts={accounts}
      categories={categories}
      goals={goals.active}
      templates={templates}
      lastUsedAccountId={typeof lastUsed === 'number' ? lastUsed : null}
      initialTemplateId={Number(params.get('template')) || null}
      onExit={() => navigate('/')}
    />
  );
}

type FlowProps = {
  accounts: NonNullable<ReturnType<typeof useAccounts>>;
  categories: NonNullable<ReturnType<typeof useCategories>>;
  goals: GoalWithHeld[];
  templates: PaycheckTemplate[];
  lastUsedAccountId: number | null;
  initialTemplateId: number | null;
  onExit: () => void;
};

function PaycheckFlow({ accounts, categories, goals, templates, lastUsedAccountId, initialTemplateId, onExit }: FlowProps) {
  const incomeCategories = categories.active('income');
  const defaultCategory = incomeCategories.find((c) => c.name === 'Salary') ?? incomeCategories[0];
  const defaultAccount =
    (lastUsedAccountId !== null && accounts.byId.get(lastUsedAccountId)?.archived === false ? lastUsedAccountId : null) ?? accounts.active[0]?.id ?? null;
  const initialTemplate = templates.find((t) => t.id === initialTemplateId) ?? null;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  useEffect(() => {
    document.title = 'Log paycheck · Coinkeep';
  }, []);

  // Each step replaces the screen's content: move focus to its heading so it is announced.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);
  const [templateId, setTemplateId] = useState<number | null>(initialTemplate?.id ?? null);
  const [amount, setAmount] = useState<number | null>(initialTemplate?.defaultAmount || null);
  const [source, setSource] = useState(initialTemplate?.source ?? '');
  const [accountId, setAccountId] = useState<number | null>(
    initialTemplate && accounts.byId.get(initialTemplate.accountId) ? initialTemplate.accountId : defaultAccount,
  );
  const [categoryId, setCategoryId] = useState<number | null>(defaultCategory?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<AllocationRow[]>(() => rowsFromAllocations(goals, initialTemplate?.allocations ?? []));
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyTemplate = (t: PaycheckTemplate) => {
    setTemplateId(t.id);
    setAmount(t.defaultAmount || null);
    setSource(t.source);
    if (accounts.byId.get(t.accountId) && !accounts.byId.get(t.accountId)!.archived) setAccountId(t.accountId);
    setRows(rowsFromAllocations(goals, t.allocations));
    setSaveAsTemplate(false);
  };

  const hasInvalidRow = rows.some((r) => rowValue(r) === null);
  const allocations = rowsToAllocations(rows);
  const result = allocatePaycheck(amount ?? 0, allocations);
  const amountFor = (goalId: number) => result.lines.find((l) => l.goalId === goalId)?.amount ?? 0;

  const step1Valid = amount !== null && amount > 0 && accountId !== null && categoryId !== null;
  const step2Valid = !hasInvalidRow && result.remaining >= 0;
  const template = templates.find((t) => t.id === templateId) ?? null;

  const submit = async () => {
    if (!step1Valid || !step2Valid || amount === null || accountId === null || categoryId === null) return;
    setBusy(true);
    try {
      const logged = await logPaycheck({ amount, source, accountId, categoryId, date, allocations });
      if (saveAsTemplate) {
        await saveTemplate({ source: source || 'Paycheck', defaultAmount: amount, accountId, allocations }, template?.id);
      }
      vibrate(25);
      onExit();
      toast(
        result.allocated > 0 ? `Paycheck logged · ${formatMAD(result.allocated)} set aside` : `Paycheck logged · ${formatMAD(amount)}`,
        { label: 'Undo', onClick: () => void deleteTransaction(logged.transactionId) },
      );
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  const titles = { 1: 'Log paycheck', 2: 'Split into savings', 3: 'Confirm' } as const;

  return (
    <div className="flex min-h-[calc(100dvh-var(--spacing-tabbar)-env(safe-area-inset-bottom)-env(safe-area-inset-top)-1.5rem)] flex-col">
      <header className="flex items-center gap-1 pb-4 pt-6">
        <IconButton
          label={step === 1 ? 'Cancel' : 'Previous step'}
          className="-ml-3"
          onClick={() => (step === 1 ? onExit() : setStep((s) => (s - 1) as 1 | 2))}
        >
          <ArrowLeft size={22} />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 ref={headingRef} tabIndex={-1} className="truncate text-2xl font-semibold tracking-tight outline-none">
            {titles[step]}
          </h1>
          <p className="text-sm text-muted" aria-live="polite">
            Step {step} of 3
          </p>
        </div>
      </header>

      {step === 1 && (
        <form
          className="flex flex-1 flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (step1Valid) setStep(2);
          }}
        >
          {templates.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Start from a template</legend>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={t.id === templateId}
                    onClick={() => applyTemplate(t)}
                    className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                      t.id === templateId ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent' : 'border-border bg-surface hover:bg-surface-2'
                    }`}
                  >
                    {t.source}
                    {t.defaultAmount > 0 && <span className="tabular text-muted">{formatMAD(t.defaultAmount, { decimals: false })}</span>}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <AmountField label="Amount received" value={amount} onChange={setAmount} autoFocus={templates.length === 0} />
          <TextField label="From" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. employer or client" maxLength={60} autoComplete="off" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Into account" value={accountId ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts.active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Category" value={categoryId ?? ''} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
          <DateField label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <div className="mt-auto pt-4">
            <Button type="submit" size="lg" block disabled={!step1Valid}>
              Next: split into savings
              <ChevronRight size={18} aria-hidden />
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-muted">
            How much of your <strong className="text-text">{formatMAD(amount ?? 0)}</strong> should go to savings? Enter a percentage or a fixed amount for each goal.
          </p>

          {goals.length === 0 ? (
            <div className="rounded-card bg-surface p-5 text-center shadow-sm">
              <p className="font-medium">You don’t have any savings goals yet.</p>
              <p className="mt-1 text-sm text-muted">You can still log the paycheck — it all stays spendable.</p>
              <Link to="/goals" className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent">
                Create a goal first
              </Link>
            </div>
          ) : (
            <AllocationEditor goals={goals} rows={rows} onChange={setRows} amountFor={amountFor} />
          )}

          <div className="sticky bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.5rem)] mt-auto rounded-card bg-surface p-4 shadow-lg ring-1 ring-border">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">To savings</dt>
              <dd className="tabular text-right font-semibold text-accent">{formatMAD(result.allocated)}</dd>
              <dt className="text-muted">{result.remaining < 0 ? 'Over by' : 'Stays spendable'}</dt>
              <dd className={`tabular text-right font-semibold ${result.remaining < 0 ? 'text-expense' : ''}`} aria-live="polite">
                {formatMAD(Math.abs(result.remaining))}
              </dd>
            </dl>
            {result.remaining < 0 && (
              <p role="alert" className="mt-2 text-sm text-expense">
                You’ve allocated more than the paycheck. Lower one of the amounts.
              </p>
            )}
            <Button className="mt-3" size="lg" block disabled={!step2Valid} onClick={() => setStep(3)}>
              Review
              <ChevronRight size={18} aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && amount !== null && accountId !== null && (
        <div className="flex flex-1 flex-col gap-4">
          <section aria-label="Summary" className="overflow-hidden rounded-card bg-surface shadow-sm">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <span aria-hidden className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-income-soft text-income">
                <HandCoins size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{source.trim() || 'Paycheck'}</p>
                <p className="text-sm text-muted">
                  Into {accounts.byId.get(accountId)?.name} · {categories.byId.get(categoryId ?? -1)?.name}
                </p>
              </div>
              <span className="tabular font-semibold text-income">{formatMAD(amount, { sign: 'always' })}</span>
            </div>
            {result.lines
              .filter((l) => l.amount > 0)
              .map((l) => {
                const g = goals.find((x) => x.id === l.goalId)!;
                return (
                  <div key={l.goalId} className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <CategoryIcon icon={g.icon} color={g.color} size={36} />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="tabular font-semibold text-accent">{formatMAD(l.amount)}</span>
                  </div>
                );
              })}
            <div className="flex items-center gap-3 bg-surface-2/60 px-4 py-3">
              <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted">
                <Wallet size={18} />
              </span>
              <span className="min-w-0 flex-1 font-medium">Stays spendable</span>
              <span className="tabular font-semibold">{formatMAD(result.remaining)}</span>
            </div>
          </section>

          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-sm">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
            <span className="text-sm">
              {template ? (
                <>
                  Update template <strong>{template.source}</strong> with this amount and split
                </>
              ) : (
                'Save as a template for next time'
              )}
            </span>
          </label>

          <div className="mt-auto pt-2">
            <Button size="lg" block disabled={busy} onClick={() => void submit()}>
              <Check size={20} aria-hidden />
              Log paycheck
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
