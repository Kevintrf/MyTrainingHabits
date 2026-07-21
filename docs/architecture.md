# Architecture

## System Design

The app runs entirely on-device. The Expo mobile app reads and writes to a local SQLite database via `expo-sqlite`. No backend server is required.

```text
[Expo App]  <-->  [expo-sqlite local DB]
```

## Frontend

**Technology:** Expo (React Native), TypeScript

### Screens

| Screen                    | Purpose                                                                |
|---------------------------|--------------------------------------------------------------------------|
| CycleScreen               | Main view — active cycle's workouts with done-checkboxes; "New Cycle" button |
| WorkoutScreen             | A single cycle workout — expandable exercise cards with inline set rows (reps, weight, per-set checkbox); each card header has guide/history shortcut icons (hidden for exercises removed from the library) |
| ExercisesScreen           | Browse and search the exercise library                                    |
| CreateExerciseScreen      | Create a custom exercise (name, muscle group, type)                       |
| ExerciseDetailScreen      | Per-exercise page (tap an exercise in ExercisesScreen, or the guide icon on WorkoutScreen) — personal notes, images, and step-by-step guide (guide/images only populated for the built-in free-exercise-db library, not custom exercises); links to ExerciseHistoryScreen |
| ExerciseHistoryScreen     | Every completed set ever logged for one exercise, grouped by day, most recent first (reachable from ExerciseDetailScreen or the history icon on WorkoutScreen) |
| ProgramScreen             | The repeating program — ordered list of workouts, tap to edit             |
| EditProgramWorkoutScreen  | Edit a program workout's label and its exercises/default targets          |
| SettingsScreen            | Rest timer on/off toggle (default on), duration (minutes + seconds inputs), and play-sound toggle (default on) |

### State Management

- React Context API for global state (current user, active cycle)
- Local component state for everything else
- No Redux — keep it simple until complexity demands otherwise

### Key Principles

- Pre-load the active cycle and the exercise library on app open
- Keep components under ~200 lines; extract a component before it grows past that
- Separate DB calls into a `/db` layer — no SQL in components
- A screen reachable from more than one tab (e.g. ExerciseDetailScreen/ExerciseHistoryScreen, reachable from both the Cycle tab's WorkoutScreen and the Exercises tab) is registered under each stack that leads to it, rather than navigated to across tabs — keeps back-navigation local to whichever tab the user actually came from instead of jumping tabs

## Backend

Not part of the current architecture. If multi-user sync is added in the future, an Express (Node.js) backend would be the natural choice given the existing TypeScript codebase.

## Database

**Technology:** SQLite (expo-sqlite, on-device)

See [../database/schema.md](../database/schema.md) for the full schema.

### API Structure (local DB layer)

```text
db/exercises.ts
  searchExercises(q)          Search exercises by name
  getExercise(id)             Get a single exercise
  createExercise(data)        Create a custom exercise
  updateExerciseNotes(id, notes)  Save an exercise's personal notes
  getRecentExercises()        Top exercises by recent use

db/cycles.ts
  getActiveCycle()             Get the active cycle with all its cycle_workouts
  startNewCycle()              Finish the active cycle (if any) and stamp out a fresh one from the program
  markWorkoutComplete(id, done) Mark a cycle_workout done/undone

db/sets.ts
  getSetsForCycleWorkout(cycleWorkoutId)
  addSet(cycleWorkoutId, exerciseId, reps, weight_kg)
  updateSet(id, patch)
  markSetComplete(id, done)           Also stamps/clears completed_at
  deleteSet(id)
  getLastSetsForExercise(exerciseId)   Last logged sets (for progression display)
  getExerciseHistory(exerciseId)       Every completed set ever, most recent first (ExerciseHistoryScreen)

db/program.ts
  getProgram()                 List all program workouts in order
  getProgramWorkout(id)        Get a program workout with all its exercises
  createProgramWorkout(data)   Add a new workout to the program
  updateProgramWorkout(id, patch)
  deleteProgramWorkout(id)

db/settings.ts
  getSettings()               Get user settings row (rest_timer_enabled, rest_timer_seconds,
                                                       rest_timer_sound_enabled)
  updateSettings(patch)       Partial update of settings

services/restTimerNotifications.ts
  scheduleRestCompleteNotification(seconds, soundEnabled)
                                               Android: hands off to the rest-alarm native
                                               module. iOS: schedules a plain expo-notifications
                                               notification. Returns a handle, or null if
                                               notification permission isn't granted.
  cancelRestNotification(handle)               Cancel a pending one (no-op if already fired)
  openExactAlarmSettings()                    Android only — deep-links to the OS "Alarms
                                               & reminders" toggle for this app (see below)

modules/rest-alarm/  (local native module, Android only — see Rest Timer below)
  scheduleRestAlarm(triggerAtMillis, soundEnabled)
                                               Native AlarmManager alarm; fires even if the
                                               app process is dead
  cancelRestAlarm()                           Cancels the pending alarm and stops the service
                                               if it's already running
```

## Exercise Data (free-exercise-db import)

The built-in exercise library (873 exercises, `source = 'SEED'`) is bulk-imported from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), not hand-seeded. Regenerating it (e.g. after an upstream dataset update) is a one-time offline step, not something that happens on-device:

