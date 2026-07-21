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
                                               Local notification, fires even backgrounded/
                                               closed. Picks a sound or silent Android channel
                                               based on soundEnabled. Returns null if
                                               permission isn't granted.
  cancelRestNotification(id)                  Cancel a pending one (no-op if already fired)
  openExactAlarmSettings()                    Android only — deep-links to the OS "Alarms
                                               & reminders" toggle for this app (see below)
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

Started automatically whenever a set is checked off in WorkoutScreen (not when un-marking one). Two independent pieces, both driven from `AppContext`:

- **In-app countdown** — `RestTimerBanner` (mounted globally in `App.tsx`, above `RootNavigator`, so it's visible on every tab, not just while on WorkoutScreen). Tracks an epoch-ms `restTimerEndAt` rather than an accumulating counter, so it stays correct across the app being backgrounded/resumed — no drift, no need to persist/restore a running interval.
- **Local notification** — `services/restTimerNotifications.ts` schedules a single `expo-notifications` local notification for when the rest period ends, so it still fires if the app is backgrounded or fully closed. **Known limitation:** Expo's notification API doesn't expose Android's native "chronometer" notification style, so there's no live-updating countdown *inside* the notification itself — only the in-app banner counts down; the notification is a one-shot "time's up" alert.

`user_settings.rest_timer_enabled` (default 1/on) gates `AppContext.startRestTimer()` — it's a no-op when off, so `WorkoutScreen`'s call site doesn't need to know about the setting. `user_settings.rest_timer_seconds` (default 120) controls the duration; SettingsScreen edits it as separate minutes (1 digit, 0-9) + seconds (2 digits, 0-99) text inputs rather than presets, sanitized to digits-only and capped by `maxLength`, saved (debounced) only when the combined total is > 0 — a 0:00 duration is refused with an inline warning rather than silently falling back to something else.

**Notification sound:** `user_settings.rest_timer_sound_enabled` (default 1/on) controls whether the rest-complete notification plays `app/assets/sounds/rest_timer_alert.mp3`, registered via the `expo-notifications` config plugin's `sounds` array in `app.json`. **Non-obvious gotcha found by reading the Android native source** (`ExpoNotificationBuilder.kt`'s `applySoundsAndVibrations`): on Android 8+ (API 26+), a notification's *channel* — not its per-request `content.sound` — governs whether/what plays, and a channel's sound is fixed at creation time. So toggling sound on/off can't be done by varying `content.sound` per notification; instead `restTimerNotifications.ts` maintains two Android channels (`rest-timer-alarm` with the custom sound, `rest-timer-alarm-silent` with `sound: null`) and picks between them via `channelId` when scheduling, based on the setting. iOS doesn't have channels, so there `content.sound` is set directly (`SOUND_FILE` or `false`) — though iOS officially only supports aiff/wav/caf for custom notification sounds, so the bundled mp3 may fall back to the system default there; this app's primary target (the user's device) is Android, where it plays correctly.

**Channel ids are versioned, not reused.** Android permanently locks a channel's sound/importance/audio-attributes at creation — the app can never update them later, only the user can via system Settings. The original `rest-timer`/`rest-timer-silent` ids (used before the alarm-stream fix below) are explicitly deleted on setup and never reused; any future change to channel-level sound/importance/audio-attributes needs a new id too, or it silently won't take effect on devices that already have the old channel.

**Plays on the Alarm audio stream, not Notification.** The sound channel's `audioAttributes.usage` is `AndroidAudioUsage.ALARM` (not the default `NOTIFICATION`) — the same stream real alarm-clock apps use. This was a deliberate fix, not the initial design: a phone with its ringer/notification volume set to vibrate or silent still mutes a `NOTIFICATION`-stream sound, which is exactly the symptom that surfaced this (the sound was inaudible with "vibrate only" set, and separately, an already-locked old channel meant code changes weren't taking effect at all — see above). Routing to `ALARM` makes it audible regardless of ringer/notification volume, and it mixes in over whatever's already playing on the Music stream instead of being silenced by it — no native module needed, this is a plain channel config field.

**Native dependency:** `expo-notifications` requires the `ios`/`android` native projects to be regenerated (`npx expo prebuild --clean`) after being added or after `app.json`'s `sounds` array changes — a plain JS-only change wouldn't pick up the new native module, the Android permissions its config plugin adds, or a newly bundled sound asset (the plugin copies it into `android/app/src/main/res/raw` at prebuild time).

**Notification delay on Android 12+:** without the `SCHEDULE_EXACT_ALARM` permission, `expo-notifications` schedules the rest-complete notification as an *inexact* alarm (`AlarmManagerCompat.setAndAllowWhileIdle`, see its `ExpoSchedulingDelegate.kt`), which Android is free to defer for battery savings — some OEM skins (Samsung's One UI, notably) defer it substantially, proportionally worse for short timers. `app.json` declares the permission, but on Android 13+ it isn't auto-granted — the user has to flip on "Alarms & reminders" for the app manually. There's no JS API to check current grant status, so `openExactAlarmSettings()` just deep-links straight to that settings screen via `Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM')`, exposed as a row in SettingsScreen (Android only).

## Deployment

Not applicable for the current offline-first architecture. The app installs and runs entirely from the APK/IPA with no external dependencies. Note the exercise images add ~98MB to the installed app size — a deliberate tradeoff, see `docs/decisions/exercise-image-bundling.md`.
