type Tone = 'accent' | 'ok' | 'warning' | 'over' | 'custom';

const TONES: Record<Exclude<Tone, 'custom'>, string> = {
  accent: 'bg-accent',
  ok: 'bg-income',
  warning: 'bg-warn',
  over: 'bg-expense',
};

interface ProgressBarProps {
  /** 0..1 (values above 1 render as full). */
  value: number;
  /** Accessible name, e.g. "Groceries budget". */
  label: string;
  /** Human-readable value for screen readers, e.g. "450 of 1 000 DH". */
  valueText?: string;
  tone?: Tone;
  color?: string;
  className?: string;
  /** 0..1: draws a thin "today" tick at this point (budget pace). */
  marker?: number;
}

export function ProgressBar({ value, label, valueText, tone = 'accent', color, className = '', marker }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={valueText}
      className={`relative h-2 overflow-hidden rounded-full bg-surface-2 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'custom' ? '' : TONES[tone]}`}
        style={{ width: `${pct}%`, backgroundColor: tone === 'custom' ? color : undefined }}
      />
      {marker !== undefined && marker > 0 && marker < 1 && (
        // Ring in the track colour keeps the tick visible over the filled part too.
        <span
          aria-hidden
          className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-text/70 ring-1 ring-surface"
          style={{ left: `${marker * 100}%` }}
        />
      )}
    </div>
  );
}
