import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CalendarDays, StickyNote, Trash2, Wallet, X } from 'lucide-react';
import { db } from '../../db/db';
import type { Account, Category, Transaction, TransactionType } from '../../db/types';
import { deleteTransaction, restoreTransaction, saveTransaction } from '../../data/transactions';
import { errorMessage } from '../../data/errors';
import { useAccounts, useCategories, useCategoryUsage, useSetting, type AccountsData, type CategoriesData } from '../../hooks/data';
import { applyKey, expressionFromCentimes, formatExpression, hasOperator, type KeypadKey } from '../../lib/keypad';
import { evaluateExpression, formatMAD } from '../../lib/money';
import { todayISO } from '../../lib/dates';
import { toast, toastError, useUI, vibrate } from '../../store/ui';
import { BottomSheet } from '../ui/BottomSheet';
import { IconButton } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { DateChip, SelectChip } from '../ui/Chips';
import { CategoryIcon } from '../ui/CategoryIcon';
import { Keypad } from './Keypad';

const TYPE_OPTIONS = [
  { value: 'expense' as const, label: 'Expense' },
  { value: 'income' as const, label: 'Income', activeClassName: 'text-income' },
  { value: 'transfer' as const, label: 'Transfer', activeClassName: 'text-accent' },
];

/** The app-wide add/edit transaction sheet. Opened through the UI store. */
export function QuickAddSheet() {
  const { open, session, initialType, editId } = useUI((s) => s.quickAdd);
  const close = useUI((s) => s.closeQuickAdd);
  const accounts = useAccounts();
  const categories = useCategories();
  const lastUsed = useSetting('lastUsedAccountId');
  // The transaction being edited. useLiveQuery keeps returning the previous
  // result while a new query runs, so tag results with the id they belong to.
  const loaded = useLiveQuery(
    async () => ({ id: editId, tx: editId === null ? null : ((await db.transactions.get(editId)) ?? null) }),
    [editId, session],
  );
  const editing = loaded?.id === editId ? loaded.tx : undefined;

  const ready = accounts && categories && (editId === null || editing !== undefined);

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={editId !== null ? 'Edit transaction' : 'Add transaction'}
      bare
      scrollBody={false}
    >
      {ready && (
        <QuickAddForm
          key={session}
          initialType={editing?.type ?? initialType}
          editing={editing ?? null}
          accounts={accounts}
          categories={categories}
          lastUsedAccountId={lastUsed ?? null}
          onDone={close}
        />
      )}
    </BottomSheet>
  );
}

interface FormProps {
  initialType: TransactionType;
  editing: Transaction | null;
  accounts: AccountsData;
  categories: CategoriesData;
  lastUsedAccountId: number | null;
  onDone: () => void;
}

function pickDefaultAccount(accounts: AccountsData, lastUsed: number | null): number | null {
  const last = lastUsed !== null ? accounts.byId.get(lastUsed) : undefined;
  if (last && !last.archived) return last.id;
  return accounts.active[0]?.id ?? null;
}

