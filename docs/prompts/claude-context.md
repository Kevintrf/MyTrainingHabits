# Claude Context

This file is a briefing document for Claude. Read this at the start of any conversation to get full context on the project.

---

## Project Summary

**MyTrainingHabits** — a mobile workout tracking app. The core idea: logging training should be effortless. Open the app, log what you did, close the app. The history is there when you want to track progression or consistency.

The app is **cycle-oriented**, not calendar-oriented. You define a **program** once — a repeating, ordered list of workouts (e.g. Push/Pull/Legs) — and each **cycle** is one live run through it, at your own pace. The active cycle's workouts are checked off as you train; "New Cycle" (available any time, not gated on completion) archives the current cycle and stamps out a fresh blank one from the program. See [../../database/schema.md](../../database/schema.md) for the full model.

**MVP goal:** User can log a completed set in under 5 seconds.

**SLC model:** Simple, Loveable, Complete. Do the core well, not everything poorly.

This app does **not** track body weight — that functionality (Weight tab, `weights` table) existed briefly (carried over from the app's origin) and was deliberately removed.

---

## Origin

This project was originally **MyFoodHabits**, a calorie-tracking app. The UI shell, navigation structure, expo-sqlite infrastructure, and AppContext pattern were reused when it was repurposed into a workout tracker on 2026-06-08.

All food-specific screens, DB tables, and logic have been fully removed and replaced with the cycle/program workout model described above — no MyFoodHabits code remains in `app/src/`.

---

## Current Architecture

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Expo (React Native), TypeScript   |
| Database | SQLite (expo-sqlite, on-device)   |
| Backend  | Express (Node.js) — deferred, not required |

See [../architecture.md](../architecture.md) for the full breakdown.

See [../../database/schema.md](../../database/schema.md) for the database schema.

---

## Key Files

| File                                         | Purpose                                                      |
|----------------------------------------------|--------------------------------------------------------------|
| `docs/overview.md`                           | What the app is, core features, philosophy                   |
| `docs/architecture.md`                       | System design, screen list, DB layer API                     |
| `docs/roadmap.md`                            | Phased development plan with completion status               |
| `database/schema.md`                         | Full DB schema with ER diagram                               |
| `CHANGELOG.md`                               | Full history of every change made                            |

---

## Current Phase

**Phase 1 (Foundation) and Phase 2 (Basic Frontend) are complete.** Schema, full DB service layer, and all screens exist and are wired up.

**Current work is Phase 3.5 (Stabilise)** — the app has run successfully on a real Android device, but a full end-to-end walkthrough of every screen/feature hasn't happened yet. Remaining Phase 3 items (cycle history, workout notes, delete-set UI, reordering workouts within the program) are still open — rest timer is done. See `docs/roadmap.md` for the current checklist.

---

## Project Structure

```text
app/
  App.tsx               Wraps AppProvider + RootNavigator + RestTimerBanner; calls initSchema() on load
  src/
    db/
      client.ts          SQLite DB singleton (expo-sqlite)
      schema.ts           CREATE TABLE + migrations; initSchema() called on startup
      exercises.ts        exercise library CRUD + recent/search
      program.ts           CRUD for program workouts + program-exercises (the repeating template)
      cycles.ts             get/create active cycle, start a new cycle, mark workout complete
      sets.ts                add/update/delete cycle_sets, mark/unmark complete (stamps completed_at),
                              progression lookup, getExerciseHistory()
      settings.ts             user_settings CRUD (`rest_timer_enabled`, `rest_timer_seconds`,
                               `rest_timer_sound_enabled`)
      seedExercisesData.ts    AUTO-GENERATED — 873-exercise free-exercise-db data (see scripts/)
    services/
      restTimerNotifications.ts  schedule/cancel the rest-complete local notification
    assets/
      exerciseImages.ts    AUTO-GENERATED — static require() manifest, keyed by exercise slug
    components/
      RestTimerBanner.tsx  global floating countdown, mounted above RootNavigator
    context/AppContext.tsx  global state: userId, activeCycle, refreshCycle(), startNewCycle(),
                             restTimerEndAt, startRestTimer(), cancelRestTimer()
    navigation/RootNavigator.tsx  bottom tabs (Cycle, Program, Exercises, Settings) + stacks
    screens/
      CycleScreen            active cycle's workouts with done-checkboxes; "New Cycle" button
      WorkoutScreen           expandable exercise cards with inline set rows (reps/weight/checkbox);
                              guide + history shortcut icons per exercise
      ProgramScreen           ordered list of the program's workouts
      EditProgramWorkoutScreen  edit a program workout's label/exercises/default targets
      ExercisesScreen         search/browse the exercise library, muscle group filter
      CreateExerciseScreen    create a custom exercise
      ExerciseDetailScreen    notes, images, guide for one exercise
      ExerciseHistoryScreen   every completed set for one exercise, grouped by day
      SettingsScreen          rest timer on/off toggle + duration (minutes/seconds inputs)
                              + notification sound on/off toggle
```

There is no `WeightScreen`, `WeightGraphScreen`, or `db/weight.ts` — body weight tracking was removed on 2026-07-16. There is also no user profile/name field anywhere — `user_settings.name` was removed on 2026-07-18 (it was never used outside SettingsScreen itself). SettingsScreen is rest-timer-only now.

---

## Fresh Environment Setup

```bash
# Install dependencies
cd app && npm install

# Start the app
npx expo start --clear
```

No backend or database server required — everything runs on-device via expo-sqlite.

**Native builds:** `ios/` and `android/` are gitignored, generated folders (see `app/.gitignore`) — they should never be hand-edited. If they're missing, stale, or contain wrong bundle identifiers, regenerate them from `app.json` with `npx expo prebuild --clean`. Building/installing (`npx expo run:android`, `npx expo run:ios`) is long-running with buffered output — the user runs these manually rather than through an agent's shell tool, since piped output makes it look hung even when it's building fine.

---

## Known Gotchas

- **babel.config.js is required** in the Expo project root — without it Metro skips `babel-preset-expo` and the app crashes in Expo Go with TurboModule errors.
- **No `user_id` scoping anywhere in the schema.** Unlike the original MyFoodHabits tables, the workout schema doesn't carry a `user_id` column at all — the whole app is implicitly single-user. Auth (Phase 5) would need to add this back.
- **Expo SDK version mapping**: as of mid-2026, SDK 54 = React 19.1.0 + RN 0.81.5. Never guess SDK→RN mappings; run `npx expo start` and read the version warning output.
- **initSchema() must be called synchronously** before any component mounts — it's called at module load in `App.tsx`.
- **expo-sqlite doesn't work in the web target out of the box** — bundling fails on `./wa-sqlite/wa-sqlite.wasm` because no `metro.config.js` wasm asset config exists. Web was never a real target for this app (mobile-only); don't rely on `expo start --web` to verify changes. Verify the DB layer directly instead (swap `db/client.ts` for a `node:sqlite`-backed shim and run the real `db/*.ts` functions under `tsx` — see git history / past sessions for the pattern) or drive the actual app on-device.
- **Bundle identifiers must stay distinct from the old MyFoodHabits app.** `app.json` has `com.kevintrf.mytraininghabits` for both platforms; if the native `ios`/`android` folders are ever regenerated from an old checkout, verify they picked up this identifier and not `com.kevintrf.myfoodhabits` (the two would otherwise collide/overwrite on-device).
- **expo-notifications (added 2026-07-18 for the rest timer) needs a native rebuild.** Adding it (or any native module / new `app.json` plugin) doesn't take effect until `npx expo prebuild --clean` regenerates the native projects — a plain JS change alone won't pick up the new native code or the Android `POST_NOTIFICATIONS` permission the plugin adds.
- **Expo's notification API can't render a live-updating countdown inside a notification** — that's Android's native "chronometer" notification style, not exposed by `expo-notifications`. The rest timer's in-app banner counts down; the scheduled notification is a one-shot alert when time's up, not a ticking display.
- **Android 8+ ignores per-notification sound — only the channel's sound (fixed at channel creation) plays.** Found by reading `ExpoNotificationBuilder.kt`. To make the rest-complete sound toggleable, `restTimerNotifications.ts` maintains two channels (`rest-timer` with the custom sound, `rest-timer-silent` with none) and switches `channelId` based on the setting, rather than varying `content.sound` per call (which is silently ignored on API 26+).

---

## Coding Standards

- TypeScript everywhere — no plain JS files
- No `any` types without a comment explaining why
- DB calls go in `app/src/db/` — no SQL in components or context
- Components stay under ~200 lines — extract before they grow past that
- No ESLint/Prettier config is set up in this project currently — `npx tsc --noEmit` is the verification step

---

## Important Constraints

**Only one active cycle at a time.** Enforced at the DB level with a partial unique index (`cycles(is_active) WHERE is_active = 1`). Starting a new cycle finishes the current one first, in the same transaction.

**Sets are the atomic unit.** Each `cycle_set` stores `reps` + `weight_kg`. There's no dedicated cardio duration column yet — cardio exercises currently repurpose `reps` for a rough equivalent (deferred cleanup, see `database/schema.md`).

**Editing the program only affects future cycles.** The active cycle's `cycle_workouts`/`cycle_sets` are stamped out at creation time and are independent of later program edits — this is intentional, not a bug.

**Phase 5 includes authentication** — deferred until after the core loop works and is tested daily. Would require adding `user_id` scoping back into the schema.

**Delay these until post-launch:**

- Cloud sync / backup
- Social features / sharing
- AI coaching or program generation
- Advanced periodization tools
- Premium tier / payments
