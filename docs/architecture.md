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
| WorkoutScreen             | A single cycle workout — expandable exercise cards with inline set rows (reps, weight, per-set checkbox — unlogged fields show the exercise's latest logged reps/weight (program target reps if no history) as a grey placeholder, see below); for an exercise with a weight list (see Weight Lists below) the weight field opens a picker grid instead of the keyboard; each card header has guide/history shortcut icons (hidden for exercises removed from the library); long-press a card header to add/edit the same per-program-exercise note EditProgramWorkoutScreen edits (hidden if the exercise's program_exercises row no longer exists) |
| WorkoutInfoScreen         | The (i) button in WorkoutScreen's header — overview of the day: exercise/set/muscle counts, upper/core/lower split, combined body map, sets per muscle (direct/indirect, with which exercises), muscles not worked, and each exercise's main/helper muscles (tap → ExerciseDetailScreen); see Day Overview below |
| ExercisesScreen           | Browse and search the exercise library; muscle-group filter chips plus a CUSTOM chip (right after ALL) for user-created exercises only |
| CreateExerciseScreen      | Create a custom exercise (name, muscle group, type)                       |
| ExerciseDetailScreen      | Per-exercise page (tap an exercise in ExercisesScreen, or the guide icon on WorkoutScreen) — weight input choice (typed in, or one of the fixed weight lists — see Weight Lists below), personal notes, images, and step-by-step guide (guide/images only populated for the built-in library — free-exercise-db plus the curated additions — not custom exercises); links to ExerciseHistoryScreen |
| ExerciseHistoryScreen     | Every completed set ever logged for one exercise, grouped by day, most recent first (reachable from ExerciseDetailScreen or the history icon on WorkoutScreen) |
| ProgramScreen             | The repeating program — ordered list of workouts, tap to edit             |
| EditProgramWorkoutScreen  | Edit a program workout's label and its exercises/default targets; long-press an exercise to add/edit a short note on its inclusion in this workout |
| SettingsScreen            | Rest timer on/off toggle (default on), duration (minutes + seconds inputs), and play-sound toggle (default on); "Editing older sets" status row with an "Ask again" reset for an active "Don't ask again for 1 hour" choice (see Back-dating Sets below) |

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
  searchExercises(q, filter)  Search exercises by name; filter is a MuscleGroup or 'CUSTOM'
                               (user-created, any muscle group — mutually exclusive with a
                               muscle-group filter). Ranks custom exercises first, then by
                               logged-set count, name only as the final tiebreaker (see below)
  getExercise(id)             Get a single exercise
  updateExerciseWeightOptions(id, listId | null)
                               Set which fixed weight list (utils/weightOptions.ts) the
                               exercise's set weights are picked from; null = typed in
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
  markSetComplete(id, done, at?)      Stamps completed_at (now, or an explicit earlier time);
                                       unmarking keeps completed_at so it can be restored later
  deleteSet(id)
  getLastSetsForExercise(exerciseId, excludeCycleWorkoutId)   Latest logged sets, any day (set suggestions)
  getTargetStreak(exerciseId, targetReps, excludeCycleWorkoutId)   Sessions in a row that hit target reps at one weight ("raise weight?" hint)
  getExerciseHistory(exerciseId)       Every completed set ever, most recent first (ExerciseHistoryScreen)

db/program.ts
  getProgram()                 List all program workouts in order
  getProgramWorkout(id)        Get a program workout with all its exercises
  createProgramWorkout(data)   Add a new workout to the program
  updateProgramWorkout(id, patch)
  deleteProgramWorkout(id)

db/settings.ts
  getSettings()               Get user settings row (rest_timer_enabled, rest_timer_seconds,
                                                       rest_timer_sound_enabled,
                                                       rest_timer_headphones_only)
  updateSettings(patch)       Partial update of settings

services/restTimerNotifications.ts
  scheduleRestCompleteNotification(seconds, soundEnabled, headphonesOnly)
                                               Android: hands off to the rest-alarm native
                                               module. iOS: schedules a plain expo-notifications
                                               notification. Returns a handle, or null if
                                               notification permission isn't granted.
  cancelRestNotification(handle)               Cancel a pending one (no-op if already fired)
  clearLingeringRestNotification()            Android only — clears a stray "Rest complete"
                                               notification; called on app foreground, not tied
                                               to the notification's own tap action (see below)
  openExactAlarmSettings()                    Android only — deep-links to the OS "Alarms
                                               & reminders" toggle for this app (see below)

