import { db, getSetting, setSetting } from '../db/db';
import { hashPin, isValidPin, newSalt, verifyPin } from '../lib/pin';
import { UserFacingError } from './errors';

export async function isPinEnabled(): Promise<boolean> {
  return !!(await getSetting('pinHash'));
}

export async function checkPin(pin: string): Promise<boolean> {
  const [hash, salt] = await Promise.all([getSetting('pinHash'), getSetting('pinSalt')]);
  if (!hash || !salt) return true;
  return verifyPin(pin, salt, hash);
}

/** Sets or changes the PIN. When one exists, the current PIN must be given. */
export async function setPin(newPin: string, currentPin?: string): Promise<void> {
  if (!isValidPin(newPin)) throw new UserFacingError('Use 4 to 6 digits.');
  if ((await isPinEnabled()) && !(await checkPin(currentPin ?? ''))) throw new UserFacingError('The current PIN is wrong.');
  const salt = newSalt();
  const hash = await hashPin(newPin, salt);
  await db.transaction('rw', db.settings, async () => {
    await setSetting('pinSalt', salt);
    await setSetting('pinHash', hash);
    await setSetting('pinLength', newPin.length);
  });
}

export async function removePin(currentPin: string): Promise<void> {
  if (!(await checkPin(currentPin))) throw new UserFacingError('The current PIN is wrong.');
  await db.transaction('rw', db.settings, async () => {
    await setSetting('pinHash', null);
    await setSetting('pinSalt', null);
    await setSetting('pinLength', null);
  });
}
