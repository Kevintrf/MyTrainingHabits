# Changelog

All changes to the project are documented here.

---

## 2026-08-04 (25)

### feat: edit, rename, and delete custom exercises
Custom (`USER`-source) exercises can now be edited and deleted from ExerciseDetailScreen — a pencil icon next to the name opens the same form used to create one (`CreateExerciseScreen`, now doubling as the edit screen: prefills from the existing exercise and calls `updateExercise` instead of `createExercise` when editing), and a red "Delete Exercise" button at the bottom removes it after a confirmation. Both actions are hidden for seed-library exercises — the imported free-exercise-db data isn't the user's to rename or remove. New `updateExercise`/`deleteExercise` DB functions are scoped to `source = 'USER'` as a defense-in-depth check regardless of what the UI already restricts. Deleting relies on existing FK behavior: it cascades out of any program workout using it, while past logged sets keep their already-denormalized `exercise_name` and stay fully readable. ExerciseDetailScreen now refetches on every focus (not just first mount) and syncs its header title live, so returning from an edit shows the updated name/tags immediately.

---

## 2026-08-04 (24)

### fix: exercise search returning nothing on a trailing space
`searchExercises` built its `LIKE` pattern straight from the raw query, so a trailing (or leading) space — easy to end up with mid-typing, e.g. right after finishing a word — meant matching against a substring like `"bench "` that stored exercise names never actually contain, since names themselves have no surrounding whitespace. Silently returned zero results even for an otherwise-exact name. Now trims the query before building the pattern.

---

## 2026-08-04 (23)

### feat: new app icon/logo
Replaced the default Expo placeholder (identical file reused across all five icon slots) with a blue dumbbell logo. `icon.png`/`splash-icon.png` use the full-bleed 1024x1024 artwork directly. The Android adaptive-icon foreground is scaled to ~68% and centered on a transparent canvas — Android crops that layer to a circle/squircle/rounded-square depending on the launcher, guaranteeing only the inner ~66% is always visible, and the un-padded original would have clipped the corner weight plates. Added a matching solid-navy `android-icon-background.png` and a derived white-silhouette `android-icon-monochrome.png` for Android 13+ themed icons. Splash screen and adaptive-icon backdrop colors in `app.json` updated to the logo's own navy (`#000A30`) so the padding blends seamlessly instead of showing the old white/light-blue defaults.

---

## 2026-08-04 (22)