function QuickAddForm({ initialType, editing, accounts, categories, lastUsedAccountId, onDone }: FormProps) {
  const usage = useCategoryUsage();
  const [type, setType] = useState<TransactionType>(initialType);
  const [expr, setExpr] = useState(editing ? expressionFromCentimes(editing.amount) : '');
  const [categoryId, setCategoryId] = useState<number | null>(editing?.categoryId ?? null);
  const [accountId, setAccountId] = useState<number | null>(editing?.accountId ?? pickDefaultAccount(accounts, lastUsedAccountId));
  const [toAccountId, setToAccountId] = useState<number | null>(
    editing?.toAccountId ?? accounts.active.find((a) => a.id !== accountId)?.id ?? null,
  );
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [note, setNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);

  const amount = evaluateExpression(expr);
  const isTransfer = type === 'transfer';

  // Category chips: active ones of this kind, most-used first; keep an archived
  // category visible when editing a transaction that already uses it.
  const chipCategories = useMemo(() => {
    if (isTransfer) return [];
    const list: Category[] = categories.active(type);
    const current = editing?.categoryId != null ? categories.byId.get(editing.categoryId) : undefined;
    if (current && current.archived && current.kind === type) list.push(current);
    // Usage only changes when a transaction is saved, which closes the sheet, so chips don't jump around.
    return [...list].sort((a, b) => (usage?.get(b.id) ?? 0) - (usage?.get(a.id) ?? 0) || a.sortOrder - b.sortOrder);
  }, [isTransfer, type, categories, usage, editing]);

  // Accounts offered in pickers: active ones, plus archived ones already in use by this transaction.
  const pickerAccounts = useMemo(() => {
    const ids = new Set([editing?.accountId, editing?.toAccountId]);
    return accounts.all.filter((a) => !a.archived || ids.has(a.id));
  }, [accounts, editing]);

  const changeType = (next: TransactionType) => {
    setType(next);
    const current = categoryId !== null ? categories.byId.get(categoryId) : undefined;
    if (!current || current.kind !== next) setCategoryId(null);
    if (next === 'transfer' && (toAccountId === null || toAccountId === accountId)) {
      setToAccountId(accounts.active.find((a) => a.id !== accountId)?.id ?? null);
    }
  };

  const problem = (() => {
    // Only complain about a non-positive total once a calculation produced it, not while typing "0,".
    if (amount === null || amount <= 0) return hasOperator(expr) && amount !== null ? 'The total must be above zero' : null;
    if (accountId === null) return 'Add an account first (Settings → Accounts)';
    if (isTransfer) {
      if (accounts.active.length < 2 && pickerAccounts.length < 2) return 'Transfers need two accounts';
      if (toAccountId === null || toAccountId === accountId) return 'Pick two different accounts';
      return null;
    }
    if (categoryId === null) return 'Pick a category';
    return null;
  })();
  const canSave = amount !== null && amount > 0 && problem === null && !saving;

  const save = useCallback(async () => {
    if (!canSave || amount === null || accountId === null) return;
    setSaving(true);
    try {
      const id = await saveTransaction(
        {
          type,
          amount,
          accountId,
          toAccountId: isTransfer ? toAccountId : null,
          categoryId: isTransfer ? null : categoryId,
          date,
          note,
        },
        editing?.id,
      );
      vibrate();
      onDone();
      const what = isTransfer ? 'Transfer' : (categories.byId.get(categoryId ?? -1)?.name ?? '');
      if (editing) {
        toast('Transaction updated');
      } else {
        toast(`Saved ${formatMAD(amount)} · ${what}`, {
          label: 'Undo',
          onClick: () => void deleteTransaction(id),
        });
      }
    } catch (err) {
      toastError(errorMessage(err));
      setSaving(false);
    }
  }, [canSave, amount, accountId, type, isTransfer, toAccountId, categoryId, date, note, editing, onDone, categories]);

  const remove = async () => {
    if (!editing) return;
    const deleted = await deleteTransaction(editing.id);
    onDone();
    if (deleted) {
      vibrate();
      toast('Transaction deleted', { label: 'Undo', onClick: () => void restoreTransaction(deleted) });
    }
  };

  const press = useCallback((key: KeypadKey) => setExpr((e) => applyKey(e, key)), []);

  // Physical keyboard support (desktop, or a Bluetooth keyboard).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let key: KeypadKey | null = null;
      if (/^[0-9]$/.test(e.key)) key = e.key as KeypadKey;
      else if (e.key === ',' || e.key === '.') key = ',';
      else if (e.key === '+') key = '+';
      else if (e.key === '-') key = '-';
      else if (e.key === 'Backspace') key = 'back';
      else if (e.key === 'Enter' && canSave && target?.tagName !== 'BUTTON') {
        e.preventDefault();
        void save();
        return;
      }
      if (key) {
        e.preventDefault();
        press(key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [press, save, canSave]);

  const accountOptions = pickerAccounts.map((a: Account) => ({ value: a.id, label: a.name }));

  return (
    // The keypad stays pinned; on short screens only the category list shrinks and scrolls.
    <div className="flex min-h-0 flex-1 flex-col gap-[clamp(0.5rem,1.8dvh,1rem)] pt-3">
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl label="Transaction type" options={TYPE_OPTIONS} value={type} onChange={changeType} className="flex-1" />
        {editing && (
          <IconButton label="Delete transaction" onClick={remove} className="text-expense hover:text-expense">
            <Trash2 size={20} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={onDone}>
          <X size={20} />
        </IconButton>
      </div>

      {/* Amount display */}
      <div className="shrink-0 text-center" aria-live="polite" aria-atomic>
        <p className="sr-only">{amount && amount > 0 ? `Amount ${formatMAD(amount)}` : 'Amount empty'}</p>
        <p
          aria-hidden
          className={`break-all text-[clamp(1.75rem,5.5dvh,2.25rem)] font-semibold leading-tight tracking-tight ${
            expr ? '' : 'text-muted/60'
          } ${type === 'income' ? 'text-income' : ''}`}
        >
          {type === 'income' && expr ? '+' : ''}
          {formatExpression(expr)}
          <span className="ml-1.5 text-[0.65em] font-medium text-muted">DH</span>
        </p>
        {/* One line for both the running total and what's still missing, to save height on small phones. */}
        <p className="tabular mt-1 min-h-5 text-sm text-muted">
          <span aria-hidden>{hasOperator(expr) && amount !== null ? `= ${formatMAD(amount)}` : ''}</span>
          {hasOperator(expr) && problem ? ' · ' : ''}
          <span role="status">{problem ?? ''}</span>
        </p>
      </div>

      {/* Category chips, or from/to accounts for transfers */}
      {isTransfer ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          <SelectChip label="From account" icon={Wallet} prefix="From" value={accountId ?? -1} onChange={setAccountId} options={accountOptions} />
          <ArrowRight size={18} aria-hidden className="text-muted" />
          <SelectChip label="To account" icon={Wallet} prefix="To" value={toAccountId ?? -1} onChange={setToAccountId} options={accountOptions} />
        </div>
      ) : (
        // A plain div (not fieldset) so it can shrink as a flex item and scroll on short screens.
        <div role="group" aria-label="Category" className="-mx-0.5 min-h-12 shrink overflow-y-auto overscroll-contain">
          <div className="flex max-h-[17rem] flex-wrap gap-2 p-0.5">
            {chipCategories.map((c) => {
              const selected = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategoryId(selected ? null : c.id)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition ${
                    selected ? 'border-accent bg-accent-soft text-text ring-1 ring-accent' : 'border-border bg-surface hover:bg-surface-2'
                  }`}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={32} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date, account and note */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <DateChip label="Date" icon={CalendarDays} value={date} onChange={setDate} />
        {!isTransfer && <SelectChip label="Account" icon={Wallet} value={accountId ?? -1} onChange={setAccountId} options={accountOptions} />}
        <label className="relative inline-flex min-h-11 min-w-0 flex-1 basis-40 items-center rounded-full border border-border bg-surface pl-3.5 focus-within:ring-2 focus-within:ring-accent/40">
          <StickyNote size={16} aria-hidden className="shrink-0 text-muted" />
          <span className="sr-only">Note</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base placeholder:text-muted focus:outline-none"
          />
        </label>
      </div>

      <div className="shrink-0">
        <Keypad onKey={press} onSave={() => void save()} saveLabel={editing ? 'Update' : 'Save'} saveDisabled={!canSave} />
      </div>
    </div>
  );
}
