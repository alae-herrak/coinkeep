import { Check } from 'lucide-react';
import { getIcon, ICON_NAMES, PICKER_COLORS } from '../../lib/icons';

/** Splits "ShoppingCart" into "shopping cart" for screen readers. */
function iconLabel(name: string) {
  return name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
}

export function IconPicker({ value, onChange, color, names = ICON_NAMES }: { value: string; onChange: (icon: string) => void; color: string; names?: readonly string[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Icon</legend>
      <div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto overscroll-contain rounded-xl p-0.5 sm:grid-cols-8">
        {names.map((name) => {
          const Icon = getIcon(name);
          const selected = name === value;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={selected}
              aria-label={iconLabel(name)}
              onClick={() => onChange(name)}
              className={`flex aspect-square min-h-11 items-center justify-center rounded-xl border transition ${
                selected ? 'border-transparent ring-2 ring-offset-2 ring-offset-surface' : 'border-border hover:bg-surface-2'
              }`}
              style={selected ? { backgroundColor: `${color}22`, color, ['--tw-ring-color' as string]: color } : undefined}
            >
              <Icon size={20} aria-hidden />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ColorPicker({ value, onChange, colors = PICKER_COLORS }: { value: string; onChange: (color: string) => void; colors?: readonly string[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Color</legend>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
        {colors.map((c, i) => {
          const selected = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              aria-pressed={selected}
              aria-label={`Color ${i + 1}`}
              onClick={() => onChange(c)}
              className="flex aspect-square min-h-11 items-center justify-center rounded-full transition hover:scale-105"
              style={{ backgroundColor: c, boxShadow: selected ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : undefined }}
            >
              {selected && <Check size={18} aria-hidden className="text-white" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