### fix: rest-alarm sound silent through headphones with no other audio active
Media volume is tracked per active output route, and a headset that's connected but has never had a real media session play through it commonly reads as 0 on that route — either an OS hearing-safety reset on connect, or the level just never being established — regardless of what the user actually wants to hear. `RestAlarmService`'s "skip if Media volume is zero" check (added to respect an explicit mute) couldn't tell that apart from a genuinely muted headset, so the alert silently skipped playback entirely whenever nothing else had recently played audio through the headphones — until something like a music app raised that route's volume for it. The zero-skip now only applies when falling back to the speaker; once a connected headset is detected (same check the previous session's routing fix uses), the alert always plays, matching the actual intent of routing to it in the first place.

---

## 2026-08-04 (21)

### fix: finished workouts no longer silently un-marked as complete
A workout's completion flag is meant to be independent of its individual sets' checkboxes (you can mark a workout done via the Cycle tab's checkbox without every set literally checked off). But WorkoutScreen's `load()` was silently recomputing "all sets complete" on every mount and edit — including unrelated ones like committing an exercise note — and overwriting `cycle_workouts.is_complete` whenever it disagreed with the manual flag. Simply reopening an already-finished workout (for any reason) would flip it back to incomplete the moment the screen loaded, and the change wouldn't show up in the Cycle tab until something else (e.g. editing a note on a different workout) happened to trigger a cycle refresh — which is why it looked like the unrelated note edit caused it. Removed the auto-recompute entirely; `is_complete` now only changes via the explicit checkbox, as it did before this regression.

---

## 2026-07-26 (20)

### fix: rest-alarm sound no longer forced through the speaker with headphones connected
The Alarm audio stream is special-cased by Android to always play through the speaker in addition to any connected headset/Bluetooth device, so an overnight alarm still wakes you if your earbuds fell out — fine for a wake-up alarm, wrong for a rest timer. `RestAlarmService` now checks for a connected wired headset/headphones, Bluetooth (A2DP/SCO), USB headset, or hearing aid via `AudioManager.getDevices()`, and pins `MediaPlayer` to that device with `setPreferredDevice()` when one is found, overriding the forced dual-routing. Falls back to the speaker exactly as before when nothing is connected. Android-only; iOS's notification-based sound already follows normal output routing.

---

## 2026-07-21 (19)

### feat: CUSTOM exercise filter, ranked search results
Added a CUSTOM chip to ExercisesScreen's filter row, right after ALL — filters to user-created exercises only, any muscle group; mutually exclusive with the muscle-group chips (one selector, not two independent filters). `searchExercises` also no longer sorts alphabetically by default: results now rank custom exercises first, then by how many sets have actually been logged against each exercise, with name only as the final tiebreaker — surfacing exercises the user created or actually trains ahead of the untouched majority of the 873-exercise seed library. Verified via smoke test: CUSTOM filter excludes seed exercises even when heavily logged, and among same-source exercises the more-used one ranks first regardless of alphabetical order.

---

## 2026-07-21 (18)

### feat: grey placeholder pre-fill for reps/weight, auto-commit on finish
Unlogged sets in WorkoutScreen now show a suggested value as a grey placeholder rather than preloading it as a real (indistinguishable-from-entered) value: reps suggest the program's target rep count for that exercise, weight suggests whatever was logged last time for the same exercise (matched by set position). Marking a set complete with a field left untouched takes on the shown suggestion as the actual saved value; typing a real number overrides it as before, and un-marking a set never triggers the substitution. `getCycleWorkoutDetail` now also pulls `program_exercises.default_reps` through the join it already had for ordering/notes.

---

## 2026-07-21 (17)

### feat: program-exercise notes also visible and editable from WorkoutScreen
Extends the previous entry's per-program-exercise notes to the Cycle tab: each exercise card on WorkoutScreen now shows the same note (small italic text, only when present) and supports the same long-press-to-edit interaction alongside the existing tap-to-expand — long press and tap coexist fine on the same touchable. It's one shared note, not a per-cycle copy: editing it from a workout in progress updates the same `program_exercises.notes` row EditProgramWorkoutScreen edits. `getCycleWorkoutDetail`'s query already joined `program_exercises` (for exercise ordering) — reused that join to also pull `pe.id`/`pe.notes` rather than adding a second query. Long-press is a no-op if the exercise's program_exercises row no longer exists (program workout or this exercise's entry in it was deleted after the cycle was stamped out). Verified via smoke test that a note set from either screen is visible and editable from the other.

---

## 2026-07-21 (16)

### feat: per-program-exercise notes in EditProgramWorkoutScreen
Long-pressing an exercise in a program workout now opens a small inline text field for a short note on that exercise's inclusion in this specific workout (e.g. "start light") — distinct from the exercise's own general notes on ExerciseDetailScreen. Added `program_exercises.notes` (nullable) with a migration for existing installs. Kept deliberately minimal: no note shows nothing extra; a note shows as a single line of small italic text under the exercise name, nothing else changes about the row's layout. Verified the migration and CRUD round-trip (set, clear, survives unrelated field updates) via smoke test.

---

## 2026-07-21 (15)

### feat: rest-alarm sound skips playback when Media volume is zero
The alert intentionally still plays on the Alarm audio stream, bypassing ringer mode/notification volume/Do Not Disturb — that's the point of the whole native module. But Media volume specifically is now checked before playing (`AudioManager.getStreamVolume(STREAM_MUSIC) == 0` skips `playSound()`) — turning that slider all the way down is a deliberate, explicit user action worth honoring on its own, distinct from the system-level states the rest of this feature is built to survive. The notification banner and vibration are unaffected; only the sound itself is gated by this.

---

## 2026-07-21 (14)

### fix: chevron on CycleScreen's workout rows wasn't tappable
The chevron sat outside the row's navigation touchable (a separate sibling, not wrapped in anything), so tapping directly on it did nothing — only the label/preview text area navigated. Moved it inside the same touchable. Checked every other chevron-style row in the app (Exercises, Program, exercise history link, Settings' alarm-permission row) — all of them already wrap the full row including the chevron, so this was the one inconsistent spot, not a systemic pattern.

---

## 2026-07-21 (13)

### fix: decouple clearing the rest-alarm notification from tapping it
Two straight attempts at clearing the notification via its own tap action (routing through the broadcast receiver, first with a raw `startActivity()`, then with a secondary `PendingIntent`) both broke the app from reopening at all when tapped — confirming the "user-initiated" exemption for Android's background-activity-launch restrictions is tied specifically to a notification's own direct content intent, not to anything a receiver does afterward in response to it.

Reverted the content intent to a direct `PendingIntent.getActivity()` — the one version confirmed to reliably reopen the app — and moved clearing to a completely separate mechanism: a new `clearRestAlarmNotification()` on the native module, called from a `AppState` listener in `AppContext` whenever the app comes to the foreground, for any reason (notification tap, app icon, recents), not just the tap. Also covers cold launch, where `AppState`'s `change` event never fires since there's no prior state to transition from.

---

## 2026-07-21 (12)

### fix: tapping the rest-alarm notification cleared it but stopped opening the app
The previous fix's `context.startActivity()` call from inside the broadcast receiver cleared the notification correctly but no longer brought the app forward. Most likely cause: Android's background-activity-launch restrictions don't reliably treat a plain `startActivity()` call from a `BroadcastReceiver` as user-initiated, even though the receiver only runs because of a notification tap — the exemption is tied to the platform's `PendingIntent` activation path specifically. Changed the launch to build its own `PendingIntent.getActivity(...)` and `.send()` it, keeping it inside that path instead of calling `startActivity()` directly. Not independently confirmed on-device yet.

---

## 2026-07-21 (11)

### fix: exercise card expand/collapse tap target too small on WorkoutScreen
Only the exercise name/set-count text and the small chevron icon toggled the set/reps view — easy to miss and tap next to. The whole card header is now the tap target (minus the guide/history icon buttons, which still navigate on their own), by making the header itself the touchable rather than a narrow inner region of it.

---

## 2026-07-21 (10)

### fix: rest-alarm notification didn't reliably clear on tap
`setAutoCancel(true)` was already set but apparently wasn't reliably clearing the notification on tap. Made it explicit instead: the notification's tap action now routes through `RestAlarmReceiver` (a new `ACTION_OPEN_APP` branch on the existing receiver, rather than launching the app directly), which calls `NotificationManagerCompat.cancel()` on the notification before bringing the app forward. `setAutoCancel` is left in place too as a second, independent path to the same result.

---

## 2026-07-21 (9)

### feat: rest-alarm notification tap resumes the app, no stacking, quieter still
Tapping the "Rest complete" notification now brings the app back to whatever it was showing (e.g. the workout being logged) via a content intent that resumes the existing task rather than cold-launching a fresh one — only reliable while the app process is still alive, which covers the typical rest-length backgrounding. Also explicitly cancels any previous rest-complete notification before posting a new one, so consecutive rest timers don't stack up multiple entries. Lowered playback volume again, 50% → 25%.

---

## 2026-07-21 (8)

### fix: rest-alarm notification wasn't popping up or vibrating; sound too loud
The service's notification channel used `IMPORTANCE_LOW`, which — independent of anything else configured on it — never shows as a heads-up popup and never vibrates; it only ever appears silently in the shade. Bumped to `IMPORTANCE_HIGH`, and since a HIGH channel plays the system's default tone unless told otherwise, explicitly silenced the channel's own sound (`setSound(null, null)`) so it doesn't stack on top of the sound this module already plays directly via `MediaPlayer`. Channel id bumped again (`rest-alarm-service` → `rest-alarm-service-v2`, old one deleted on setup) — same channel-immutability rule as everywhere else in this feature.

Also halved the alert's playback volume (`MediaPlayer.setVolume(0.5f, 0.5f)`) — reported as too loud at the sound file's native level.

---

## 2026-07-21 (7)

### fix: rest-alarm sound didn't play in foreground, and its notification vanished quickly
First on-device confirmation of the native rest-alarm module: sound worked, but only while the app was backgrounded/closed, and the "Rest complete" notification disappeared within a few seconds regardless.

Root cause of the foreground bug: `RestTimerBanner`'s countdown-reaches-zero handler called the exact same `cancelRestTimer()` as the "Skip" button. That was harmless with the old `expo-notifications` implementation (cancelling an already-fired notification is a no-op), but `rest-alarm`'s `cancelRestAlarm()` also calls `stopService()` — which, if the foreground service is already running, kills it mid-playback. Since the in-app countdown only actively ticks while the app is in the foreground, this raced with and killed the native alert at the exact moment it should have fired, every time the app was open. Split the natural-completion path into a new `dismissRestTimerBanner()` that only clears local UI state, leaving `cancelRestTimer()` for the explicit "Skip" action, which still needs to actually cancel/stop the alert.

Root cause of the vanishing notification: the service's cleanup called `stopForeground(true)` (`STOP_FOREGROUND_REMOVE`), which deletes the notification the moment the service stops — right as the short alert sound finishes playing. Changed to `STOP_FOREGROUND_DETACH`, which stops the service but leaves the notification posted and dismissible, matching the old notification-based behavior.

---

## 2026-07-21 (6)

### fix: rest-alarm module failed to build — missing versionName, risky Kotlin overload
First real build attempt (`npx expo run:android --variant release`) failed during Gradle configuration, before any Kotlin was compiled: `'android.defaultConfig.versionName' is not defined` for the new `rest-alarm` module. The React Native Gradle plugin requires every native module (local ones included) to declare `defaultConfig.versionName`; a real bundled module's `build.gradle` sets it and the new one didn't. Added a `defaultConfig` block.

While fixing that, also found (by inspection, before it could surface as its own build failure) that `RestAlarmModule.kt`'s `cancelRestAlarm` function ended with `context.stopService(...)`, which returns `Boolean` in Kotlin — risking ambiguous overload resolution against expo-modules-core's `Function()` DSL, which has both a `() -> Unit` and a generic `() -> R` variant. Added an explicit trailing `Unit` so it unambiguously matches the former.

Also confirmed from the real build log: this project's actual `compileSdk`/`targetSdk` is 36 (higher than the plugin-default 35 assumed when choosing which API-34 symbols were safe to reference) — comfortably sufficient, no change needed there, just corrected in `docs/architecture.md`. Not yet confirmed the module actually compiles and runs — this fixes the first failure encountered, not a guarantee there isn't a second one still ahead.

## 2026-07-21 (5)

### feat: rest-complete sound now plays via a native alarm module, not notification-channel sound
The `enforceAudibility` fix didn't work either. Every attempt so far shared the same ceiling: a sound played through Android's `NotificationChannel` is subject to the notification-sound pipeline no matter which `AudioAttributes` are set on it, and on the test device (Samsung Galaxy S23, One UI) with ringer mode "Vibrate," that pipeline still suppressed it.

Rather than continue tuning channel config, added `app/modules/rest-alarm` — a local native Android module that plays the sound directly, the same way real alarm-clock apps do: a native `AlarmManager` alarm fires a `BroadcastReceiver` (works even if the app process is dead), which starts a foreground service that plays `rest_timer_alert.mp3` via `MediaPlayer` on the Alarm audio stream with an explicit audio-focus request — no `NotificationChannel`, no `expo-notifications` scheduling, involved in the sound at all on Android. The service also posts a plain low-importance "Rest complete" banner notification, so the visual alert didn't regress.

`services/restTimerNotifications.ts` now branches by platform: Android delegates to this module, iOS keeps its original plain `expo-notifications` scheduled notification (untouched — iOS was never the device any of this was debugged against). Removed the now-pointless Do Not Disturb access permission/settings row and all the versioned-channel machinery from the earlier attempts, since sound no longer goes through a channel on Android at all.

This needs `npx expo prebuild --clean` (new local native module, new manifest entries for the foreground-service permissions) before the next build. Verified by reading real source at each design decision (`expo-modules-autolinking`'s local-module discovery path, `expo-modules-core`'s Kotlin module DSL, a real bundled module's `build.gradle`/manifest conventions, and this project's actual resolved `compileSdk`/`targetSdk` of 35) — not yet confirmed working on-device, since builds are run by the user.

## 2026-07-21 (4)

### fix: rest-complete sound still silenced in Vibrate mode after the Do Not Disturb fix
The previous fix targeted Do Not Disturb specifically, but the user's actual phone setting was "Vibrate" sound mode — a different, more basic ringer mode that standard Android says shouldn't affect the Alarm stream at all (which is exactly what the earlier Alarm-stream fix was supposed to handle). It still didn't play. Added `audioAttributes.flags.enforceAudibility: true` to the sound channel, which maps to Android's `AudioAttributes.FLAG_AUDIBILITY_ENFORCED` — documented specifically as "ensure this sound is heard regardless of stream volume/mute state." Channel id bumped again (`rest-timer-v4`) since this is one more channel-creation-time setting that won't retroactively apply to an already-created channel.

Not yet confirmed working on-device. If it still isn't enough, the remaining option is a genuine native Android module (foreground service playing the sound directly via `MediaPlayer` on `STREAM_ALARM`, independent of the notification-sound pipeline entirely) rather than further channel-config attempts — flagged to the user as the real fallback.

## 2026-07-21 (3)

### fix: rest-complete sound still silenced by Do Not Disturb / silent sound mode
The Alarm-stream fix from earlier today wasn't enough on its own — a device in Do Not Disturb, or a "Silent" sound mode (distinct from "Vibrate"), can suppress a notification's sound entirely before the audio stream it would use is even considered. Set the sound channel's `bypassDnd: true`, the officially-sanctioned way for a specific channel to be let through Do Not Disturb, and added the `ACCESS_NOTIFICATION_POLICY` permission it requires. That flag only takes effect once the user grants this app "Do Not Disturb access" — a special app-access toggle with no runtime prompt — so added `openNotificationPolicySettings()` (deep-links straight to that settings screen) and a matching row in SettingsScreen (Android only, shown when sound is enabled), same pattern as the existing exact-alarm row.

Channel ids bumped again (`rest-timer-v3`/`rest-timer-v3-silent`) since Android locks a channel's config at creation — the previous ids would never pick up `bypassDnd` no matter what the code says now. All earlier ids are deleted on setup.

Requires `npx expo prebuild --clean` (new manifest permission) before the next build, then granting "Do Not Disturb access" via the new Settings row for the fix to actually take effect.

## 2026-07-21 (2)

### fix: rest-complete sound inaudible in vibrate/silent mode, and stuck on the default tone
Two compounding bugs. First, Android locks a notification channel's sound/importance the moment it's first created — the app can never change it again, only the user can via system Settings. The `rest-timer`/`rest-timer-silent` channels created while first building the sound feature got stuck with whatever sound they had at that point, so later code changes to the scheduling logic had no effect on-device. Retired those ids for good (`rest-timer-alarm`/`rest-timer-alarm-silent`) and delete the old ones on setup so Android is forced to create fresh channels with the current settings, and so they don't linger as dead entries in the app's notification settings.

Second, even with the right sound resolving, it played on the Notification/Ringer volume stream, which is silenced by "vibrate only" — exactly the phone setting that made it inaudible. The sound channel's `audioAttributes.usage` is now `ALARM` instead of the default, routing playback to the Alarm stream: the same one actual alarm-clock apps use, unaffected by ringer/notification volume and mixed in over whatever's already playing on the Music stream rather than silenced by it.

No native rebuild needed — this is a pure JS/config change (channel ids and their audio attributes), not a new native module or `app.json` plugin change, so a normal reinstall of the updated JS bundle picks it up.

## 2026-07-21 (1)

### feat: custom sound for the rest-complete notification, with an on/off toggle
The rest timer's completion notification now plays a bundled custom sound (`app/assets/sounds/rest_timer_alert.mp3`, provided by the user, registered via the `expo-notifications` config plugin's `sounds` array) instead of the OS default. Added a "Play sound" toggle in Settings (default on, `user_settings.rest_timer_sound_enabled`) alongside the existing rest-timer toggle and duration inputs.

Implementing the toggle required reading `expo-notifications`' Android source (`ExpoNotificationBuilder.kt`): on Android 8+ (API 26+), a notification's *channel* — not its per-request `content.sound` — governs whether/what sound plays, and channel sound is fixed at creation time, so per-notification sound can't be varied by content alone. Fixed by maintaining two Android notification channels (`rest-timer` with the custom sound, `rest-timer-silent` with none) and picking between them by `channelId` when scheduling, based on the setting. iOS (no channel concept) sets `content.sound` directly per request; note iOS only officially supports aiff/wav/caf for custom notification sounds, so the mp3 may not play there, though Android — the target device — is unaffected.

Verified the settings/migration path via smoke test (fresh-install default, toggling independent of the other two settings, and migrating an install that predates the column while preserving its existing duration/enabled values). Requires another `npx expo prebuild --clean` (new bundled asset + updated `app.json` plugin config) before the next build.

## 2026-07-18 (5)

### feat: rest timer on/off toggle + manual duration entry; removed name setting
Removed the "Your name" field from Settings — it was never read anywhere outside SettingsScreen itself, so dropped `user_settings.name` entirely (`ALTER TABLE ... DROP COLUMN`, SQLite 3.50 bundled by expo-sqlite supports this fine) rather than leaving a dead column around.

Added `user_settings.rest_timer_enabled` (default on) with a Settings toggle — `AppContext.startRestTimer()` now no-ops when disabled, so `WorkoutScreen`'s call site didn't need to change. Replaced the preset-chip duration picker with manual minutes + seconds text inputs: minutes capped to 1 digit (0-9), seconds to 2 digits (0-99), digits-only sanitization as you type, and the combined duration only saves (debounced) when it's greater than zero — a 0:00 entry is left unsaved with an inline warning rather than silently reverting or accepting a useless zero-length timer.

Verified via smoke test: migrating an install that had a custom name and duration set (name correctly dropped, duration preserved, enabled defaults true), toggling disabled/enabled independent of duration changes, and fresh-install defaults.

## 2026-07-18 (4)

### fix: rest timer notification arriving much later than expected
Root cause identified in `expo-notifications`' own Android source (`ExpoSchedulingDelegate.kt`): without the `SCHEDULE_EXACT_ALARM` permission, it schedules the rest-complete notification as an *inexact* Android alarm, which the OS can defer for battery savings — worse proportionally for short timers, and some OEM skins (Samsung's One UI) are especially aggressive about it. Added the permission to `app.json`. On Android 13+ that alone doesn't grant it — the user still has to flip on "Alarms & reminders" manually — so added `openExactAlarmSettings()` (deep-links via `Linking.sendIntent` straight to that OS settings screen, no custom native code needed) and a matching row in SettingsScreen (Android only) so the fix is one tap away instead of a manual Settings hunt.

