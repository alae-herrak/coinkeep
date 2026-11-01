import { useEffect, useState } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { AddRedirect, AppLayout } from './components/layout/AppLayout';
import { Toaster } from './components/ui/Toaster';
import { ConfirmHost } from './components/ui/ConfirmHost';
import { LockScreen, PrivacyCover } from './components/lock/LockScreen';
import { UpdatePrompt } from './components/pwa/UpdatePrompt';
import { HomeScreen } from './screens/HomeScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { BudgetsScreen } from './screens/BudgetsScreen';
import { BillsScreen } from './screens/BillsScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { GoalDetailScreen } from './screens/GoalDetailScreen';
import { PaycheckScreen } from './screens/PaycheckScreen';
import { useThemeSync } from './lib/theme';
import { useLock } from './store/lock';
import { useAutoLock, useRequestPersistentStorageOnce } from './hooks/appShell';

// Hash routing ("#/transactions") works on any static host and under any subpath.
const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'transactions', element: <TransactionsScreen /> },
      // Charts (Recharts) are heavy, so Insights loads on demand; the service worker still precaches it for offline use.
      { path: 'insights', lazy: () => import('./screens/InsightsScreen').then((m) => ({ Component: m.InsightsScreen })) },
      { path: 'goals', element: <GoalsScreen /> },
      { path: 'goals/:id', element: <GoalDetailScreen /> },
      { path: 'paycheck', element: <PaycheckScreen /> },
      // Target of the "Add expense" home-screen shortcut.
      { path: 'add/:type', element: <AddRedirect /> },
      { path: 'more', element: <MoreScreen /> },
      { path: 'budgets', element: <BudgetsScreen /> },
      { path: 'bills', element: <BillsScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      // Settings sub-screens are visited rarely: load on demand (still precached for offline use).
      { path: 'settings/accounts', lazy: () => import('./screens/settings/AccountsScreen').then((m) => ({ Component: m.AccountsScreen })) },
      { path: 'settings/categories', lazy: () => import('./screens/settings/CategoriesScreen').then((m) => ({ Component: m.CategoriesScreen })) },
      { path: 'settings/paychecks', lazy: () => import('./screens/settings/PaycheckTemplatesScreen').then((m) => ({ Component: m.PaycheckTemplatesScreen })) },
      { path: 'settings/security', lazy: () => import('./screens/settings/SecurityScreen').then((m) => ({ Component: m.SecurityScreen })) },
      { path: 'settings/data', lazy: () => import('./screens/settings/DataScreen').then((m) => ({ Component: m.DataScreen })) },
      { path: '*', element: <HomeScreen /> },
    ],
  },
]);

interface Boot {
  onboardingDone: boolean;
  /** Digits in the PIN, or null when no PIN is set. */
  pinLength: number | null;
}

async function readBoot(): Promise<Boot> {
  const [onboarding, pinHash, pinLength] = await Promise.all([db.settings.get('onboardingDone'), db.settings.get('pinHash'), db.settings.get('pinLength')]);
  return {
    onboardingDone: onboarding?.value === true,
    pinLength: pinHash?.value ? ((pinLength?.value as number | null) ?? 4) : null,
  };
}

export function App() {
  useThemeSync();
  useRequestPersistentStorageOnce();
  // 'loading' distinguishes "not read yet" from a missing setting.
  const boot = useLiveQuery(readBoot, [], 'loading' as const);
  const locked = useLock((s) => s.locked);
  const covered = useLock((s) => s.covered);
  const pinLength = boot === 'loading' ? null : boot.pinLength;
  // Lock before the first render of any money screen, so balances never flash on open.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (boot === 'loading' || ready) return;
    if (boot.pinLength !== null) useLock.getState().lock();
    setReady(true);
  }, [boot, ready]);

  // Turning the PIN off from Settings must never leave a stale lock behind.
  useEffect(() => {
    if (ready && pinLength === null) useLock.getState().unlock();
  }, [ready, pinLength]);

  useAutoLock(pinLength !== null);

  return (
    <>
      {ready && boot !== 'loading' && (boot.onboardingDone ? <RouterProvider router={router} /> : <OnboardingScreen />)}
      {ready && locked && pinLength !== null && <LockScreen pinLength={pinLength} />}
      {covered && !locked && <PrivacyCover />}
      <Toaster />
      <ConfirmHost />
      <UpdatePrompt />
    </>
  );
}