modules/rest-alarm/  (local native module, Android only — see Rest Timer below)
  scheduleRestAlarm(triggerAtMillis, soundEnabled)
                                               Native AlarmManager alarm; fires even if the
                                               app process is dead
  cancelRestAlarm()                           Cancels the pending alarm and stops the service
                                               if it's already running
  clearRestAlarmNotification()                Cancels the notification if one is showing; a
                                               safe no-op if there's nothing to clear
```

## Exercise Data (free-exercise-db import)

The built-in exercise library (885 exercises, `source = 'SEED'`) is bulk-imported from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (873 exercises, public domain) plus 12 hand-curated additions (see below), not hand-seeded. Regenerating it (e.g. after an upstream dataset update) is a one-time offline step, not something that happens on-device:

```text
scripts/import-free-exercise-db.py
  Reads free-exercise-db/dist/exercises.json (expects the free-exercise-db repo
  checked out as a sibling of app/) and the curated additions in
  scripts/extra-exercises.json (validated, appended last), and generates:
    - app/src/db/seedExercisesData.ts   structured exercise data (incl. primary/
                                         secondary muscles), imported by
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

`db/schema.ts`'s `seedExercises()` deletes the old placeholder library (identified by `source = 'SEED' AND source_slug IS NULL` — every real import row always has a `source_slug`) and bulk-inserts from `SEED_EXERCISES_FULL`, guarded by a row-count check so the ~885-row insert loop only runs once, not on every app launch. User-created custom exercises (`source = 'USER'`) are never touched by this — apart from the ones a curated addition replaces, below.

### Curated additions (former custom exercises)

`scripts/extra-exercises.json` holds library entries free-exercise-db doesn't have: the 12 custom exercises created on the phone, made into real library exercises on 2026-11-04. Each entry has a `MTH_`-prefixed slug (so it can't collide with a future upstream id), the usual fields with `instructions` as a list of steps, `images` (paths under `app/assets/`: new images in `exercises-extra/<slug>/`, or free-exercise-db photos reused by path), provenance (`image_sources`, `sources`), and `replaces_custom`, the custom exercise names it replaces. The import script checks each entry (unique slug and name, valid enums, images exist) and appends it to `seedExercisesData.ts` (with `replaces_custom`) and the image manifest. It never touches `exercises-extra/`. To change a curated exercise, edit the JSON and re-run the script.

- **Images** come from StrengthLog's demo videos (start and end frames) and stills, Muscle & Strength, and free-exercise-db's own bodybuilding.com photos where those already show the exact exercise or a machine variant. ExerciseDetailScreen shows images in a 3:2 box with `resizeMode="cover"`, so square sources were fitted whole into 1200×800 with a blurred, darkened copy of the photo filling the sides. Cropping them would have cut off heads and feet. For exercises that offer a choice ("Machine or Seated Cable Lateral Raise" etc.), there's a start/end pair per option and the guide has a setup step per option. No reputable source had photos of the *seated* cable lateral raise, so the guide says the photos show the standing version.
- **Promotion on device:** `promoteCustomExercises()` (`db/schema.ts`) runs before `seedExercises()`. It turns a custom exercise whose name matches a `replaces_custom` entry (ignoring case and surrounding whitespace, via `db/curatedExercises.ts`) into that library entry **in place**. The row keeps its id, so its `program_exercises` rows, every `cycle_sets` row and its notes/short note stay attached. Only `source` (→ `SEED`), `source_slug`, the name and the description fields change. A name change also updates the `cycle_sets.exercise_name` copies that still carry the old name, because WorkoutScreen shows that copy. The ordering matters: if seeding ran first, the entry would be inserted as a second row. Every launch also re-applies each curated entry's name and fields, so JSON edits reach installs that already have the entry. `seedExercises()`'s insert skips slugs that already exist, in case a promoted exercise had to keep its old name (the curated name already taken).
- **Backups:** `importBackup()` maps a backup's custom exercise with a replaced name onto the local library entry the same way: notes are restored onto it and set name copies are renamed. Restoring a backup made before the promotion therefore ends in the same state as the in-place upgrade instead of bringing the custom exercises back as duplicates (or as "Name (custom)").
- **Promoted in place, not merged** into a similar free-exercise-db entry (e.g. "Dumbbell Lateral Raise" vs. upstream "Side Lateral Raise", "Incline DB Curl" vs. "Incline Dumbbell Curl"). This keeps the user's own exercise names and history exactly as they were. The cost is a few near-duplicate exercises in the library.

