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
class RestAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val soundEnabled = intent.getBooleanExtra(EXTRA_SOUND_ENABLED, true)
    val serviceIntent = Intent(context, RestAlarmService::class.java).apply {
      putExtra(EXTRA_SOUND_ENABLED, soundEnabled)
    }
    ContextCompat.startForegroundService(context, serviceIntent)
  }

  companion object {
    const val EXTRA_SOUND_ENABLED = "soundEnabled"
  }
}
