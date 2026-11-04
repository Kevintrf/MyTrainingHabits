package expo.modules.restalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

// Fired by AlarmManager (native OS alarm, not a scheduled expo-notifications notification) —
// this is what lets RestAlarmService start reliably even if the app process was fully killed.
// Starting a foreground service from a broadcast receiver triggered by an AlarmManager
// "while idle" alarm is an explicitly documented exemption to Android's background-start
// restrictions, which is why this pattern (rather than a plain background service) is used.
//
// This receiver was briefly also used to handle the notification's tap action (explicitly
// cancelling it before launching the app), to work around setAutoCancel not reliably clearing
// it. That broke the app from reopening at all — routing the launch through this receiver,
// whether via a raw startActivity() or a secondary PendingIntent.send(), didn't carry the
// user-interaction exemption a notification's own direct content intent gets. Reverted:
// RestAlarmService's content intent launches the app directly again, and clearing the
// notification is handled separately via `clearRestAlarmNotification()`, called from JS
// whenever the app comes to the foreground.
class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val soundEnabled = intent.getBooleanExtra(EXTRA_SOUND_ENABLED, true)
    val headphonesOnly = intent.getBooleanExtra(EXTRA_HEADPHONES_ONLY, false)
    val serviceIntent = Intent(context, RestAlarmService::class.java).apply {
      putExtra(EXTRA_SOUND_ENABLED, soundEnabled)
      putExtra(EXTRA_HEADPHONES_ONLY, headphonesOnly)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }

  companion object {
    const val EXTRA_SOUND_ENABLED = "soundEnabled"
    const val EXTRA_HEADPHONES_ONLY = "headphonesOnly"
  }
}