Requires another `npx expo prebuild --clean` (new manifest permission) before the next build.

## 2026-07-18 (3)

### feat: rest timer with local notification
Marking a set complete now starts a rest timer (default 2 min, configurable in Settings via preset chips: 0:30–5:00). A floating countdown banner (`RestTimerBanner`) is mounted globally in `App.tsx` so it's visible on any tab, not just WorkoutScreen — tracks an epoch-ms end time rather than an accumulating counter, so it stays correct across backgrounding. Also schedules a local notification (`expo-notifications`, newly added) with sound that fires when the rest period ends, even if the app is backgrounded or closed.

Known limitation, called out up front rather than silently shipped: Expo's notification API doesn't support a live-updating countdown *inside* the notification itself (Android's native "chronometer" style isn't exposed by the JS API) — the notification is a one-shot "rest complete" alert, not a ticking display. The in-app banner is what actually counts down.

`user_settings` gained `rest_timer_seconds` (default 120) with a migration for existing installs. Adding `expo-notifications` means the native `ios`/`android` projects need `npx expo prebuild --clean` before the next build — a plain JS change doesn't pick up new native modules or the Android `POST_NOTIFICATIONS` permission its config plugin adds. Verified the settings/migration path via smoke test; the actual notification firing can only be confirmed on-device.