```text
scripts/import-free-exercise-db.py
  Reads free-exercise-db/dist/exercises.json (expects the free-exercise-db repo
  checked out as a sibling of app/), and generates:
    - app/src/db/seedExercisesData.ts   structured exercise data, imported by
                                         db/schema.ts's seedExercises()
    - app/assets/exercises/<slug>/*.jpg copied exercise images (~98MB, 1,746 files)
    - app/src/assets/exerciseImages.ts  EXERCISE_IMAGES manifest — a static
                                         require() call per image, keyed by slug.
                                         Metro (the RN bundler) only resolves
                                         local assets via static string-literal
                                         require() calls, so a runtime path lookup
                                         isn't possible; this generated manifest is
                                         the standard workaround for bundling a
                                         large fixed set of local images.
```

`db/schema.ts`'s `seedExercises()` deletes the old placeholder library (identified by `source = 'SEED' AND source_slug IS NULL` — every real import row always has a `source_slug`) and bulk-inserts from `SEED_EXERCISES_FULL`, guarded by a row-count check so the ~873-row insert loop only runs once, not on every app launch. User-created custom exercises (`source = 'USER'`) are never touched by this.

## Rest Timer

Started automatically whenever a set is checked off in WorkoutScreen (not when un-marking one). Three independent pieces, all driven from `AppContext`:

- **In-app countdown** — `RestTimerBanner` (mounted globally in `App.tsx`, above `RootNavigator`, so it's visible on every tab, not just while on WorkoutScreen). Tracks an epoch-ms `restTimerEndAt` rather than an accumulating counter, so it stays correct across the app being backgrounded/resumed — no drift, no need to persist/restore a running interval.
- **Rest-complete alert, Android** — `modules/rest-alarm`, a local native module (see below), not `expo-notifications`.
- **Rest-complete alert, iOS** — `services/restTimerNotifications.ts` schedules a plain `expo-notifications` local notification. Unchanged since it was first built; iOS was never the device any of the sound bugs below were reported or debugged against. **Known limitation:** Expo's notification API doesn't expose a live-updating countdown *inside* the notification, so (as on Android) it's a one-shot "time's up" alert, not a ticking display — the in-app banner is what counts down.

`user_settings.rest_timer_enabled` (default 1/on) gates `AppContext.startRestTimer()` — it's a no-op when off, so `WorkoutScreen`'s call site doesn't need to know about the setting. `user_settings.rest_timer_seconds` (default 120) controls the duration; SettingsScreen edits it as separate minutes (1 digit, 0-9) + seconds (2 digits, 0-99) text inputs rather than presets, sanitized to digits-only and capped by `maxLength`, saved (debounced) only when the combined total is > 0 — a 0:00 duration is refused with an inline warning rather than silently falling back to something else. `user_settings.rest_timer_sound_enabled` (default 1/on) controls whether the alert plays sound at all (Android: skips `MediaPlayer` and posts a silent banner; iOS: `content.sound: false`).

### `modules/rest-alarm` — why a native module was necessary

The straightforward approach — an `expo-notifications` scheduled notification with a custom sound — went through several rounds of channel-config fixes (custom sound file, `AudioAttributes.usage = ALARM`, `bypassDnd`, `AudioAttributes.FLAG_AUDIBILITY_ENFORCED`) and **still didn't play on the test device (Samsung Galaxy S23, One UI) with its ringer mode set to "Vibrate."** Full history of that sequence, including exactly what each attempt fixed and didn't, is in `CHANGELOG.md`'s 2026-07-21 entries — worth reading before ever touching notification-channel sound config in this codebase again, so an already-ruled-out fix doesn't get re-attempted.

The conclusion that sequence led to: a sound played via `NotificationChannel` is fundamentally still subject to Android's (and apparently this OEM's) notification-sound suppression, no matter which `AudioAttributes` are set on it. The only way around that ceiling is to stop asking the *notification system* to make the sound, and have the *app* make it directly — the same architecture real alarm-clock apps use:

