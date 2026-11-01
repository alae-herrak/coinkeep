import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { parseAmount, toInputString } from '../../lib/money';

const INPUT_CLASS =
  'block w-full min-h-12 rounded-xl border border-border bg-surface px-3.5 text-base text-text placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-expense';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1.5 text-sm text-expense">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-msg`} className="mt-1.5 text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextField({ label, hint, error, className = '', ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${INPUT_CLASS} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

interface AmountFieldProps {
  label: string;
  /** Centimes, or null when empty. */
  value: number | null;
  onChange: (centimes: number | null) => void;
  allowNegative?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Text field for money that accepts "1250", "1 250,50" or "1250.5".
 * Reports centimes (or null) to the parent; shows an error for unparseable text.
 */
export function AmountField({ label, value, onChange, allowNegative, hint, placeholder = '0,00', autoFocus }: AmountFieldProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : toInputString(value));
  const [error, setError] = useState<string | null>(null);

  // Keep the text in sync when the parent changes the value (e.g. a reset),
  // without touching what the user is typing when it already matches.
  useEffect(() => {
    setText((current) => {
      const parsed = parseAmount(current);
      const effective = parsed !== null && (parsed >= 0 || allowNegative) ? parsed : null;
      if (effective === value) return current;
      return value === null ? '' : toInputString(value);
    });
  }, [value, allowNegative]);

  const handle = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      setError(null);
      onChange(null);
      return;
    }
    const parsed = parseAmount(raw);
    if (parsed === null) {
      setError('Enter an amount like 1250 or 1250,50');
      onChange(null);
    } else if (parsed < 0 && !allowNegative) {
      setError('Enter a positive amount');
      onChange(null);
    } else {
      setError(null);
      onChange(parsed);
    }
  };

  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => handle(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={`${INPUT_CLASS} tabular pr-12`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium text-muted">DH</span>
      </div>
    </FieldShell>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function SelectField({ label, hint, className = '', children, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select id={id} className={`${INPUT_CLASS} appearance-auto ${className}`} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function DateField({ label, ...rest }: Omit<TextFieldProps, 'type'>) {
  return <TextField label={label} type="date" {...rest} />;
}
