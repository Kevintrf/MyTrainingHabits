package expo.modules.restalarm

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

// Handles two distinct broadcasts, distinguished by action:
//
// - No action (default) — fired by AlarmManager (native OS alarm, not a scheduled
//   expo-notifications notification) when the rest timer completes. This is what lets
//   RestAlarmService start reliably even if the app process was fully killed. Starting a
//   foreground service from a broadcast receiver triggered by an AlarmManager "while idle"
//   alarm is an explicitly documented exemption to Android's background-start restrictions,
//   which is why this pattern (rather than a plain background service) is used.
// - ACTION_OPEN_APP — fired when the user taps the "Rest complete" notification. Explicitly
//   cancels it and brings the app to the front here, rather than relying solely on the
//   notification's own `setAutoCancel`/`setContentIntent` to do both — guarantees the
//   notification actually clears on tap instead of depending on that behavior alone.
class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_OPEN_APP) {
      NotificationManagerCompat.from(context).cancel(RestAlarmService.NOTIFICATION_ID)
      openApp(context)
      return
    }

    val soundEnabled = intent.getBooleanExtra(EXTRA_SOUND_ENABLED, true)
    val serviceIntent = Intent(context, RestAlarmService::class.java).apply {
      putExtra(EXTRA_SOUND_ENABLED, soundEnabled)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }

  // A raw Context.startActivity() call from inside a BroadcastReceiver isn't reliably treated
  // as user-initiated by Android's background-activity-launch restrictions, even though this
  // receiver itself was only invoked because the user tapped the notification — that direct
  // startActivity() call silently did nothing on-device. Sending the launch as a PendingIntent
  // instead keeps it inside the platform's PendingIntent-activation path (the same mechanism
  // a notification's own content intent uses), which is what actually carries the
  // user-interaction exemption through.
  private fun openApp(context: Context) {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    try {
      PendingIntent.getActivity(
        context,
        OPEN_APP_REQUEST_CODE,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ).send()
    } catch (e: PendingIntent.CanceledException) {
      // best effort — nothing more to do if the OS won't allow it
    }
  }

  companion object {
    const val EXTRA_SOUND_ENABLED = "soundEnabled"
    const val ACTION_OPEN_APP = "expo.modules.restalarm.ACTION_OPEN_APP"
    private const val OPEN_APP_REQUEST_CODE = 4274
  }
}
