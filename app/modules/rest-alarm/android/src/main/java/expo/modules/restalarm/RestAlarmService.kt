package expo.modules.restalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// This is the piece that actually solves what notification-channel-based sound couldn't:
// playing the alert directly through MediaPlayer on the Alarm audio stream, entirely outside
// Android's/OEM's notification-sound pipeline (which several rounds of AudioAttributes/
// bypassDnd/enforceAudibility channel config didn't reliably get past on this device — see
// docs/architecture.md's Rest Timer section for the full history). A foreground service is
// required because, past Android 8, only a foreground service (not a plain background one)
// can reliably do real work in response to a broadcast when the app process may be dead.
class RestAlarmService : Service() {
  private var mediaPlayer: MediaPlayer? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private val stopHandler = Handler(Looper.getMainLooper())
  private val safetyStopRunnable = Runnable { stopPlaybackAndSelf() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val soundEnabled = intent?.getBooleanExtra(RestAlarmReceiver.EXTRA_SOUND_ENABLED, true) ?: true

    // Explicitly clear any previous rest-complete notification before posting a new one.
    // Reusing the same NOTIFICATION_ID below should already replace-in-place rather than
    // stack, but this removes any ambiguity for the case where the previous one was already
    // detached from its (now-stopped) foreground service — belt and braces, cheap to do.
    NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)

