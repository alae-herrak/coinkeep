import { useRef, type ReactNode } from 'react';
import { Check, Delete, Minus, Plus } from 'lucide-react';
import type { KeypadKey } from '../../lib/keypad';

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  onSave: () => void;
  saveLabel: string;
  saveDisabled?: boolean;
}

const LONG_PRESS_MS = 500;

function Key({
  children,
  label,
  onPress,
  className = '',
}: {
  children: ReactNode;
  label?: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={`flex h-[clamp(2.75rem,7dvh,3.5rem)] select-none items-center justify-center rounded-2xl text-2xl font-medium transition active:scale-[0.97] ${className || 'bg-surface-2 hover:brightness-95 dark:hover:brightness-125'}`}
    >
      {children}
    </button>
  );
}

/**
 * Large calculator-style keypad:
 *   7 8 9 ⌫
 *   4 5 6 −
 *   1 2 3 +
 *   , 0 [Save]
 * Long-press ⌫ clears everything.
 */
export function Keypad({ onKey, onSave, saveLabel, saveDisabled }: KeypadProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startBackspace = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onKey('clear');
    }, LONG_PRESS_MS);
  };
  const endBackspace = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const digit = (d: KeypadKey) => (
    <Key key={d} onPress={() => onKey(d)}>
      {d}
    </Key>
  );

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Amount keypad">
      {digit('7')}
      {digit('8')}
      {digit('9')}
      <button
        type="button"
        aria-label="Delete last digit (hold to clear)"
        onPointerDown={startBackspace}
        onPointerUp={endBackspace}
        onPointerLeave={endBackspace}
        onPointerCancel={endBackspace}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (!longPressed.current) onKey('back');
          longPressed.current = false;
        }}
        className="flex h-[clamp(2.75rem,7dvh,3.5rem)] select-none items-center justify-center rounded-2xl bg-surface-2 text-muted transition hover:brightness-95 active:scale-[0.97] dark:hover:brightness-125"
      >
        <Delete size={24} aria-hidden />
      </button>
      {digit('4')}
      {digit('5')}
      {digit('6')}
      <Key label="Minus" onPress={() => onKey('-')} className="bg-accent-soft text-accent">
        <Minus size={22} aria-hidden />
      </Key>
      {digit('1')}
      {digit('2')}
      {digit('3')}
      <Key label="Plus" onPress={() => onKey('+')} className="bg-accent-soft text-accent">
        <Plus size={22} aria-hidden />
      </Key>
      <Key label="Decimal comma" onPress={() => onKey(',')}>
        ,
      </Key>
      {digit('0')}
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="col-span-2 flex h-[clamp(2.75rem,7dvh,3.5rem)] items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-semibold text-accent-fg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
      >
        <Check size={22} aria-hidden />
        {saveLabel}
      </button>
    </div>
  );
}
