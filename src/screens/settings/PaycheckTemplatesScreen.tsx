import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { HandCoins, Plus, Trash2 } from 'lucide-react';
import { db } from '../../db/db';
import type { PaycheckTemplate } from '../../db/types';
import { deleteTemplate, restoreTemplate, saveTemplate } from '../../data/paycheck';
import { errorMessage } from '../../data/errors';
import { useAccounts, type AccountsData } from '../../hooks/data';
import { useGoals, type GoalWithHeld } from '../../hooks/money';
import { formatMAD } from '../../lib/money';
import { confirm, toast, toastError } from '../../store/ui';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button, IconButton } from '../../components/ui/Button';
import { AmountField, SelectField, TextField } from '../../components/ui/Fields';
import { CardList, ListRow } from '../../components/ui/ListRow';
import { AllocationEditor, rowsFromAllocations, rowsToAllocations, rowValue, type AllocationRow } from '../../components/paycheck/AllocationEditor';

type SheetState = { mode: 'create' } | { mode: 'edit'; template: PaycheckTemplate } | null;

function describeSplit(t: PaycheckTemplate, goals: Map<number, GoalWithHeld>): string {
  const parts = t.allocations
    .filter((a) => a.value > 0 && goals.has(a.goalId))
    .map((a) => `${goals.get(a.goalId)!.name} ${a.mode === 'percent' ? `${(a.value / 100).toLocaleString('fr-FR')}%` : formatMAD(a.value, { decimals: false })}`);
  return parts.length ? parts.join(' · ') : 'No savings split';
}

export function PaycheckTemplatesScreen() {
  const templates = useLiveQuery(() => db.paycheckTemplates.toArray());
  const accounts = useAccounts();
  const goals = useGoals();
  const [sheet, setSheet] = useState<SheetState>(null);

  if (!templates || !accounts || !goals) return <PageHeader title="Paycheck templates" backTo="/settings" />;

  return (
    <>
      <PageHeader
        title="Paycheck templates"
        backTo="/settings"
        backLabel="Back to settings"
        action={
          <IconButton label="Add template" onClick={() => setSheet({ mode: 'create' })}>
            <Plus size={22} />
          </IconButton>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No templates yet"
          description="A template remembers a regular paycheck — who pays it, the usual amount, the account, and how much goes to each goal — so logging it takes two taps."
          action={<Button onClick={() => setSheet({ mode: 'create' })}>Create a template</Button>}
        />
      ) : (
        <>
          <CardList label="Paycheck templates">
            {templates.map((t) => (
              <li key={t.id}>
                <ListRow
                  leading={
                    <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-income-soft text-income">
                      <HandCoins size={20} />
                    </span>
                  }
                  title={t.source}
                  subtitle={`${t.defaultAmount ? formatMAD(t.defaultAmount, { decimals: false }) : 'Amount varies'} · ${describeSplit(t, goals.byId)}`}
                  onSelect={() => setSheet({ mode: 'edit', template: t })}
                  selectLabel={`${t.source}. Edit template`}
                />
              </li>
            ))}
          </CardList>
          <Link to="/paycheck" className="mt-4 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-accent">
            Log a paycheck now
          </Link>
        </>
      )}

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit template' : 'New template'}>
        {sheet && (
          <TemplateForm
            key={sheet.mode === 'edit' ? sheet.template.id : 'new'}
            template={sheet.mode === 'edit' ? sheet.template : null}
            accounts={accounts}
            goals={goals.active}
            onDone={() => setSheet(null)}
          />
        )}
      </BottomSheet>
    </>
  );
}

function TemplateForm({ template, accounts, goals, onDone }: { template: PaycheckTemplate | null; accounts: AccountsData; goals: GoalWithHeld[]; onDone: () => void }) {
  const [source, setSource] = useState(template?.source ?? '');
  const [amount, setAmount] = useState<number | null>(template?.defaultAmount || null);
  const [accountId, setAccountId] = useState<number | null>(template?.accountId ?? accounts.active[0]?.id ?? null);
  const [rows, setRows] = useState<AllocationRow[]>(() => rowsFromAllocations(goals, template?.allocations ?? []));
  const [busy, setBusy] = useState(false);

  const invalid = rows.some((r) => rowValue(r) === null);
  // Keep allocations to archived goals the template already had, untouched.
  const hiddenAllocations = template?.allocations.filter((a) => !goals.some((g) => g.id === a.goalId)) ?? [];
  const valid = source.trim() !== '' && accountId !== null && !invalid;

  const save = async () => {
    if (!valid || accountId === null) return;
    setBusy(true);
    try {
      await saveTemplate({ source, defaultAmount: amount ?? 0, accountId, allocations: [...rowsToAllocations(rows), ...hiddenAllocations] }, template?.id);
      toast(template ? 'Template updated' : 'Template created');
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!template) return;
    const ok = await confirm({ title: `Delete “${template.source}”?`, message: 'Paychecks you already logged are not affected.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    const deleted = await deleteTemplate(template.id);
    onDone();
    if (deleted) toast('Template deleted', { label: 'Undo', onClick: () => void restoreTemplate(deleted) });
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField label="Paid by" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. employer or client" maxLength={60} autoComplete="off" required />
      <AmountField label="Usual amount (optional)" value={amount} onChange={setAmount} hint="Pre-filled when you log it; you can change it each time." />
      <SelectField label="Paid into" value={accountId ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
        {accounts.all
          .filter((a) => !a.archived || a.id === template?.accountId)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </SelectField>
      <div>
        <p className="mb-2 text-sm font-medium">Split into savings</p>
        {goals.length === 0 ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Create a savings goal to set up a split.</p>
        ) : (
          <AllocationEditor goals={goals} rows={rows} onChange={setRows} />
        )}
      </div>
      <Button type="submit" size="lg" block disabled={busy || !valid}>
        {template ? 'Save changes' : 'Create template'}
      </Button>
      {template && (
        <Button variant="danger" block disabled={busy} onClick={() => void remove()}>
          <Trash2 size={18} aria-hidden />
          Delete template
        </Button>
      )}
    </form>
  );
}
