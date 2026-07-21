# Changelog

All changes to the project are documented here.

---

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