## Muscles Worked (guide page body map)

ExerciseDetailScreen's **Muscles worked** section shows a front/back body with the exercise's primary muscles in dark green and secondary ones in light green, followed by one row per muscle: the everyday name, the anatomical muscles behind it, and what they do.

- **Data:** every library exercise carries free-exercise-db's `primaryMuscles`/`secondaryMuscles` (17-name vocabulary: chest, lats, middle back, ...) as `primary_muscles`/`secondary_muscles` in `seedExercisesData.ts`. Curated entries set them in `extra-exercises.json`, plus optional `muscle_details`, a narrower anatomy line per muscle (e.g. "Lateral (side) deltoid" for a lateral raise instead of all three deltoid heads). Like the images, this is looked up from the bundled data by `source_slug` (`db/exerciseMuscles.ts`), not stored in SQLite, so data updates need no migration. Custom exercises have no muscle data and show a placeholder.
- **Muscle reference:** `src/assets/muscles.ts` (`MUSCLE_INFO`) maps each of the 17 names to its anatomical muscles and function.
- **Body drawing:** `src/assets/bodyMap.ts`, generated by `scripts/import-body-map.py` from the SVG paths of [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) (MIT). Only the path data is used, not the package's component: regions are regrouped under free-exercise-db's muscle names, and its one "upper-back" region is split into lats (+ teres major) and middle back (infraspinatus/teres minor). The drawing has no separate rhomboids, so the back-view trapezius lights up for "middle back" as well as "traps", and the gluteal region stands in for the hip abductors. Drawn with `react-native-svg` in `components/MuscleMap.tsx`.

## Program Exercise Notes

A short free-text note (`program_exercises.notes`) on a single exercise's inclusion in a specific program workout — e.g. "start light" — distinct from `exercises.notes` (the exercise's own general notes, edited on ExerciseDetailScreen). Editable by long-press from two places, both editing the *same* row, not independent copies:

- **EditProgramWorkoutScreen** — always shown (small italic text under the exercise name) when present; long-press opens an inline text field.
- **WorkoutScreen** — same display/edit UX on each exercise card's header, long-press alongside the existing tap-to-expand (RN's touch system distinguishes short tap from long press on the same `TouchableOpacity` without conflict). Resolving *which* `program_exercises` row a cycle exercise came from reuses `getCycleWorkoutDetail`'s existing `program_exercises` join (originally added just for `ORDER BY pe.order_index`) — `pe.id`/`pe.notes` were simply added to the same `SELECT`. This can be `null` (hidden, no long-press wired up) if the program workout or this exercise's entry in it was deleted after the cycle was stamped out, since there's no longer a row to attach a note to.

Kept deliberately minimal per how it was asked for: no note means no extra UI at all; a note is one line of small italic text, nothing else about either screen's layout changes.

## Exercise Search Ranking & CUSTOM Filter

`searchExercises`'s default order isn't alphabetical — it's `(source = 'USER') DESC, logged-set-count DESC, name`. Custom (user-created) exercises always outrank every seed-library exercise regardless of how much either has been used; among exercises with the same custom-ness, the ones with more logged sets (`cycle_sets` rows with non-null reps/weight, counted via a `LEFT JOIN` subquery) rank higher; name is only the final tiebreaker. The intent is surfacing exercises the user actually created or trains ahead of the untouched majority of the 873-exercise seed library, not literal alphabetical browsing.

`filter: MuscleGroup | 'CUSTOM'` is a single mutually-exclusive selector, not two independent dimensions — `'CUSTOM'` means "user-created, any muscle group" and clears any muscle-group condition; ExercisesScreen's chip row reflects this by putting a CUSTOM chip in the same row as the muscle groups (right after ALL), not a separate filter control.

## Target-Met Hint (WorkoutScreen)

Under an exercise's name, a small green `trending-up` line shows when the target reps were hit on every set at one weight the last time it was done — a nudge to raise the weight — e.g. "Hit 10 reps on all sets @ 60 kg last time", or "· 3× in a row" for a streak. From `getTargetStreak(exerciseId, program_exercise_default_reps, currentCycleWorkoutId)`:

