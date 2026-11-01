import { useState } from 'react';
import { ArrowUpDown, Plus } from 'lucide-react';
import type { Category, CategoryKind } from '../../db/types';
import {
  categoryUsageCount,
  createCategory,
  deleteCategory,
  moveCategory,
  setCategoryArchived,
  updateCategory,
} from '../../data/categories';
import { errorMessage } from '../../data/errors';
import { useCategories } from '../../hooks/data';
import { PICKER_COLORS } from '../../lib/icons';
import { confirm, toast, toastError } from '../../store/ui';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button, IconButton } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Fields';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { CardList, ListRow } from '../../components/ui/ListRow';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { ColorPicker, IconPicker } from '../../components/ui/Pickers';

type SheetState = { mode: 'create'; kind: CategoryKind } | { mode: 'edit'; category: Category } | null;

const KIND_OPTIONS = [
  { value: 'expense' as const, label: 'Expenses' },
  { value: 'income' as const, label: 'Income' },
];

export function CategoriesScreen() {
  const categories = useCategories();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [reordering, setReordering] = useState(false);

  if (!categories) return <PageHeader title="Categories" backTo="/settings" />;

  const active = categories.active(kind);
  const archived = categories.archived(kind);
  const move = (id: number, dir: 'up' | 'down') => moveCategory(id, dir).catch((e) => toastError(errorMessage(e)));

  return (
    <>
      <PageHeader
        title="Categories"
        backTo="/settings"
        backLabel="Back to settings"
        action={
          <>
            <IconButton label={reordering ? 'Done reordering' : 'Reorder categories'} aria-pressed={reordering} onClick={() => setReordering((r) => !r)} className={reordering ? 'bg-accent-soft text-accent' : ''}>
              <ArrowUpDown size={20} />
            </IconButton>
            <IconButton label="Add category" onClick={() => setSheet({ mode: 'create', kind })}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />

      <SegmentedControl label="Category type" options={KIND_OPTIONS} value={kind} onChange={setKind} className="mb-4" />

      {active.length === 0 ? (
        <div className="rounded-card bg-surface p-6 text-center shadow-sm">
          <p className="font-medium">No active {kind} categories</p>
          <Button className="mt-3" onClick={() => setSheet({ mode: 'create', kind })}>
            Add a category
          </Button>
        </div>
      ) : (
        <CardList label={kind === 'expense' ? 'Expense categories' : 'Income categories'}>
          {active.map((c, i) => (
            <li key={c.id}>
              <ListRow
                leading={<CategoryIcon icon={c.icon} color={c.color} />}
                title={c.name}
                onSelect={() => setSheet({ mode: 'edit', category: c })}
                selectLabel={`${c.name}. Edit`}
                reorder={
                  reordering
                    ? { name: c.name, onUp: () => void move(c.id, 'up'), onDown: () => void move(c.id, 'down'), canUp: i > 0, canDown: i < active.length - 1 }
                    : undefined
                }
              />
            </li>
          ))}
        </CardList>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer px-1 py-2 text-sm font-semibold text-muted">Archived ({archived.length})</summary>
          <CardList label="Archived categories">
            {archived.map((c) => (
              <li key={c.id}>
                <ListRow
                  leading={<CategoryIcon icon={c.icon} color={c.color} />}
                  title={c.name}
                  subtitle="Archived — hidden when adding transactions"
                  onSelect={() => setSheet({ mode: 'edit', category: c })}
                  selectLabel={`${c.name}, archived. Edit`}
                />
              </li>
            ))}
          </CardList>
        </details>
      )}

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet?.mode === 'edit' ? 'Edit category' : 'New category'}>
        {sheet && (
          <CategoryForm
            key={sheet.mode === 'edit' ? sheet.category.id : `new-${sheet.kind}`}
            category={sheet.mode === 'edit' ? sheet.category : null}
            kind={sheet.mode === 'edit' ? sheet.category.kind : sheet.kind}
            onDone={() => setSheet(null)}
          />
        )}
      </BottomSheet>
    </>
  );
}

function CategoryForm({ category, kind, onDone }: { category: Category | null; kind: CategoryKind; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'Ellipsis');
  const [color, setColor] = useState(category?.color ?? PICKER_COLORS[0]!);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (category) await updateCategory(category.id, { name, icon, color });
      else await createCategory({ name, icon, color, kind });
      toast(category ? 'Category updated' : 'Category added');
    });

  const toggleArchive = () =>
    run(async () => {
      if (!category) return;
      await setCategoryArchived(category.id, !category.archived);
      toast(category.archived ? 'Category restored' : 'Category archived', {
        label: 'Undo',
        onClick: () => void setCategoryArchived(category.id, category.archived),
      });
    });

  const remove = async () => {
    if (!category) return;
    const used = await categoryUsageCount(category.id);
    if (used > 0) {
      toastError(`Used by ${used} transaction${used === 1 ? '' : 's'} or bills. Archive it instead.`);
      return;
    }
    const ok = await confirm({ title: `Delete “${category.name}”?`, message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true });
    if (ok) await run(async () => deleteCategory(category.id).then(() => toast('Category deleted')));
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
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="off" required />
        </div>
      </div>
      <IconPicker value={icon} onChange={setIcon} color={color} />
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" size="lg" block disabled={busy}>
        {category ? 'Save changes' : 'Add category'}
      </Button>
      {category && (
        <div className="flex gap-2">
          <Button variant="secondary" block disabled={busy} onClick={() => void toggleArchive()}>
            {category.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button variant="danger" block disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}
