import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Cycle } from '../services/api';
import { getOrCreateActiveCycle, startNewCycle as startNewCycleDb } from '../db/cycles';
import { getSettings } from '../db/settings';
import { scheduleRestCompleteNotification, cancelRestNotification, clearLingeringRestNotification } from '../services/restTimerNotifications';

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
  // Explicit early stop (the banner's "Skip" button) — also tells the platform layer to
  // cancel/stop the scheduled alert itself.
  cancelRestTimer: () => void;
  // The countdown reaching zero on its own — the scheduled alert is expected to fire (or, on
  // Android, may already be actively playing) right around now; this only clears the in-app
  // banner's local state and must NOT call into cancelRestTimer's platform-cancel path. See
  // cancelRestTimer's own comment for why that distinction matters.
  dismissRestTimerBanner: () => void;
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

  // Explicit early stop only (the "Skip" button) — NOT for when the countdown naturally
  // finishes. On Android, cancelling isn't a harmless no-op on an already-fired alert the way
  // the old expo-notifications-based version was: it actively stops a live foreground service
  // that may be mid-playback (see modules/rest-alarm). Calling this exactly when the timer
  // would have ended anyway raced with — and killed — the native alert, which is why sound
  // never played while the app was open. Natural completion uses dismissRestTimerBanner
  // instead, which never touches the platform layer.
  const cancelRestTimer = useCallback(() => {
    setRestTimerEndAt(null);
    if (notificationIdRef.current) {
      cancelRestNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    }
  }, []);

  const dismissRestTimerBanner = useCallback(() => {
    setRestTimerEndAt(null);
    notificationIdRef.current = null;
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
    notificationIdRef.current = await scheduleRestCompleteNotification(
      seconds,
      settings.rest_timer_sound_enabled,
      settings.rest_timer_headphones_only,
    );
  }, []);

  // Pre-fetch on app open so screens have data immediately
  useEffect(() => {
    refreshCycle();
  }, []);

  // Clears a lingering "Rest complete" notification whenever the app is or becomes
  // foregrounded — cold launch (e.g. tapping the notification opened the app fresh, so there's
  // no prior AppState to transition from) and every later background→foreground resume alike.
  // Deliberately decoupled from the notification's own tap action — see
  // restTimerNotifications.ts's clearLingeringRestNotification for why.
  useEffect(() => {
    clearLingeringRestNotification();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearLingeringRestNotification();
      }
    });
    return () => subscription.remove();
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
      dismissRestTimerBanner,
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
