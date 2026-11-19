import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, ArrowRightLeft, Banknote, CalendarDays, Split, StickyNote, Trash2, Wallet, X } from 'lucide-react';
import { db } from '../../db/db';
import type { Account, Category, Transaction, TransactionType } from '../../db/types';
import { deleteTransaction, restoreTransaction, saveTransaction, saveTransactions, type TransactionInput } from '../../data/transactions';
import { errorMessage } from '../../data/errors';
import { useAccounts, useCategories, useCategoryUsage, useRecentTransactions, useSetting, type AccountsData, type CategoriesData } from '../../hooks/data';
import {
  SHORTCUT_MIN_USES,
  foldNote,
  matchNotes,
  noteShortcuts,
  transferLabel,
  transferShortcuts,
  type NoteShortcut,
  type Shortcut,
  type TransferShortcut,
} from '../../domain/shortcuts';
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
import { confirmDeleteTransaction } from '../transactions/confirmDelete';

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
  // Split payment: parts already entered, saved together with the current one.
  const [parts, setParts] = useState<TransactionInput[]>([]);
  const [noteFocused, setNoteFocused] = useState(false);
  const history = useRecentTransactions();

  const amount = evaluateExpression(expr);
  const isTransfer = type === 'transfer';

  // Shortcuts learned from history, limited to categories/accounts still in use.
  const learned = useMemo(() => {
    if (!history) return { notes: { expense: [], income: [] } as Record<'expense' | 'income', NoteShortcut[]>, transfers: [] as TransferShortcut[] };
    const usableNote = (s: NoteShortcut) => {
      const c = categories.byId.get(s.categoryId);
      return !!c && !c.archived && c.kind === s.type;
    };
    const activeAccount = (id: number) => accounts.byId.get(id)?.archived === false;
    return {
      notes: {
        expense: noteShortcuts(history, 'expense').filter(usableNote),
        income: noteShortcuts(history, 'income').filter(usableNote),
      },
      transfers: transferShortcuts(history).filter((s) => activeAccount(s.fromId) && activeAccount(s.toId)),
    };
  }, [history, categories, accounts]);

  // While typing a note: matching notes (autocomplete). Otherwise: the most-used shortcuts.
  const typedQuery = noteFocused && !isTransfer ? note : '';
  const shortcuts: Shortcut[] = useMemo(() => {
    if (editing) return [];
    if (typedQuery.trim()) return matchNotes(learned.notes[type as 'expense' | 'income'], typedQuery).slice(0, 8);
    const frequent = (list: Shortcut[]) => list.filter((s) => s.count >= SHORTCUT_MIN_USES);
    const pool: Shortcut[] =
      type === 'expense'
        ? [...frequent(learned.notes.expense), ...frequent(learned.transfers)]
        : type === 'income'
          ? frequent(learned.notes.income)
          : // The most-used pair is already preselected; chips only help with a choice.
            learned.transfers.length > 1
            ? learned.transfers
            : [];
    return [...pool].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 8);
  }, [editing, typedQuery, type, learned]);

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
    if (next === 'transfer') {
      // Start from the pair used most (e.g. bank → wallet), not whatever the expense account was.
      const usual = editing ? undefined : learned.transfers[0];
      if (usual) {
        setAccountId(usual.fromId);
        setToAccountId(usual.toId);
      } else if (toAccountId === null || toAccountId === accountId) {
        setToAccountId(accounts.active.find((a) => a.id !== accountId)?.id ?? null);
      }
    }
  };

  const isSelected = (s: Shortcut) =>
    s.kind === 'note'
      ? type === s.type && categoryId === s.categoryId && foldNote(note) === foldNote(s.note)
      : isTransfer && accountId === s.fromId && toAccountId === s.toId;

  const applyShortcut = (s: Shortcut) => {
    if (s.kind === 'transfer') {
      // A note picked from an expense shortcut ("Breakfast") doesn't belong on the transfer.
      if (!isTransfer && learned.notes[type as 'expense' | 'income'].some((n) => foldNote(n.note) === foldNote(note))) setNote('');
      setType('transfer');
      setCategoryId(null);
      setAccountId(s.fromId);
      setToAccountId(s.toId);
    } else if (isSelected(s)) {
      // Tapping the chosen shortcut again undoes it.
      setNote('');
      setCategoryId(null);
    } else {
      setNote(s.note);
      setCategoryId(s.categoryId);
    }
    // Picked from autocomplete: put the keyboard away.
    (document.activeElement as HTMLElement | null)?.blur();
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
  const currentValid = amount !== null && amount > 0 && problem === null;
  // With split parts waiting, an empty amount just means "save the parts".
  const currentEmpty = expr === '';
  const canSave = !saving && (currentValid || (parts.length > 0 && currentEmpty));
  const canSplit = !editing && !saving && currentValid;

  const currentInput = useCallback(
    (): TransactionInput => ({
      type,
      amount: amount ?? 0,
      accountId: accountId ?? -1,
      toAccountId: isTransfer ? toAccountId : null,
      categoryId: isTransfer ? null : categoryId,
      date,
      note,
    }),
    [type, amount, accountId, isTransfer, toAccountId, categoryId, date, note],
  );

  /** Puts the current entry aside as one part and starts the next (same type, account and date). */
  const split = () => {
    if (!canSplit) return;
    setParts((p) => [...p, currentInput()]);
    setExpr('');
    setCategoryId(null);
    setNote('');
    vibrate();
  };

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (parts.length > 0) {
        const all = currentEmpty ? parts : [...parts, currentInput()];
        const ids = await saveTransactions(all);
        vibrate();
        onDone();
        const total = all.reduce((s, p) => s + p.amount, 0);
        toast(`Saved ${formatMAD(total)} · ${all.length} parts`, {
          label: 'Undo',
          onClick: () => void (async () => {
            for (const id of ids) await deleteTransaction(id);
          })(),
        });
        return;
      }
      const input = currentInput();
      const id = await saveTransaction(input, editing?.id);
      vibrate();
      onDone();
      const what = isTransfer ? 'Transfer' : (categories.byId.get(categoryId ?? -1)?.name ?? '');
      if (editing) {
        toast('Transaction updated');
      } else {
        toast(`Saved ${formatMAD(input.amount)} · ${what}`, {
          label: 'Undo',
          onClick: () => void deleteTransaction(id),
        });
      }
    } catch (err) {
      toastError(errorMessage(err));
      setSaving(false);
    }
  }, [canSave, parts, currentEmpty, currentInput, isTransfer, categoryId, editing, onDone, categories]);

  const remove = async () => {
    if (!editing) return;
    const ok = await confirmDeleteTransaction(editing, {
      accountName: (id) => accounts.byId.get(id)?.name,
      categoryName: (id) => categories.byId.get(id)?.name,
    });
    if (!ok) return;
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
        {!editing && (
          <button
            type="button"
            onClick={split}
            disabled={!canSplit}
            aria-label="Split: keep this part and add another"
            title="Split: keep this part and add another"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-accent transition hover:bg-surface-2 disabled:text-muted disabled:opacity-50"
          >
            <Split size={18} aria-hidden />
            Split
          </button>
        )}
        {editing && (
          <IconButton label="Delete transaction" onClick={remove} className="text-expense hover:text-expense">
            <Trash2 size={20} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={onDone}>
          <X size={20} />
        </IconButton>
      </div>

      {/* Split parts already entered */}
      {parts.length > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          <ul aria-label="Parts" className="no-scrollbar -mx-0.5 flex min-w-0 flex-1 gap-2 overflow-x-auto p-0.5">
            {parts.map((p, i) => {
              const cat = p.categoryId !== null ? categories.byId.get(p.categoryId) : undefined;
              const label = cat ? cat.name : `→ ${accounts.byId.get(p.toAccountId ?? -1)?.name ?? '?'}`;
              return (
                <li key={i} className="flex shrink-0 items-center rounded-full border border-border bg-surface-2 py-0.5 pl-1 text-sm">
                  {cat ? (
                    <CategoryIcon icon={cat.icon} color={cat.color} size={24} />
                  ) : (
                    <ArrowRightLeft size={16} aria-hidden className="mx-1 text-accent" />
                  )}
                  <span className="tabular ml-1.5 whitespace-nowrap font-medium">{formatMAD(p.amount, { decimals: p.amount % 100 !== 0 })}</span>
                  <span className="ml-1 whitespace-nowrap text-muted">{label}</span>
                  <button
                    type="button"
                    onClick={() => setParts((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Remove part ${formatMAD(p.amount)} ${label}`}
                    className="ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-text"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="tabular shrink-0 text-sm text-muted">
            Total{' '}
            {(() => {
              const total = parts.reduce((s, p) => s + p.amount, 0) + (currentValid ? amount! : 0);
              return <span className="font-semibold text-text">{formatMAD(total, { decimals: total % 100 !== 0 })}</span>;
            })()}
          </p>
        </div>
      )}

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

      {/* Shortcuts: frequent notes (fill note + category, not the amount) and transfer pairs; autocomplete while typing a note */}
      {shortcuts.length > 0 && (
        <div
          role="group"
          aria-label={typedQuery.trim() ? 'Matching notes' : 'Shortcuts'}
          className="no-scrollbar -mx-0.5 flex shrink-0 gap-2 overflow-x-auto p-0.5"
        >
          {shortcuts.map((s) => {
            const selected = isSelected(s);
            const cat = s.kind === 'note' ? categories.byId.get(s.categoryId) : undefined;
            const from = s.kind === 'transfer' ? accounts.byId.get(s.fromId) : undefined;
            const to = s.kind === 'transfer' ? accounts.byId.get(s.toId) : undefined;
            const text = s.kind === 'note' ? s.note : from && to ? transferLabel(from, to) : '';
            const sub = s.kind === 'note' ? cat?.name : from && to && text === 'Withdraw cash' ? `${from.name} → ${to.name}` : undefined;
            return (
              <button
                key={s.kind === 'note' ? `n${s.categoryId}|${foldNote(s.note)}` : `t${s.fromId}>${s.toId}`}
                type="button"
                aria-pressed={selected}
                aria-label={sub ? `${text}, ${sub}` : text}
                // Keep the note field focused until the click lands, or the list would change under the finger.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => applyShortcut(s)}
                className={`inline-flex min-h-11 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-left text-sm transition ${
                  selected ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-dashed border-border bg-surface hover:bg-surface-2'
                }`}
              >
                {cat ? (
                  <CategoryIcon icon={cat.icon} color={cat.color} size={28} />
                ) : (
                  <span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Banknote size={16} />
                  </span>
                )}
                <span aria-hidden className="min-w-0 leading-tight">
                  <span className="block truncate font-medium">{text}</span>
                  {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                </span>
              </button>
            );
          })}
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
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            autoComplete="off"
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
        <Keypad onKey={press} onSave={() => void save()} saveLabel={editing ? 'Update' : parts.length > 0 ? 'Save all' : 'Save'} saveDisabled={!canSave} />
      </div>
    </div>
  );
}