    try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // If the OS refuses to let this foreground service start for some reason, there's
      // nothing left to do — no crash, just no rest-complete alert this time.
      stopSelf()
      return START_NOT_STICKY
    }

    if (soundEnabled && !isMediaVolumeZero()) {
      playSound()
      // Safety net: MediaPlayer's onCompletion/onError normally stop the service already:
      // this just guarantees the foreground service (and its wake-equivalent state) can't
      // linger indefinitely if something about playback never calls back.
      stopHandler.postDelayed(safetyStopRunnable, MAX_PLAYBACK_MS)
    } else {
      stopPlaybackAndSelf()
    }

    return START_NOT_STICKY
  }

  // The alert plays on the Alarm stream (see playSound()), deliberately independent of ringer
  // mode/vibrate/Do Not Disturb — that took several rounds to get right and is still the
  // point. Media volume is different: turning it all the way down is an explicit, separate
  // user action, not a system-level mode change, and the user asked for that specific signal
  // to be honored — if Media volume is zero, skip playback (the notification banner and
  // vibration still happen either way; only the sound itself is gated by this).
  private fun isMediaVolumeZero(): Boolean {
    val manager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return manager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      // Retired: IMPORTANCE_LOW never pops up as a heads-up banner and never vibrates,
      // regardless of anything else set on it — that's why the alert was only appearing
      // silently in the shade. Channel ids are locked at creation (same rule as everywhere
      // else in this saga), so this needs a new id, not just a change to the old one.
      try {
        manager.deleteNotificationChannel(OLD_CHANNEL_ID)
      } catch (e: Exception) {
        // never existed on this install — fine
      }
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, "Rest Timer", NotificationManager.IMPORTANCE_HIGH).apply {
          // The alert sound is played directly via MediaPlayer in playSound(), not through
          // this channel — silence the channel's own sound so the system doesn't *also*
          // play its default notification tone on top of it. Importance HIGH (for the
          // heads-up popup + vibration) and channel sound are independent settings.
          setSound(null, null)
          enableVibration(true)
        }
        manager.createNotificationChannel(channel)
      }
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Rest complete")
      .setContentText("Time for your next set.")
      .setSmallIcon(resolveIconResource())
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVibrate(VIBRATE_PATTERN)
      .setAutoCancel(true)
      .setContentIntent(buildContentIntent())
      .build()
  }

  // Tapping the notification launches the app directly via a PendingIntent set right here as
  // the content intent — this is the one version of "tap to reopen" that's actually been
  // confirmed reliable on-device. Two attempts at clearing the notification via an
  // intermediate BroadcastReceiver (raw startActivity(), then PendingIntent.send() from
  // within the receiver) both broke reopening entirely, even though the receiver only ever
  // ran because of this exact tap — Android's "was this user-initiated" exemption for
  // background-activity-launch restrictions appears tied specifically to a notification's own
  // content-intent activation, not to whatever a receiver does afterward in response to it.
  // Clearing the notification is handled by a completely different, decoupled mechanism
  // instead: `clearRestAlarmNotification()` (RestAlarmModule.kt), called from JS whenever the
  // app comes to the foreground for any reason — see AppContext's AppState listener.
  // FLAG_ACTIVITY_REORDER_TO_FRONT resumes the existing task rather than cold-launching a
  // fresh instance, so it brings back whatever the app was already showing (e.g. the workout
  // being logged) whenever the process is still alive.
  private fun buildContentIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    return PendingIntent.getActivity(
      this,
      CONTENT_REQUEST_CODE,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // applicationInfo.icon should always be valid (Expo's prebuild always sets android:icon from
  // app.json), but this falls back to the app's launcher mipmap by name, and finally to a
  // built-in framework icon, rather than risk NotificationCompat throwing on an icon of 0.
  private fun resolveIconResource(): Int {
    if (applicationInfo.icon != 0) return applicationInfo.icon
    val launcherId = resources.getIdentifier("ic_launcher", "mipmap", packageName)
    if (launcherId != 0) return launcherId
    return android.R.drawable.ic_dialog_info
  }

  private fun playSound() {
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
      .build()

    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    requestAudioFocus(attributes)

    try {
      val soundUri = Uri.parse("android.resource://$packageName/raw/rest_timer_alert")
      mediaPlayer = MediaPlayer().apply {
        setAudioAttributes(attributes)
        setDataSource(this@RestAlarmService, soundUri)
        // Half the amplitude the file plays at (1.0 = unchanged) — the alert was reported as
        // too loud at full volume.
        setVolume(PLAYBACK_VOLUME, PLAYBACK_VOLUME)
        isLooping = false
        setOnCompletionListener { stopPlaybackAndSelf() }
        setOnErrorListener { _, _, _ -> stopPlaybackAndSelf(); true }
        prepare()
        start()
      }
    } catch (e: Exception) {
      stopPlaybackAndSelf()
    }
  }

  private fun requestAudioFocus(attributes: AudioAttributes) {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener {}
        .build()
      manager.requestAudioFocus(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus({}, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonAudioFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
    }
  }

  private fun stopPlaybackAndSelf() {
    stopHandler.removeCallbacks(safetyStopRunnable)
    mediaPlayer?.let { player ->
      try {
        if (player.isPlaying) player.stop()
      } catch (e: IllegalStateException) {
        // already stopped/released — fine
      }
      player.release()
    }
    mediaPlayer = null
    abandonAudioFocus()
    // DETACH (not REMOVE): stop being a foreground service but leave the "Rest complete"
    // notification posted as a normal, dismissible notification — matching how the old
    // expo-notifications-based alert behaved (visible until the user dismisses it, not
    // vanishing the instant playback ends).
    stopForeground(STOP_FOREGROUND_DETACH)
    stopSelf()
  }

  override fun onDestroy() {
    stopHandler.removeCallbacks(safetyStopRunnable)
    mediaPlayer?.release()
    mediaPlayer = null
    abandonAudioFocus()
    super.onDestroy()
  }

  companion object {
    private const val OLD_CHANNEL_ID = "rest-alarm-service"
    private const val CHANNEL_ID = "rest-alarm-service-v2"
    // Not private — RestAlarmModule's clearRestAlarmNotification() cancels this same id when
    // the app comes to the foreground.
    const val NOTIFICATION_ID = 4272
    private const val CONTENT_REQUEST_CODE = 4273
    private const val MAX_PLAYBACK_MS = 15_000L
    private const val PLAYBACK_VOLUME = 0.25f
    private val VIBRATE_PATTERN = longArrayOf(0, 400, 200, 400)
  }
}