```text
AlarmManager (native, exact-alarm)
  → RestAlarmReceiver (BroadcastReceiver)
    → RestAlarmService (foreground service, started from the receiver — this is an
                         explicitly-documented exemption to Android's background-start
                         restrictions specifically for AlarmManager-triggered receivers)
      → posts a low-importance "Rest complete" notification (just a visible banner)
      → if soundEnabled: MediaPlayer, AudioAttributes.usage = ALARM, requests
        AUDIOFOCUS_GAIN_TRANSIENT, plays app/assets/sounds/rest_timer_alert.mp3 directly
        from Android's res/raw (the same file expo-notifications' `sounds` config-plugin
        entry in app.json copies there — that plugin config is still needed for this reason,
        even though expo-notifications no longer schedules the Android notification itself)
```

This is a genuinely different mechanism from a `NotificationChannel` sound: nothing here asks `NotificationManager` to play anything. The Alarm stream, audio-focus request, and lack of any notification-channel involvement together should behave the same way the OS's own Alarm app does — which is the thing this whole feature was trying to approximate in the first place.

Implementation notes for anyone touching this module:
- **Location and discovery:** `app/modules/rest-alarm` is a local Expo module (not published, not in `node_modules` except via the `"file:./modules/rest-alarm"` entry in `app/package.json`, which npm symlinks in). `expo-modules-autolinking` auto-discovers anything under `./modules` — confirmed by reading `autolinkingOptions.js`'s `nativeModulesDir` default, not assumed. No manual Gradle `include` needed; the generated `android/settings.gradle`'s `expoAutolinking.useExpoModules()` picks it up dynamically on every prebuild.
- **`platforms: ["android"]` only** in `expo-module.config.json` — there's no iOS implementation. `modules/rest-alarm/index.ts` uses `requireOptionalNativeModule`, so importing it on iOS just returns functions that no-op, rather than throwing.
- **Foreground service type:** `specialUse` (Android 14+ requires a declared type), not `mediaPlayback` — chosen because `specialUse` doesn't carry `mediaPlayback`'s expectations (e.g. an active `MediaSession`) that this one-shot alert doesn't fit, and needs no extra permission beyond `FOREGROUND_SERVICE_SPECIAL_USE` (declared in the module's own `AndroidManifest.xml`, merged in automatically — no `app.json` permissions-array entry needed for anything this module declares itself).
- **Only one alarm is ever pending** — `scheduleRestAlarm`/`cancelRestAlarm` both target the same fixed `PendingIntent` request code, so scheduling a new one implicitly replaces any previous one. No id/handle tracking needed on the native side (the JS wrapper still returns a handle string for API-compatibility with the iOS path, which does need a real notification id).
- **`openExactAlarmSettings()` still applies** — this module schedules its own `AlarmManager` alarm directly, so the same exact-alarm permission situation (see below) still governs its timing accuracy.
- Verified via reading real source at each step (expo-modules-autolinking's search-path resolution, expo-modules-core's `Module`/`ModuleDefinition` Kotlin DSL, a real bundled module's `build.gradle`/`AndroidManifest.xml` for exact conventions) before relying on API-34 symbols; the project's actual `compileSdk`/`targetSdk` is 36, confirmed from a real build log, comfortably above that. A first build attempt failed at Gradle *configuration* time (`android.defaultConfig.versionName` not set — the React Native Gradle plugin requires it on every native module, including local ones; a real bundled module's `build.gradle` sets it and this one initially didn't) — fixed by adding a `defaultConfig` block. That failure happened before Kotlin compilation was ever reached, so it didn't validate the Kotlin source itself; expect possible further round-trips against real build output.

**Native dependency:** `expo-notifications` requires the `ios`/`android` native projects to be regenerated (`npx expo prebuild --clean`) after being added or after `app.json`'s `sounds` array changes — a plain JS-only change wouldn't pick up the new native module, the Android permissions its config plugin adds, or a newly bundled sound asset (the plugin copies it into `android/app/src/main/res/raw` at prebuild time).

**Notification delay on Android 12+:** without the `SCHEDULE_EXACT_ALARM` permission, `expo-notifications` schedules the rest-complete notification as an *inexact* alarm (`AlarmManagerCompat.setAndAllowWhileIdle`, see its `ExpoSchedulingDelegate.kt`), which Android is free to defer for battery savings — some OEM skins (Samsung's One UI, notably) defer it substantially, proportionally worse for short timers. `app.json` declares the permission, but on Android 13+ it isn't auto-granted — the user has to flip on "Alarms & reminders" for the app manually. There's no JS API to check current grant status, so `openExactAlarmSettings()` just deep-links straight to that settings screen via `Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM')`, exposed as a row in SettingsScreen (Android only).

## Deployment

Not applicable for the current offline-first architecture. The app installs and runs entirely from the APK/IPA with no external dependencies. Note the exercise images add ~98MB to the installed app size — a deliberate tradeoff, see `docs/decisions/exercise-image-bundling.md`.
