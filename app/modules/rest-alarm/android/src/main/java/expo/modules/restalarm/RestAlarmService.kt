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
import android.content.Intent
import androidx.core.app.NotificationCompat

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

    if (soundEnabled) {
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

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Rest Timer", NotificationManager.IMPORTANCE_LOW)
        )
      }
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Rest complete")
      .setContentText("Time for your next set.")
      .setSmallIcon(resolveIconResource())
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setAutoCancel(true)
      .build()
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
    @Suppress("DEPRECATION")
    stopForeground(true)
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
    private const val CHANNEL_ID = "rest-alarm-service"
    private const val NOTIFICATION_ID = 4272
    private const val MAX_PLAYBACK_MS = 15_000L
  }
}
