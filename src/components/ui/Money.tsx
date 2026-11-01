import { formatMAD, formatMADCompact, type SignDisplay } from '../../lib/money';

type Tone = 'neutral' | 'income' | 'expense' | 'accent' | 'muted' | 'auto';

const TONES: Record<Exclude<Tone, 'auto'>, string> = {
  neutral: '',
  income: 'text-income',
  expense: 'text-expense',
  accent: 'text-accent',
  muted: 'text-muted',
};

interface MoneyProps {
  /** Centimes. */
  amount: number;
  sign?: SignDisplay;
  /** 'auto' = green when positive, red when negative. Signs are always shown alongside color. */
  tone?: Tone;
  compact?: boolean;
  decimals?: boolean;
  className?: string;
}

export function Money({ amount, sign = 'auto', tone = 'neutral', compact, decimals, className = '' }: MoneyProps) {
  const resolved = tone === 'auto' ? (amount > 0 ? 'income' : amount < 0 ? 'expense' : 'neutral') : tone;
  const text = compact ? formatMADCompact(amount, { sign }) : formatMAD(amount, { sign, decimals });
  return <span className={`tabular whitespace-nowrap ${TONES[resolved]} ${className}`}>{text}</span>;
}