## 2026-07-18 (2)

### feat: quick access to guide + history from WorkoutScreen
Added a book icon (guide/notes/images, via ExerciseDetailScreen) and a clock icon (ExerciseHistory) directly on each exercise card header in WorkoutScreen, so both are one tap away while actually logging a workout instead of requiring a trip through the Exercises tab. Both routes are now registered under the Cycle tab's own stack (in addition to the Exercises tab's stack, where they were already reachable from ExercisesScreen) — same screens, but back-navigation from a workout returns to the workout instead of jumping to a different tab. Hidden for exercises removed from the library (no exercise_id to look either up by).

## 2026-07-18 (1)

### feat: per-exercise history
Completed sets are now stored with a timestamp (`cycle_sets.completed_at`) — set when a set is checked off, cleared (not left stale) if unmarked, so it always reflects current state. Added `db/sets.getExerciseHistory(exerciseId)`, which returns every completed set for an exercise across all cycles, most recent first. New `ExerciseHistoryScreen`, linked from ExerciseDetailScreen ("View history"), groups that history by calendar day and shows reps/weight/time for each set — the day with the most recent activity at the top. Added an `id` tiebreaker to the history ordering to keep results deterministic when two sets complete within the same millisecond. Migration adds `completed_at` for existing installs; pre-existing completed sets correctly get `NULL` rather than a fabricated timestamp, since there's no way to know when they actually happened. Verified via a smoke test that reproduces the old schema, confirms the migration, and checks mark/unmark/history behavior end-to-end across multiple cycles.