- **Target** — the card's `program_exercise_default_reps`; no target, no hint.
- **Sessions** — every workout (any day, any cycle) with at least one completed set of the exercise, newest first by latest `completed_at`, excluding the workout being viewed (same as the set suggestions).
- **A session counts** only if *every* set row of the exercise in it is completed, each with reps ≥ target, all at the same weight (or all without one, e.g. bodyweight). A set left unchecked means the session doesn't count.
- **Streak** — counted from the newest session until one doesn't count or used a different weight than the newest, so raising the weight starts a new streak. If the newest session doesn't count there's no hint at all.

## Superset Ideas (WorkoutScreen)

A collapsible "Superset ideas" card (`components/SupersetTip.tsx`) at the top of a workout lists which of the day's exercises pair well as supersets, each with its reason. It's hidden when nothing pairs up. The pairing is `suggestSupersets()` in `src/utils/supersets.ts` (pure), based on Zhang et al., *Superset Versus Traditional Resistance Training Prescriptions*, Sports Medicine 2025 (meta-analysis of 19 studies). Supersets took about a third less time with the same strength and hypertrophy results. Agonist–antagonist pairs raised reps, and pairs for the same muscles lowered the volume lifted.

- **Muscles** — the library's primary/secondary tags via `getExerciseMuscles(source_slug)`, so custom exercises (no slug) and cardio are left out. free-exercise-db's single "shoulders" tag is split into front/side/rear delts by name (press → front, lateral raise → side, face pull/reverse fly → rear). As a helper muscle it counts as the front delt for pushes and the rear delt for pulls.
- **Never paired** — when one exercise's primary muscle is any muscle of the other (curl after a row), when both have a delt head as primary, or when both load the lower back or the forearms (spine and grip).
- **Fit** — opposing primaries (chest/front delts ↔ back, chest ↔ rear delts, biceps ↔ triceps, quads ↔ hamstrings, abs ↔ lower back, abductors ↔ adductors) score 5, upper body + lower body 2, anything else non-competing 1. One opposing pair therefore always beats the two weaker pairs it would have to be split into.
- **Choice** — the set of pairs with the highest total, found exhaustively over subsets (memoised bitmask, first 16 eligible exercises). Ties go to pairs closer together in the day's order, so following the ideas needs the least reshuffling.

## Day Overview (WorkoutInfoScreen)

The (i) button at the top right of a workout opens an overview of that day, computed on the spot by `buildDayOverview()` in `src/utils/dayOverview.ts` (pure) from the day's exercises and the library's muscle tags (`getExerciseMuscles(source_slug)`). No text is generated: the descriptions are `MUSCLE_INFO`'s, and everything else is counts.

- **Volume** is counted in sets: an exercise's sets are *direct* sets for its primary muscles and *indirect* sets for its secondary ones. Muscles are sorted by direct, then indirect sets. Each muscle lists the exercises it's the main muscle in and the ones it helps in.
- **Body map** — the shared `MuscleMap`: dark for muscles that are primary in at least one exercise, light for muscles that only help.
- **Focus** — the share of the day's sets per region (upper body / core / lower body, by `REGION_OF`), using each exercise's primary muscles. An exercise whose primary muscles span regions splits its sets evenly between them.
- **Not worked today** — muscles from the 17-name vocabulary that no exercise touches.
- Custom exercises and exercises removed from the library have no muscle data. They count towards the exercise and set totals only, and their entry says why there's no muscle info.

## Set Logging Pre-fill (WorkoutScreen)

Each unlogged set's reps/weight fields show a suggestion via `placeholder` (grey, `#bbb`) rather than preloading it into the real `value` — visually distinct from something actually entered, and doesn't get silently saved just because the field was rendered. The suggestion is **the same on every day the exercise appears**: the latest logged result for that exercise, regardless of which program workout or cycle it came from.

- **Source** — `getLastSetsForExercise(exerciseId, currentCycleWorkoutId)`: the completed sets from the workout holding this exercise's most recently completed set (latest `completed_at`, any cycle including the active one), excluding the workout being viewed so checking off its own sets doesn't shift the suggestions for the rest. Matched positionally by set index — set #1 suggests from last time's set #1, etc.; sets beyond last time's count reuse its final set.
- **Reps** — `lastSet.reps`, falling back to the program's `default_reps` for this exercise (`CycleWorkoutExercise.program_exercise_default_reps`) only when there's no history yet. `default_reps` is per program workout, so it's no longer the primary source — it would make the same exercise suggest different reps on different days.
- **Weight** — `lastSet.weight_kg`. Not from `program_exercises.default_weight_kg`, which exists in the schema but has no UI to set it and nothing writes to it — effectively vestigial; don't be misled by it into thinking weight pre-fill comes from there.

