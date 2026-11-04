# Roadmap

## Guiding Rules

- Always keep the app runnable — never let it sit broken
- Build the smallest thing that proves the concept, then iterate
- Delay: authentication, cloud sync, advanced analytics, AI features
- Test the core loop constantly: can I log a completed set in under 5 seconds?

---

## Phase 1 — Foundation (Schema + Local DB Layer)

Goal: A working data layer that can store and retrieve cycles of workouts.

- [x] Design the SQLite schema (exercises, program_workouts, program_exercises, cycles, cycle_workouts, cycle_sets, user_settings)
- [x] Write `db/schema.ts` with `initSchema()` (CREATE TABLE IF NOT EXISTS + migrations)
- [x] Write `db/exercises.ts` — search, get, create, recent exercises
- [x] Write `db/program.ts` — CRUD for program workouts and program-exercises
- [x] Write `db/cycles.ts` — get active cycle, start a new cycle (finish current + stamp out fresh from program), mark workout complete
- [x] Write `db/sets.ts` — add/update/delete sets; mark set complete; get last sets for an exercise (progression)
- [x] Seed a starter exercise library (common lifts: squat, bench, deadlift, etc.)

**Milestone:** Can define a program, start a cycle, add sets to its workouts, and read them back. All data persists across restarts.

---

## Phase 2 — Basic Frontend

Goal: A working mobile UI for the full core loop.

- [x] CycleScreen — show the active cycle's workouts with a done-checkbox each; "New Cycle" button; tap a workout to open it
- [x] WorkoutScreen — show all exercises for a cycle workout with their sets; add/remove exercises
- [x] Add/edit sets (reps + weight) for an exercise within a cycle workout; show last cycle's values for progression — built as inline expandable set rows on WorkoutScreen rather than a separate LogExerciseScreen
- [x] ExercisesScreen — search exercises, muscle group filter; browse the library
- [x] Wire up all screens to the local DB layer

**Milestone:** Full core loop works on device — open app, log a workout, check it off, start a new cycle when ready.

---

## Phase 3 — Reduce Friction

Goal: Make logging fast enough that users actually want to use it daily.

- [x] ProgramScreen + EditProgramWorkoutScreen — edit the repeating program (add/remove/reorder exercises within a workout, set default targets) without disturbing the active or past cycles — built during Phase 2 since the app is unusable without it; reordering the *workouts themselves* within the program is not yet built (only exercises within a workout reorder)
- [ ] Cycle history — browse past finished cycles and their logged sets (this is per-cycle; per-exercise history is done, see below)
- [x] Rest timer — starts automatically when a set is checked off; in-app countdown banner (visible on any tab) + a local notification when it ends; on/off toggle (default on), duration (minutes + seconds, sanitized input), and notification sound toggle (default on, custom bundled sound) in Settings
- [ ] Rest timer: live countdown *inside* the notification (Android only) — `expo-notifications`' JS API doesn't expose Android's native chronometer notification style (`setUsesChronometer`/`setChronometerCountDown`), so this needs a small custom native module (Kotlin, via Expo's local-module pattern) that posts the notification directly — moderate scope, not just a config change. `app/modules/rest-alarm` (added 2026-07-21 for the rest-complete sound) is a local Kotlin module in the same area of the codebase and could plausibly share some scaffolding/conventions with this, though it doesn't itself post the chronometer notification. No iOS equivalent exists without a much larger separate undertaking (Live Activities/ActivityKit, its own Widget Extension target) — out of scope unless iOS support becomes a priority in its own right.
- [ ] Workout notes — free-text note field per cycle workout
- [x] Create custom exercise — form with name, primary muscle group, and type (strength/cardio/bodyweight)
- [x] Edit sets inline on WorkoutScreen (reps/weight) — delete-set UI not yet built (sets can only be added, not removed, from the workout screen)
- [x] Per-exercise history — ExerciseHistoryScreen shows every completed set for an exercise across all cycles, grouped by day, most recent first (`cycle_sets.completed_at`, stamped when a set is checked off)
- [x] Back-dating older sets — checking off a set in a workout from an earlier day / 2+ hours ago asks whether to keep its original (or estimated) time so it stays on the right day in history; "Don't ask again for 1 hour" with an undo toast + Settings reset

**Milestone:** User can log a typical training day in under 2 minutes. App feels fast.

---

## Phase 3.5 — Stabilise

Goal: Before touching the UI, make sure everything that exists actually works correctly and is properly documented.

- [ ] End-to-end walkthrough on a real device — test every feature on every screen
- [ ] Bug fixes and UX rough edges found during walkthrough
- [ ] Performance pass — pre-load this week's sessions and recent exercises on app open
- [ ] Review all docs against the codebase — anything in the docs that wasn't implemented, anything in the code that isn't documented

**Milestone:** Every existing feature works correctly on device. Docs and code are fully in sync.

---

## Phase 4 — UI Overhaul

Goal: Replace the functional-but-rough Phase 2 UI with a polished design that feels good to use daily.

- [ ] Define design system — color palette, typography scale, spacing tokens
- [ ] Redesign CycleScreen — clear workout list, completion indicators, "New Cycle" as a quick-log entry point
- [ ] Redesign WorkoutScreen — exercise cards with set rows, fast set entry, progression display
- [ ] Redesign ExercisesScreen — better empty state, muscle group filters
- [ ] Micro-interactions and loading states throughout
- [ ] Dark mode support

**Milestone:** App looks and feels intentional. Screenshots are worth sharing. Ready for real users.

---

## Phase 5 — Differentiating Features

Goal: Features that make this app meaningfully better than a notebook.

- [ ] Progression charts — per-exercise line chart of max weight over time
- [ ] Cycle summary — workouts completed, total volume, personal records hit this cycle
- [ ] Copy a previous cycle's actuals — "repeat last [Push Day]" shortcut
- [ ] Authentication — replace hardcoded user_id=1 with real sign-up/login
- [ ] Onboarding flow — first-run screen to set name and goals
- [x] Data backup — JSON export/import of all data from Settings
- [ ] Data export — CSV of the full training log
- [ ] Personal records — automatically flag when a new max weight is hit for an exercise
- [ ] Volume tracking — track total sets × reps × weight per muscle group per cycle
- [ ] Consistency streak — "X cycles in a row completed"

**Milestone:** App has a clear reason to exist. Users actively recommend it.

---

## Deferred (Post-Launch)

These get built only after there are real users with real feedback.

- Cloud sync (manual JSON backup exists, see Settings → Backup)
- Social features / sharing workouts
- AI coaching or program generation
- Advanced periodization tools
- Integration with wearables / health APIs
- Premium tier + payment integration