## 2026-07-16 (7)

### feat: import the full free-exercise-db exercise library (images + guides)
Replaced the 10-exercise placeholder library with the complete [free-exercise-db](https://github.com/yuhonas/free-exercise-db) dataset (873 exercises, public domain) — images and step-by-step guides included, fulfilling what ExerciseDetailScreen's placeholder sections were waiting for. Added `scripts/import-free-exercise-db.py`, a reproducible codegen script that reads the source dataset and generates `app/src/db/seedExercisesData.ts` (structured exercise data) plus `app/src/assets/exerciseImages.ts` (a static `require()` manifest — Metro can't resolve local images via a runtime path lookup, only static string-literal requires, so a generated manifest is the standard workaround for bundling this many images). Copied all 1,746 images (~98MB) into `app/assets/exercises/`.

`exercises` gained `equipment`, `level`, `category`, `instructions`, and `source_slug` columns (all nullable — populated for the built-in library, null for user-created custom exercises), with a migration for existing installs. `db/schema.ts`'s seeding logic now deletes the old placeholder set (identified by having no `source_slug`, so it never re-matches the new data) and bulk-imports the full dataset, guarded so the ~873-row insert only runs once rather than on every launch (verified: ~9ms first run, ~0ms subsequent runs in the smoke test). ExerciseDetailScreen now renders real images (horizontal scroll) and a numbered step-by-step guide instead of "coming soon" placeholders, plus equipment/level tags in the header.

Decision to bundle all images at full size (rather than compress or defer them) recorded in `docs/decisions/exercise-image-bundling.md`. Verified end-to-end via a real-dataset smoke test: migration from an old install (including a placeholder exercise that was actively logged in a cycle) preserves history correctly, the full program → cycle → logging flow works with a real imported exercise, and re-running `initSchema()` doesn't duplicate rows.

## 2026-07-16 (6)

### fix: preemptively fix the same FK bug for exercise deletion
Applied the same class of fix as the program-workout-deletion bug to `exercise_id`, which had the identical gap on both `program_exercises` and `cycle_sets` (no `ON DELETE` behavior — no delete-exercise feature exists yet, but this would have broken it silently the same way). `program_exercises.exercise_id` is now `ON DELETE CASCADE` (it's just config — if the exercise is gone, drop it from the program). `cycle_sets.exercise_id` is now nullable with `ON DELETE SET NULL`, and `cycle_sets` gained a denormalized `exercise_name` column (copied at insert time, same pattern as `cycle_workouts.label`) so historical logged sets stay fully readable and correctly grouped even after the source exercise is deleted. Added migrations for both tables. Updated the type layer (`CycleSet`/`CycleWorkoutExercise.exercise_id` now nullable) and `WorkoutScreen` to handle a deleted exercise's sets gracefully (shown as "removed from library", no "Add Set" for it, existing sets stay fully editable). Verified end-to-end: deleting an exercise that's both in the program and has logged history correctly cascades the program config while preserving every logged set.

## 2026-07-16 (5)

### fix: deleting a program workout failed silently
`cycle_workouts.program_workout_id` referenced `program_workouts(id)` with no `ON DELETE` behavior, so with foreign keys enforced, deleting a program workout that any cycle had ever been stamped from (i.e. almost always) threw a `FOREIGN KEY constraint failed` error the UI never surfaced — the workout just stayed put with no feedback. Changed the column to nullable with `ON DELETE SET NULL`, so deleting a workout from the program now works while every cycle's history (label, logged sets) stays fully intact. Added a migration to rebuild `cycle_workouts` for anyone who already has data on the old shape. Verified by reproducing the original FK error on the old schema, then confirming the same delete succeeds post-migration with history preserved.

## 2026-07-16 (4)

### feat: exercise detail page with personal notes
Added ExerciseDetailScreen, opened by tapping an exercise in the Exercises tab. Shows the exercise's name/muscle group/type and an editable personal notes field (debounced save to `exercises.notes`, a new nullable column with a migration for existing installs). Images and step-by-step guides are visible as placeholder sections on the page but not yet functional — first step toward the full per-exercise page. Verified the schema migration and notes round-trip against a real SQLite engine.

## 2026-07-16 (3)

### chore: rename frontend/ to app/
Renamed the top-level project directory from `frontend/` to `app/` — this repo has no backend (the `frontend` naming was inherited from the original MyFoodHabits full-stack layout), so `app/` better reflects that it's the whole product. Updated `package.json`/`package-lock.json` name field, `start.sh`, `README.md`, and doc path references accordingly. Also corrected a few unrelated stale lines in `README.md` found along the way (leftover "sessions"/"weeks" language, a "Backend: kept in the repo for reference" claim that isn't true — no backend code exists, just an unused `docker-compose.yml` Postgres leftover).

## 2026-07-16 (2)

### chore: remove body weight tracking
Removed the Weight tab and all body-weight-tracking functionality (WeightScreen, WeightGraphScreen, `db/weight.ts`, the `weights` table, and `user_settings.weight_unit`) — not something this app needs. Added a schema migration to drop the `weights` table and `weight_unit` column on existing installs, preserving the user's `name`. Verified via the SQL-layer smoke test, including the migration path from an old install.

## 2026-07-16 (1)

### feat: implement the cycle-based workout tracker (Phase 1 + 2)
Replaced the "week" domain model with "cycles" — a repeating program of workouts, manually advanced instead of tied to calendar days. Rewrote the SQLite schema (`exercises`, `program_workouts`, `program_exercises`, `cycles`, `cycle_workouts`, `cycle_sets`), seeded a starter exercise library, and built the full DB service layer. Replaced all MyFoodHabits screens with CycleScreen, WorkoutScreen, ProgramScreen, EditProgramWorkoutScreen, ExercisesScreen, and CreateExerciseScreen; simplified WeightGraphScreen and SettingsScreen to drop calorie/TDEE-specific logic. Verified the full domain flow (program → cycle → logging → auto-complete → archive → progression pre-fill) against a real SQLite engine.

## 2026-06-08 (1)

### chore: initial commit — MyTrainingHabits workout tracker
Bootstrapped MyTrainingHabits, a mobile workout tracking app built on Expo + expo-sqlite. Reused the UI shell, navigation structure, and offline SQLite infrastructure from a previous food-tracking project. Defined the workout domain schema (exercises, workout_sessions, session_exercises, exercise_sets, routines, routine_exercises, weights). All docs written from scratch for the new domain.
