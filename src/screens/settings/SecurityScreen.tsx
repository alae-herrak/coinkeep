import { useState } from 'react';
import { Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { removePin, setPin } from '../../data/pinSettings';
import { errorMessage } from '../../data/errors';
import { useSetting } from '../../hooks/data';
import { PIN_MAX, PIN_MIN, isValidPin } from '../../lib/pin';
import { toast, toastError } from '../../store/ui';
import { PageHeader } from '../../components/ui/PageHeader';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Fields';

type Mode = 'set' | 'change' | 'remove' | null;

export function SecurityScreen() {
  const pinHash = useSetting('pinHash');
  const [mode, setMode] = useState<Mode>(null);
  const enabled = !!pinHash;

  return (
    <>
      <PageHeader title="PIN lock" backTo="/settings" backLabel="Back to settings" />

      <section className="rounded-card bg-surface p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${enabled ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
            {enabled ? <Lock size={22} aria-hidden /> : <LockOpen size={22} aria-hidden />}
          </span>
          <div>
            <p className="font-semibold">PIN lock is {enabled ? 'on' : 'off'}</p>
            <p className="text-sm text-muted">{enabled ? 'Asked when you open Coinkeep and after 30 seconds away.' : 'Anyone holding your unlocked phone can open Coinkeep.'}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {enabled ? (
            <>
              <Button variant="secondary" block onClick={() => setMode('change')}>
                Change PIN
              </Button>
              <Button variant="danger" block onClick={() => setMode('remove')}>
                Turn off PIN lock
              </Button>
            </>
          ) : (
            <Button block onClick={() => setMode('set')}>
              Set a PIN
            </Button>
          )}
        </div>
      </section>

      <div className="mt-4 flex gap-3 rounded-card bg-warn-soft p-4 text-sm">
        <ShieldAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="font-semibold">A privacy screen, not encryption</p>
          <p className="mt-1 text-muted">
            The PIN keeps people who pick up your phone out of the app. Your data itself isn’t encrypted: someone with access to the browser’s storage
            could still read it. If you forget the PIN, the only way in is to erase the app’s data — so keep a backup.
          </p>
        </div>
      </div>

      <BottomSheet open={mode !== null} onClose={() => setMode(null)} title={mode === 'remove' ? 'Turn off PIN lock' : mode === 'change' ? 'Change PIN' : 'Set a PIN'}>
        {mode && <PinForm key={mode} mode={mode} onDone={() => setMode(null)} />}
      </BottomSheet>
    </>
  );
}

const pinInputProps = {
  type: 'password',
  inputMode: 'numeric',
  autoComplete: 'off',
  pattern: '[0-9]*',
  maxLength: PIN_MAX,
} as const;

function PinForm({ mode, onDone }: { mode: Exclude<Mode, null>; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const needsCurrent = mode !== 'set';
  const needsNew = mode !== 'remove';
  const digitsOnly = (v: string) => v.replace(/\D/g, '').slice(0, PIN_MAX);

  const newError = next && !isValidPin(next) ? `Use ${PIN_MIN} to ${PIN_MAX} digits.` : null;
  const confirmError = confirmPin && confirmPin !== next ? 'The PINs don’t match.' : null;
  const valid = (!needsCurrent || current.length >= PIN_MIN) && (!needsNew || (isValidPin(next) && next === confirmPin));

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'remove') {
        await removePin(current);
        toast('PIN lock turned off');
      } else {
        await setPin(next, needsCurrent ? current : undefined);
        toast(mode === 'set' ? 'PIN lock is on' : 'PIN changed');
      }
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      {needsCurrent && <TextField label="Current PIN" value={current} onChange={(e) => setCurrent(digitsOnly(e.target.value))} autoFocus {...pinInputProps} />}
      {needsNew && (
        <>
          <TextField
            label="New PIN"
            value={next}
            onChange={(e) => setNext(digitsOnly(e.target.value))}
            hint={`${PIN_MIN} to ${PIN_MAX} digits`}
            error={newError}
            autoFocus={!needsCurrent}
            {...pinInputProps}
          />
          <TextField label="Repeat new PIN" value={confirmPin} onChange={(e) => setConfirmPin(digitsOnly(e.target.value))} error={confirmError} {...pinInputProps} />
        </>
      )}
      <Button type="submit" size="lg" block variant={mode === 'remove' ? 'danger' : 'primary'} disabled={busy || !valid}>
        {mode === 'remove' ? 'Turn off' : mode === 'change' ? 'Change PIN' : 'Turn on PIN lock'}
      </Button>
    </form>
  );
}
