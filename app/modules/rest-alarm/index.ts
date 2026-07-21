import { requireOptionalNativeModule } from 'expo-modules-core';

// Android only (see expo-module.config.json) — this exists specifically to bypass the
// notification-channel-based sound pipeline (see restTimerNotifications.ts's history of that
// approach). On iOS this native module is never linked, so `requireOptionalNativeModule`
// returns null and every export below silently no-ops; iOS keeps using expo-notifications.
interface RestAlarmModuleType {
  scheduleRestAlarm(triggerAtMillis: number, soundEnabled: boolean): void;
  cancelRestAlarm(): void;
}

const RestAlarmNativeModule = requireOptionalNativeModule<RestAlarmModuleType>('RestAlarm');

// Schedules a one-shot alarm at `triggerAtMillis` (epoch ms). When it fires — even if the app
// is backgrounded or fully closed — a foreground service posts a "Rest complete" notification
// and, if `soundEnabled`, plays the bundled alert sound directly via MediaPlayer on the Alarm
// audio stream with an explicit audio-focus request. Only one rest alarm is ever pending at a
// time (scheduling a new one implicitly replaces any previous one — same PendingIntent request
// code on the native side), so there's no id to track.
export function scheduleRestAlarm(triggerAtMillis: number, soundEnabled: boolean): void {
  RestAlarmNativeModule?.scheduleRestAlarm(triggerAtMillis, soundEnabled);
}

export function cancelRestAlarm(): void {
  RestAlarmNativeModule?.cancelRestAlarm();
}

export function isRestAlarmAvailable(): boolean {
  return RestAlarmNativeModule != null;
}