**Marking a set complete with a field left blank takes on the shown suggestion as the real saved value** (`SetRow.handleToggle` in `WorkoutScreen.tsx`) — un-marking a set never does this, and a field the user already typed into is left exactly as entered, whether that's a plain number or something that overrides the suggestion. This is why the state seeding on mount deliberately only reads `set.reps`/`set.weight_kg` (the actually-saved value), never the suggestion — keeping "shown as a hint" and "committed to the database" as two clearly separate states until the user (or a completed checkbox) merges them.

## Weight Lists (picking a set's weight instead of typing it)

Some equipment only comes in fixed weights — pin-selected weight stacks and the gym's dumbbell rack — so an exercise can be switched from typing the weight to picking it from a list. Off by default; enabled per exercise under **Weight input** on ExerciseDetailScreen, stored as `exercises.weight_options` (the list's id).

- **Lists** are hard-coded in `src/utils/weightOptions.ts` (`WEIGHT_OPTION_SETS`): weight stacks 2.5–44.5 kg (steps of 3.5, add-on +1.75), 5–117 kg (steps of 7, add-on +3.5) and 7.5–82.5 kg (steps of 7.5, add-on +3.75), and dumbbells 1–10 kg then 12.5–32.5 kg in 2.5s. The ids are stored data — never rename one; add a new list instead. An unknown id (e.g. from a newer backup) falls back to typing.
- **Add-on:** a stack's add-on weight can go on top of any step. The picker (`components/WeightPickerModal.tsx`) has an add-on checkbox above the grid; the grid shows the totals, and tapping one saves it (step + add-on if checked) and closes. Toggling the add-on with a step already picked updates that pick at once. The saved value is just the total in `cycle_sets.weight_kg` — `decomposeWeight()` splits it back into step + add-on to highlight it.
- **Suggestions** work as for typed weights: an empty set shows last time's weight in grey (outlined dashed in the grid, and it sets the add-on checkbox's starting state), and checking off an empty set saves it. A saved weight that isn't on the list (typed in before switching) is still shown and kept; the picker says so.
- **Saving:** a pick is written immediately rather than debounced, and cancels any pending debounced reps save, which would otherwise write the old weight back.
- **Backup:** `weight_options` is included for custom exercises (whole row) and for seed exercises (alongside notes; a seed exercise with only a weight list is exported too).

## Back-dating Sets in Older Workouts (WorkoutScreen)

Checking off a set stamps `cycle_sets.completed_at`, which is what ExerciseHistoryScreen groups by day. Going back to fix a mistake in an older workout (uncheck → edit → re-check, or checking a set that was missed) would otherwise stamp it with the current time and move it to the wrong day in history. So when a set is checked off, `suggestCompletionTime()` (`src/utils/setTiming.ts`, pure) decides whether to ask:

- **Set was checked off before** (then unchecked): if that earlier `completed_at` is on a previous calendar day or 2+ hours ago, offer to **keep the original time**. This only works because `markSetComplete(id, false)` now leaves `completed_at` in place instead of clearing it — history filters on `is_complete = 1`, so the leftover value is invisible until it's either restored or overwritten.
- **Set was never checked off**: if the workout's latest completed set is on a previous day or 2+ hours ago, offer an **estimated time**: midpoint of the neighbouring completed sets of the same exercise, or one "gap" after the previous / before the next one; failing that, one gap after the nearest earlier exercise's last set (or before the nearest later exercise's first set). The gap is the median spacing between consecutive sets in that workout (ignoring gaps > 20 min), falling back to rest-timer duration + 60s. Never later than now.
- Otherwise (recent, or nothing logged in the workout yet) there's no prompt — current time, as before.

The prompt (`SetTimePromptContext`, a `Modal` mounted in `App.tsx`) offers original/estimated time, current time, or Cancel (set stays unchecked; nothing else is touched). Choosing the earlier time doesn't start the rest timer. Editing reps/weight on an already-completed set never prompts — that has never touched `completed_at`.

**"Don't ask again for 1 hour"** checkbox remembers the choice (`original` or `now`) in context state — in memory only, so an app restart simply means asking again. While active, `SetTimeChoiceToast` shows a slim bar at the top of WorkoutScreen with the time left and an "Ask again" button, and SettingsScreen's "Editing older sets" row offers the same reset.

## Rest Timer

Started automatically whenever a set is checked off in WorkoutScreen (not when un-marking one). Three independent pieces, all driven from `AppContext`:

- **In-app countdown** — `RestTimerBanner` (mounted globally in `App.tsx`, above `RootNavigator`, so it's visible on every tab, not just while on WorkoutScreen). Tracks an epoch-ms `restTimerEndAt` rather than an accumulating counter, so it stays correct across the app being backgrounded/resumed — no drift, no need to persist/restore a running interval. When the countdown reaches zero on its own, it calls `dismissRestTimerBanner()` — **not** `cancelRestTimer()` — to clear itself. Those two look similar but aren't interchangeable: `cancelRestTimer()` (the "Skip" button) tells the platform layer to actually cancel/stop the scheduled alert, and on Android that means stopping a live foreground service — calling it at the exact moment the countdown naturally reaches zero raced with (and killed) the native alert that was firing at the same instant, which is why sound never played while the app was open in an earlier version of this feature. `dismissRestTimerBanner()` only clears local UI state and never touches the platform layer, so the native alert (already fired, or about to) is left alone.
- **Rest-complete alert, Android** — `modules/rest-alarm`, a local native module (see below), not `expo-notifications`.
- **Rest-complete alert, iOS** — `services/restTimerNotifications.ts` schedules a plain `expo-notifications` local notification. Unchanged since it was first built; iOS was never the device any of the sound bugs below were reported or debugged against. **Known limitation:** Expo's notification API doesn't expose a live-updating countdown *inside* the notification, so (as on Android) it's a one-shot "time's up" alert, not a ticking display — the in-app banner is what counts down.

`user_settings.rest_timer_enabled` (default 1/on) gates `AppContext.startRestTimer()` — it's a no-op when off, so `WorkoutScreen`'s call site doesn't need to know about the setting. `user_settings.rest_timer_seconds` (default 120) controls the duration; SettingsScreen edits it as separate minutes (1 digit, 0-9) + seconds (2 digits, 0-99) text inputs rather than presets, sanitized to digits-only and capped by `maxLength`, saved (debounced) only when the combined total is > 0 — a 0:00 duration is refused with an inline warning rather than silently falling back to something else. `user_settings.rest_timer_sound_enabled` (default 1/on) controls whether the alert plays sound at all (Android: skips `MediaPlayer` and posts a silent banner; iOS: `content.sound: false`). `user_settings.rest_timer_headphones_only` (default 0/off, Android only, toggle only shown while sound is on) makes the sound never play through the speaker — see the routing note in the `modules/rest-alarm` section.

### `modules/rest-alarm` — why a native module was necessary

The straightforward approach — an `expo-notifications` scheduled notification with a custom sound — went through several rounds of channel-config fixes (custom sound file, `AudioAttributes.usage = ALARM`, `bypassDnd`, `AudioAttributes.FLAG_AUDIBILITY_ENFORCED`) and **still didn't play on the test device (Samsung Galaxy S23, One UI) with its ringer mode set to "Vibrate."** Full history of that sequence, including exactly what each attempt fixed and didn't, is in `CHANGELOG.md`'s 2026-07-21 entries — worth reading before ever touching notification-channel sound config in this codebase again, so an already-ruled-out fix doesn't get re-attempted.

The conclusion that sequence led to: a sound played via `NotificationChannel` is fundamentally still subject to Android's (and apparently this OEM's) notification-sound suppression, no matter which `AudioAttributes` are set on it. The only way around that ceiling is to stop asking the *notification system* to make the sound, and have the *app* make it directly — the same architecture real alarm-clock apps use:

```text
AlarmManager (native, exact-alarm)
  → RestAlarmReceiver (BroadcastReceiver)
    → RestAlarmService (foreground service, started from the receiver — this is an
                         explicitly-documented exemption to Android's background-start
                         restrictions specifically for AlarmManager-triggered receivers)
      → posts a high-importance "Rest complete" notification (heads-up popup + vibration;
        the channel's own sound is explicitly silenced — see below)
      → if soundEnabled: MediaPlayer at half volume, AudioAttributes.usage = ALARM, requests
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
- **`cancelRestAlarm()` is destructive, not a harmless no-op — call it deliberately.** Unlike cancelling an already-fired `expo-notifications` notification (which was always a safe no-op), this cancels the pending `AlarmManager` registration *and* calls `stopService()`, which — if the service is already running/mid-playback — kills it immediately. The JS layer only calls this from an explicit user action (`AppContext.cancelRestTimer`, the "Skip" button); the countdown reaching zero on its own goes through `dismissRestTimerBanner()` instead, which never reaches this module. Getting this wrong (as an earlier version of this feature did) silently kills the sound exactly when the app is in the foreground — see the Rest Timer section above.
- **`stopForeground` uses `STOP_FOREGROUND_DETACH`, not `STOP_FOREGROUND_REMOVE`.** REMOVE deletes the notification the instant the service stops — since that happens right when playback ends (a few seconds in), the notification would flash briefly and vanish. DETACH stops the service but leaves the already-posted notification visible/dismissible, like a normal notification.
- **Notification channel importance is HIGH, with its own sound explicitly silenced.** `IMPORTANCE_LOW` (the original choice) never shows a heads-up popup and never vibrates, full stop — regardless of anything else configured on it, which is why the alert was initially only appearing silently in the shade with no vibration. `IMPORTANCE_HIGH` fixes that, but a HIGH-importance channel plays the system's default notification tone by default unless told otherwise — `setSound(null, null)` on the channel prevents that from stacking on top of the MediaPlayer sound this module already plays directly. Channel id bumped (`rest-alarm-service` → `rest-alarm-service-v2`, old one deleted on setup) since importance/sound are exactly the kind of channel-creation-time-locked settings this whole feature has repeatedly been bitten by reusing an id across.
- **Playback volume is at 25%** (`MediaPlayer.setVolume(0.25f, 0.25f)`) — first lowered to 50% for being too loud at the sound file's native level, then to 25% on further feedback.
- **Respects the phone's Media volume specifically, as an explicit opt-out — not ringer/notification volume, not Do Not Disturb.** Before playing, `isMediaVolumeZero()` checks `AudioManager.getStreamVolume(STREAM_MUSIC)`; if it's 0, `playSound()` is skipped entirely (the notification banner and vibration still happen). This is deliberately narrower than "respect all volume settings" — the whole rest of this module exists specifically to survive vibrate mode/notification volume/Do Not Disturb (see the multi-round saga above), and that's unchanged. Media volume zero was called out by the user as a distinct, intentional signal worth honoring on its own — turning that slider all the way down is a deliberate action, not a passive system state the way ringer mode can be.
- **Output routing — headset vs. speaker.** The Alarm stream is special-cased by Android to play through the built-in speaker *in addition to* any connected headphones. By default the service finds a connected headset at fire time (`findConnectedHeadsetDevice()`: wired, USB, Bluetooth A2DP/SCO, hearing aid, and Bluetooth LE Audio `TYPE_BLE_HEADSET`/`TYPE_BLE_SPEAKER`) and pins playback to it with `setPreferredDevice()`; with no headset it plays on the speaker. `setPreferredDevice()` is only a hint, though — after the One UI 9 update, the alert was still heard through the speaker with Galaxy Buds connected while music was playing. The **Headphones only** setting (`rest_timer_headphones_only`) is the reliable fix: with no headset connected the sound is skipped entirely, and with one connected it plays on the **Media** stream (`USAGE_MEDIA`, no `FLAG_AUDIBILITY_ENFORCED`) instead of the Alarm stream — Android never duplicates media audio to the speaker while headphones are attached. Losing the Alarm stream's vibrate/DND bypass doesn't matter in that mode since ringer mode/DND don't silence media. Trade-off: media volume applies, and a headset with no prior media session can read 0 on that route (see the CHANGELOG 2026-08-04 headset fix), so the alert can be silent then.
- **Tapping the notification launches the app directly** via a `PendingIntent.getActivity()` built right in `RestAlarmService.buildContentIntent()` and set as the notification's own `setContentIntent`. `FLAG_ACTIVITY_REORDER_TO_FRONT` deliberately *resumes* the existing task (bringing back whatever screen — e.g. the workout being logged — was already showing, since React Navigation's stack lives in the still-running JS engine) rather than cold-launching a fresh instance, which would reset navigation to the app's initial route. This only lands on the exact previous screen if the process is still alive, which is the common case for a rest-length backgrounding; no explicit deep-linking (passing a workout id through the alarm → notification intent chain) was built, since resuming the existing task already covers the common case without it.
- **Clearing the notification is a *separate*, deliberately decoupled mechanism — not the tap action.** Two earlier attempts routed the tap through `RestAlarmReceiver` (cancel the notification, then launch the app — first via a raw `context.startActivity()`, then via a secondary `PendingIntent.getActivity(...).send()`) specifically so the clear would be guaranteed rather than relying on `setAutoCancel`. **Both broke the app from reopening at all**, even though the receiver only ever ran because of that exact tap. The most likely explanation: Android's background-activity-launch "was this user-initiated" exemption is tied specifically to a notification's own direct content-intent activation, and doesn't survive being re-dispatched through an intermediate `BroadcastReceiver` — not even via a second `PendingIntent`. Confirmed by elimination: the *only* version that's reliably reopened the app on-device is a `setContentIntent` built directly, never routed through the receiver. Given that, clearing is now handled by `clearRestAlarmNotification()` (`RestAlarmModule.kt`, exported via `modules/rest-alarm/index.ts` as `clearRestAlarmNotification()`, wrapped by `restTimerNotifications.ts`'s `clearLingeringRestNotification()`), called from `AppContext`'s `AppState` listener whenever the app becomes foregrounded — for *any* reason (notification tap, app icon, recents), not tied to the tap specifically. `setAutoCancel(true)` is left on the notification too as a harmless second path to the same result, but the `AppState`-triggered clear is what's actually relied on.
- **A new alert notification explicitly cancels the previous one first** (`NotificationManagerCompat.cancel(NOTIFICATION_ID)` before posting) — reusing the same `NOTIFICATION_ID` when posting should already replace-in-place rather than stack, but this removes any ambiguity for a notification that was already detached from its (by-then-stopped) foreground service.
- **`openExactAlarmSettings()` still applies** — this module schedules its own `AlarmManager` alarm directly, so the same exact-alarm permission situation (see below) still governs its timing accuracy.
- Verified via reading real source at each step (expo-modules-autolinking's search-path resolution, expo-modules-core's `Module`/`ModuleDefinition` Kotlin DSL, a real bundled module's `build.gradle`/`AndroidManifest.xml` for exact conventions) before relying on API-34 symbols; the project's actual `compileSdk`/`targetSdk` is 36, confirmed from a real build log, comfortably above that. A first build attempt failed at Gradle *configuration* time (`android.defaultConfig.versionName` not set — the React Native Gradle plugin requires it on every native module, including local ones; a real bundled module's `build.gradle` sets it and this one initially didn't) — fixed by adding a `defaultConfig` block. A second real-device round (sound built and worked, but only backgrounded; notification vanished within seconds) surfaced the two bugs described above.

**Native dependency:** `expo-notifications` requires the `ios`/`android` native projects to be regenerated (`npx expo prebuild --clean`) after being added or after `app.json`'s `sounds` array changes — a plain JS-only change wouldn't pick up the new native module, the Android permissions its config plugin adds, or a newly bundled sound asset (the plugin copies it into `android/app/src/main/res/raw` at prebuild time).

**Notification delay on Android 12+:** without the `SCHEDULE_EXACT_ALARM` permission, `expo-notifications` schedules the rest-complete notification as an *inexact* alarm (`AlarmManagerCompat.setAndAllowWhileIdle`, see its `ExpoSchedulingDelegate.kt`), which Android is free to defer for battery savings — some OEM skins (Samsung's One UI, notably) defer it substantially, proportionally worse for short timers. `app.json` declares the permission, but on Android 13+ it isn't auto-granted — the user has to flip on "Alarms & reminders" for the app manually. There's no JS API to check current grant status, so `openExactAlarmSettings()` just deep-links straight to that settings screen via `Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM')`, exposed as a row in SettingsScreen (Android only).

## Deployment

Not applicable for the current offline-first architecture. The app installs and runs entirely from the APK/IPA with no external dependencies. Note the exercise images add ~100MB to the installed app size (~98MB free-exercise-db, ~3.5MB curated additions) — a deliberate tradeoff, see `docs/decisions/exercise-image-bundling.md`.
