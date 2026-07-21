import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Cycle } from '../services/api';
import { getOrCreateActiveCycle, startNewCycle as startNewCycleDb } from '../db/cycles';
import { getSettings } from '../db/settings';
import { scheduleRestCompleteNotification, cancelRestNotification } from '../services/restTimerNotifications';

// TODO: replace with real user from auth
export const USER_ID = 1;

interface AppContextType {
  userId: number;
  activeCycle: Cycle | null;
  refreshCycle: () => Promise<void>;
  startNewCycle: () => Promise<void>;
  // Rest timer: endAt is an epoch-ms timestamp (not a countdown that needs its own ticking
  // state) so it stays correct across the app being backgrounded and resumed.
  restTimerEndAt: number | null;
  startRestTimer: () => Promise<void>;
  cancelRestTimer: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeCycle, setActiveCycle] = useState<Cycle | null>(null);
  const [restTimerEndAt, setRestTimerEndAt] = useState<number | null>(null);
  const notificationIdRef = useRef<string | null>(null);

  const refreshCycle = useCallback(async () => {
    const cycle = await getOrCreateActiveCycle();
    setActiveCycle(cycle);
  }, []);

  const startNewCycle = useCallback(async () => {
    const cycle = await startNewCycleDb();
    setActiveCycle(cycle);
  }, []);

  // Also used when the countdown naturally reaches zero — cancelling an already-fired
  // notification is a harmless no-op, so one function covers "skip early" and "finished".
  const cancelRestTimer = useCallback(() => {
    setRestTimerEndAt(null);
    if (notificationIdRef.current) {
      cancelRestNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  }, []);

  const startRestTimer = useCallback(async () => {
    if (notificationIdRef.current) {
      await cancelRestNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }
    const settings = await getSettings();
    if (!settings.rest_timer_enabled) return;
    const seconds = settings.rest_timer_seconds;
    setRestTimerEndAt(Date.now() + seconds * 1000);
    notificationIdRef.current = await scheduleRestCompleteNotification(seconds, settings.rest_timer_sound_enabled);
  }, []);

  // Pre-fetch on app open so screens have data immediately
  useEffect(() => {
    refreshCycle();
  }, []);

  return (
    <AppContext.Provider value={{
      userId: USER_ID,
      activeCycle,
      refreshCycle,
      startNewCycle,
      restTimerEndAt,
      startRestTimer,
      cancelRestTimer,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
