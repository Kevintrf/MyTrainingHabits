package expo.modules.restalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Fixed request code: only one rest alarm is ever pending at a time, so scheduling a new one
// naturally replaces any previous PendingIntent (same code + same Intent action resolves to
// the same PendingIntent under FLAG_UPDATE_CURRENT) rather than needing an id scheme.
private const val REQUEST_CODE = 4271

class RestAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RestAlarm")

    Function("scheduleRestAlarm") { triggerAtMillis: Double, soundEnabled: Boolean ->
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pendingIntent = restAlarmPendingIntent(soundEnabled)

      // Same exact-vs-inexact fallback as expo-notifications' own scheduling delegate
      // (ExpoSchedulingDelegate.kt) — without SCHEDULE_EXACT_ALARM granted on Android 12+,
      // an exact alarm request throws; fall back to inexact rather than crash.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
        AlarmManagerCompat.setExactAndAllowWhileIdle(
          alarmManager,
          AlarmManager.RTC_WAKEUP,
          triggerAtMillis.toLong(),
          pendingIntent
        )
      } else {
        AlarmManagerCompat.setAndAllowWhileIdle(
          alarmManager,
          AlarmManager.RTC_WAKEUP,
          triggerAtMillis.toLong(),
          pendingIntent
        )
      }
    }

    Function("cancelRestAlarm") {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      // The soundEnabled value passed here doesn't matter for cancellation: Intent.filterEquals
      // (what PendingIntent matching uses) ignores extras, only action/data/component/class —
      // so this resolves to the same PendingIntent regardless of what was originally scheduled.
      alarmManager.cancel(restAlarmPendingIntent(true))
      // Context.stopService() returns Boolean, not Unit — end on an explicit Unit so this
      // lambda unambiguously matches the `() -> Unit` Function() overload rather than risking
      // resolution against the generic `() -> R` one.
      context.stopService(Intent(context, RestAlarmService::class.java))
      Unit
    }

    // Called from JS whenever the app comes to the foreground (see AppContext's AppState
    // listener), regardless of *how* it got there — tapping the notification, tapping the app
    // icon, switching from recents, all of it. This is the reliable way to clear a stale
    // rest-complete notification: routing the clear through the notification's own tap action
    // (via an intermediate BroadcastReceiver) turned out to break the app from reopening at
    // all — see RestAlarmService's content-intent comment for why. Decoupling "clear" from
    // "reopen" entirely sidesteps that: this is just a plain cancel call from an already-running
    // JS engine in an already-foregrounded app, nothing to do with background-launch
    // restrictions. Cancelling a notification id that doesn't currently exist is a safe no-op.
    Function("clearRestAlarmNotification") {
      NotificationManagerCompat.from(context).cancel(RestAlarmService.NOTIFICATION_ID)
    }
  }

  private fun restAlarmPendingIntent(soundEnabled: Boolean): PendingIntent {
    val intent = Intent(context, RestAlarmReceiver::class.java).apply {
      putExtra(RestAlarmReceiver.EXTRA_SOUND_ENABLED, soundEnabled)
    }
    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
