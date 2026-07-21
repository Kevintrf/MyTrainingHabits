// Schedules the "rest complete" local notification (sound + banner) that fires even if
// the app is backgrounded or closed. Expo's notification API can't render a live-updating
// countdown inside the notification itself (that's a native Android "chronometer" style,
// not exposed here) — the in-app countdown lives in RestTimerBanner instead. This module
// is only responsible for the single notification that fires when the rest period ends.
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

// Filename (with extension) of the bundled alert sound, registered via the
// expo-notifications config plugin's `sounds` array in app.json. On Android it's copied
// into res/raw (basename only, extension stripped when resolving). On iOS it's copied into
// the bundle and referenced with its extension — custom iOS notification sounds officially
// only support aiff/wav/caf, so an mp3 may fall back to the system default there; Android
// (the primary target for this app) plays it correctly either way.
const SOUND_FILE = 'rest_timer_alert.mp3';

// Android 8+ (API 26+) ignores any sound set on an individual notification — it's the
// *channel's* sound that plays, fixed at channel-creation time. So toggling sound on/off
// can't be done per-notification; instead we maintain two channels and pick between them.
//
// The sound channel's AudioAttributes usage is ALARM (not the default NOTIFICATION), so once
// it's allowed to play, it's the Alarm volume slider that governs it, not Ring/Notification —
// the same stream real alarm-clock apps use. That's necessary but not sufficient: a device in
// Do-Not-Disturb / a "Silent"-style sound mode (as opposed to just "Vibrate") can suppress a
// notification's sound entirely *before* stream routing is even considered, regardless of
// which stream it would have used. The channel also sets `bypassDnd: true` for that reason —
// the officially-sanctioned way for a specific channel to be allowed through Do Not Disturb —
// but it only takes effect once the user grants this app "Do Not Disturb access" via
// `openNotificationPolicySettings()` below (a special access toggle, same category as the
// exact-alarm permission: no runtime prompt, no JS API to check current grant status, just a
// deep link to the right settings screen).
//
// `flags.enforceAudibility` maps to Android's `AudioAttributes.FLAG_AUDIBILITY_ENFORCED` —
// documented as forcing the sound to be audible regardless of the current stream volume/mute
// state. Added because usage=ALARM alone turned out not to be enough on at least one real
// device (Samsung One UI, ringer mode "Vibrate"): standard Android says ringer mode shouldn't
// touch the Alarm stream at all, but evidently something in that OEM's audio stack still
// suppressed it. This flag is the one AudioAttributes knob left that's explicitly documented
// for "ensure audibility no matter what."
//
// Channel ids are versioned (v4) and old ones explicitly deleted on setup, on purpose:
// Android locks a channel's sound/importance/audio-attributes/bypassDnd the moment it's first
// created — the app can never change them again, only the user can via system Settings. Any
// device that already saw an old channel id (from testing this feature before a given fix)
// would keep its original settings forever no matter what this file schedules now. Bump the
// version suffix again if channel-level config ever changes here in the future.
const CHANNEL_ID_SOUND = 'rest-timer-v4';
const CHANNEL_ID_SILENT = 'rest-timer-v4-silent';
const RETIRED_CHANNEL_IDS = [
  'rest-timer',
  'rest-timer-silent',
  'rest-timer-alarm',
  'rest-timer-alarm-silent',
  'rest-timer-v3',
  'rest-timer-v3-silent',
];

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

// Requests permission (if not already granted/denied) and sets up the Android channels.
// Safe to call repeatedly. Returns whether notifications can actually be shown.
async function ensureNotificationSetup(): Promise<boolean> {
  configureHandler();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID_SOUND, {
      name: 'Rest Timer Alert',
      description: 'Plays like an alarm — audible even in vibrate/silent/Do Not Disturb mode and over other audio, once Do Not Disturb access is granted in Settings.',
      importance: Notifications.AndroidImportance.HIGH,
      bypassDnd: true,
      sound: SOUND_FILE,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        flags: {
          enforceAudibility: true,
          requestHardwareAudioVideoSynchronization: false,
        },
      },
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ID_SILENT, {
      name: 'Rest Timer Alert (silent)',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
    });
    for (const oldId of RETIRED_CHANNEL_IDS) {
      try {
        await Notifications.deleteNotificationChannelAsync(oldId);
      } catch {
        // never existed on this install — fine
      }
    }
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  if (!existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

// Schedules the rest-complete notification `seconds` from now. Returns the notification
// id (needed to cancel it if the timer is skipped/restarted early), or null if
// notification permission isn't available — the in-app countdown still works either way.
export async function scheduleRestCompleteNotification(
  seconds: number,
  soundEnabled: boolean,
): Promise<string | null> {
  const granted = await ensureNotificationSetup();
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
      channelId: soundEnabled ? CHANNEL_ID_SOUND : CHANNEL_ID_SILENT,
    },
  });
}

export async function cancelRestNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // already fired or already cancelled — nothing to do
  }
}

// On Android 12+, without the SCHEDULE_EXACT_ALARM permission, the OS schedules the rest
// notification as an "inexact" alarm — it's allowed to defer it for battery savings, which
// on some devices (Samsung's One UI is a known offender) can add tens of seconds of delay,
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

// "Do Not Disturb access" — a special app access toggle (not a runtime permission prompt),
// required for the sound channel's `bypassDnd: true` to actually take effect. Without it,
// a device in Do Not Disturb or a "Silent"-style sound mode can suppress the rest-complete
// sound entirely, before the channel's Alarm-stream routing even comes into play. As with
// exact-alarm access, there's no JS API to check current grant status, so this just opens
// the right settings screen directly instead of the app's generic settings page.
export async function openNotificationPolicySettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS');
  } catch {
    await Linking.openSettings();
  }
}
