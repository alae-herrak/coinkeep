import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { db } from '../../db/db';
import { checkPin } from '../../data/pinSettings';
import { lockoutMs, MAX_ATTEMPTS, PIN_MAX } from '../../lib/pin';
import { useLock } from '../../store/lock';
import { confirm, vibrate } from '../../store/ui';

const ATTEMPTS_KEY = 'coinkeep-pin-attempts';

/** Wrong-attempt counter survives reloads so the back-off can't be skipped by refreshing. */
function readAttempts(): { failed: number; rounds: number; until: number } {
  try {
    const v = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '');
    if (typeof v?.failed === 'number' && typeof v?.rounds === 'number' && typeof v?.until === 'number') return v;
  } catch {
    // ignore
  }
  return { failed: 0, rounds: 0, until: 0 };
}

function writeAttempts(v: { failed: number; rounds: number; until: number }) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(v));
  } catch {
    // Storage unavailable: the back-off then only lasts for this session.
  }
}

/** Full-screen PIN pad. Rendered on top of the (inert) app while locked. */
export function LockScreen({ pinLength }: { pinLength: number }) {
  const unlock = useLock((s) => s.unlock);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(readAttempts);
  const [now, setNow] = useState(Date.now());
  const shakeRef = useRef<HTMLDivElement>(null);

  const waitMs = Math.max(0, attempts.until - now);
  useEffect(() => {
    if (waitMs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waitMs]);

  const submit = useCallback(
    async (pin: string) => {
      setChecking(true);
      const ok = await checkPin(pin);
      setChecking(false);
      if (ok) {
        writeAttempts({ failed: 0, rounds: 0, until: 0 });
        unlock();
        return;
      }
      vibrate(80);
      shakeRef.current?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
        { duration: 250 },
      );
      setEntry('');
      const failed = attempts.failed + 1;
      if (failed >= MAX_ATTEMPTS) {
        const rounds = attempts.rounds + 1;
        const next = { failed: 0, rounds, until: Date.now() + lockoutMs(rounds) };
        writeAttempts(next);
        setAttempts(next);
        setNow(Date.now());
        setError('Too many tries.');
      } else {
        const next = { ...attempts, failed };
        writeAttempts(next);
        setAttempts(next);
        setError(`Wrong PIN. ${MAX_ATTEMPTS - failed} ${MAX_ATTEMPTS - failed === 1 ? 'try' : 'tries'} left before a short wait.`);
      }
    },
    [attempts, unlock],
  );

  const press = (key: string) => {
    if (checking || waitMs > 0) return;
    setError(null);
    if (key === 'back') {
      setEntry((e) => e.slice(0, -1));
      return;
    }
    const next = (entry + key).slice(0, PIN_MAX);
    setEntry(next);
    if (next.length === pinLength) void submit(next);
  };

  // Physical keyboard support.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const forgot = async () => {
    const ok = await confirm({
      title: 'Forgot your PIN?',
      message:
        'The only way back in is to erase all Coinkeep data on this phone. If you have a backup file, you can restore it afterwards. This can’t be undone.',
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!ok) return;
    writeAttempts({ failed: 0, rounds: 0, until: 0 });
    db.close();
    await db.delete();
    // Start fresh on Home rather than whatever screen was open.
    location.replace(location.pathname);
  };

  // A modal <dialog> joins the top layer above any sheet that was open when the app locked.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="lock-title"
      className="lock-dialog"
      onCancel={(e) => e.preventDefault()}
      onClose={reopen}
    >
      <div className="pt-safe pb-safe px-safe flex h-full flex-col items-center justify-between">
      <div className="mt-[12vh] flex flex-col items-center text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <Lock size={26} aria-hidden />
        </span>
        {/* Focus lands on the heading (announced by screen readers), not on the "1" key. */}
        <h1 id="lock-title" className="text-xl font-semibold outline-none" tabIndex={-1} autoFocus>
          Enter your PIN
        </h1>
        <div ref={shakeRef} className="mt-6 flex gap-3" aria-hidden>
          {Array.from({ length: pinLength }, (_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 border-accent transition ${i < entry.length ? 'bg-accent' : ''}`} />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {entry.length} of {pinLength} digits entered
        </p>
        <p role="alert" className="mt-4 min-h-10 max-w-xs text-sm text-expense">
          {waitMs > 0 ? `Too many tries. Try again in ${Math.ceil(waitMs / 1000)} s.` : error}
        </p>
      </div>

      <div className="mb-4 w-full max-w-xs">
        <div className="grid grid-cols-3 gap-3" role="group" aria-label="PIN keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <PadKey key={d} label={d} onPress={() => press(d)} disabled={waitMs > 0}>
              {d}
            </PadKey>
          ))}
          <span />
          <PadKey label="0" onPress={() => press('0')} disabled={waitMs > 0}>
            0
          </PadKey>
          <PadKey label="Delete last digit" onPress={() => press('back')} disabled={waitMs > 0} subtle>
            <Delete size={24} aria-hidden />
          </PadKey>
        </div>
        <button type="button" onClick={() => void forgot()} className="mx-auto mt-4 block min-h-11 px-4 text-sm font-medium text-muted underline-offset-2 hover:underline">
          Forgot PIN?
        </button>
        <p className="mt-1 text-center text-xs text-muted">The PIN is a privacy screen. Your data isn’t encrypted.</p>
      </div>
      </div>
    </dialog>
  );
}

/**
 * Android back can close a modal dialog even when its cancel event is prevented
 * (no recent tap). A lock that can be swiped away isn't a lock: open it again.
 */
function reopen(e: React.SyntheticEvent<HTMLDialogElement>) {
  const d = e.currentTarget;
  if (d.isConnected && !d.open) d.showModal();
}

/** Plain cover shown while the app is in the background, so the app switcher shows no balances. */
export function PrivacyCover() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-label="Coinkeep is hidden" className="lock-dialog" onCancel={(e) => e.preventDefault()} onClose={reopen}>
      <div className="flex h-full items-center justify-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-fg">
          <Lock size={28} aria-hidden />
        </span>
      </div>
    </dialog>
  );
}

function PadKey({ children, label, onPress, disabled, subtle }: { children: React.ReactNode; label: string; onPress: () => void; disabled?: boolean; subtle?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      disabled={disabled}
      className={`flex h-16 select-none items-center justify-center rounded-full text-2xl font-medium transition active:scale-95 disabled:opacity-40 ${subtle ? 'text-muted' : 'bg-surface-2'}`}
    >
      {children}
    </button>
  );
}
