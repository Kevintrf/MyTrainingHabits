// Schedules the "rest complete" alert that fires even if the app is backgrounded or closed.
//
// Android and iOS take genuinely different paths here, not just different config:
//
// - Android uses the local `rest-alarm` native module (app/modules/rest-alarm), which plays
//   the sound itself via MediaPlayer directly on the Alarm audio stream, triggered by a native
//   AlarmManager + BroadcastReceiver + foreground service — entirely outside the notification
//   system. This was a deliberate escalation, not the first attempt: a notification-channel
//   sound (even with AudioAttributes usage=ALARM, bypassDnd, and enforceAudibility all set —
//   see git history / CHANGELOG for that whole saga) still didn't reliably survive this
//   project's test device's "Vibrate" sound mode. Playing the sound directly, the same way the
//   OS's own Alarm app does, was the only thing left that could plausibly fix that.
// - iOS has no equivalent local module (`rest-alarm` is Android-only — see its
//   expo-module.config.json) and keeps using a plain expo-notifications scheduled notification.
//   iOS was never the device this was debugged against; this keeps its previous behavior
//   (including the known aiff/wav/caf-only custom-sound limitation) unchanged.
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { scheduleRestAlarm, cancelRestAlarm, clearRestAlarmNotification } from 'rest-alarm';

// Filename (with extension) of the bundled alert sound, registered via the expo-notifications
// config plugin's `sounds` array in app.json — that's what actually copies the file into
// Android's res/raw (which the native module reads directly by resource name) and into the
// iOS bundle.
const SOUND_FILE = 'rest_timer_alert.mp3';

const ANDROID_ALARM_HANDLE = 'android-rest-alarm';

let handlerConfigured = false;

function configureHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Requests notification permission (if not already granted/denied). Needed on both platforms:
// iOS to show/sound its scheduled notification at all, Android so the rest-alarm foreground
// service's own "Rest complete" banner is visible (Android 13+ requires POST_NOTIFICATIONS for
// any notification to display — though on Android the alert *sound* plays regardless, since
// it's driven directly by MediaPlayer, not gated by this permission).
async function ensureNotificationPermission(): Promise<boolean> {
  configureHandler();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

// Schedules the rest-complete alert `seconds` from now. Returns a handle (needed to cancel it
// if the timer is skipped/restarted early), or null if notification permission isn't
// available — the in-app countdown still works either way.
export async function scheduleRestCompleteNotification(
  seconds: number,
  soundEnabled: boolean,
): Promise<string | null> {
  const granted = await ensureNotificationPermission();

  if (Platform.OS === 'android') {
    scheduleRestAlarm(Date.now() + Math.max(1, seconds) * 1000, soundEnabled);
    return granted ? ANDROID_ALARM_HANDLE : null;
  }

  if (!granted) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rest complete',
      body: 'Time for your next set.',
      sound: soundEnabled ? SOUND_FILE : false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, seconds),
    },
  });
}

export async function cancelRestNotification(notificationId: string): Promise<void> {
  if (Platform.OS === 'android') {
    cancelRestAlarm();
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // already fired or already cancelled — nothing to do
  }
}

// Clears a lingering "Rest complete" notification, if any. Call whenever the app comes to the
// foreground (see AppContext's AppState listener) — tapping the notification itself reliably
// reopens the app (see RestAlarmService.kt) but doesn't reliably clear itself, so clearing is
// handled here instead, decoupled from *how* the app was foregrounded. No-op on iOS and a
// safe no-op on Android if there's nothing to clear.
export function clearLingeringRestNotification(): void {
  if (Platform.OS === 'android') {
    clearRestAlarmNotification();
  }
}

// On Android 12+, without the SCHEDULE_EXACT_ALARM permission, the OS schedules the rest
// alarm as an "inexact" alarm — it's allowed to defer it for battery savings, which on some
// devices (Samsung's One UI is a known offender) can add tens of seconds of delay,
// proportionally worse for short timers. The app declares the permission in app.json, but
// on Android 13+ that alone doesn't grant it — the user has to flip it on manually. There's
// no JS API to check current grant status, so this just opens the right settings screen
// directly (Settings → Apps → MyTrainingHabits → Alarms & reminders) rather than the app's
// generic settings page, so the user isn't left hunting for the right toggle.
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch {
    // Older Android versions don't have this settings screen (the permission doesn't
    // exist pre-12, and exact alarms are unrestricted) — fall back to the app's own
    // settings page so there's still somewhere useful to land.
    await Linking.openSettings();
  }
}
