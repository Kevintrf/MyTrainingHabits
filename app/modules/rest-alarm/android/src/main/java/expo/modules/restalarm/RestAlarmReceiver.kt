package expo.modules.restalarm

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
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { launchIntent ->
        launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        context.startActivity(launchIntent)
      }
      return
    }

    val soundEnabled = intent.getBooleanExtra(EXTRA_SOUND_ENABLED, true)
    val serviceIntent = Intent(context, RestAlarmService::class.java).apply {
      putExtra(EXTRA_SOUND_ENABLED, soundEnabled)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }

  companion object {
    const val EXTRA_SOUND_ENABLED = "soundEnabled"
    const val ACTION_OPEN_APP = "expo.modules.restalarm.ACTION_OPEN_APP"
  }
}
