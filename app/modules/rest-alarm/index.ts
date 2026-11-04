import { requireOptionalNativeModule } from 'expo-modules-core';

// Android only (see expo-module.config.json) — this exists specifically to bypass the
// notification-channel-based sound pipeline (see restTimerNotifications.ts's history of that
// approach). On iOS this native module is never linked, so `requireOptionalNativeModule`
// returns null and every export below silently no-ops; iOS keeps using expo-notifications.
interface RestAlarmModuleType {
  scheduleRestAlarm(triggerAtMillis: number, soundEnabled: boolean, headphonesOnly: boolean): void;
  cancelRestAlarm(): void;
  clearRestAlarmNotification(): void;
}

const RestAlarmNativeModule = requireOptionalNativeModule<RestAlarmModuleType>('RestAlarm');

// Schedules a one-shot alarm at `triggerAtMillis` (epoch ms). When it fires — even if the app
// is backgrounded or fully closed — a foreground service posts a "Rest complete" notification
// and, if `soundEnabled`, plays the bundled alert sound directly via MediaPlayer on the Alarm
// audio stream with an explicit audio-focus request. Only one rest alarm is ever pending at a
// time (scheduling a new one implicitly replaces any previous one — same PendingIntent request
// code on the native side), so there's no id to track.
// `headphonesOnly`: never play through the speaker — the sound is skipped unless headphones are
// connected when the alarm fires, and plays on the Media stream (which Android never duplicates
// to the speaker) instead of the Alarm stream.
export function scheduleRestAlarm(
  triggerAtMillis: number,
  soundEnabled: boolean,
  headphonesOnly: boolean,
): void {
  RestAlarmNativeModule?.scheduleRestAlarm(triggerAtMillis, soundEnabled, headphonesOnly);
}

export function cancelRestAlarm(): void {
  RestAlarmNativeModule?.cancelRestAlarm();
}

// Clears the "Rest complete" notification if one is currently showing. Meant to be called
// whenever the app comes to the foreground, regardless of how — this is the reliable way to
// clear it (routing the clear through the notification's own tap action broke the app from
// reopening at all; see RestAlarmService.kt's content-intent comment). A safe no-op if there's
// nothing to clear.
export function clearRestAlarmNotification(): void {
  RestAlarmNativeModule?.clearRestAlarmNotification();
}

export function isRestAlarmAvailable(): boolean {
  return RestAlarmNativeModule != null;
}
