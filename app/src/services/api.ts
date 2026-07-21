// Types only — all data access goes through src/db/ (local SQLite).

export type MuscleGroup = 'CHEST' | 'BACK' | 'LEGS' | 'SHOULDERS' | 'ARMS' | 'CORE' | 'CARDIO' | 'OTHER';
export type ExerciseType = 'STRENGTH' | 'CARDIO' | 'BODYWEIGHT';
export type ExerciseSource = 'SEED' | 'USER';

export interface Exercise {
  id: number;
  name: string;
  muscle_group: MuscleGroup;
  type: ExerciseType;
  source: ExerciseSource;
  notes: string | null;
  // The following are only populated for exercises imported from free-exercise-db
  // (source_slug non-null) — null for user-created custom exercises.
  equipment: string | null;
  level: string | null;
  category: string | null;
  instructions: string | null;
  source_slug: string | null;
  created_at: string;
}

export interface ProgramExercise {
  id: number;
  program_workout_id: number;
  exercise_id: number;
  exercise_name: string;
  order_index: number;
  default_sets: number;
  default_reps: number | null;
  default_weight_kg: number | null;
  // Short free-text note on this exercise's inclusion in this specific program workout (e.g.
  // "start light"), separate from the exercise's own general notes (Exercise.notes).
  notes: string | null;
}

export interface ProgramWorkout {
  id: number;
  label: string;
  order_index: number;
  exercises: ProgramExercise[];
}

export interface CycleSet {
  id: number;
  cycle_workout_id: number;
  // Nullable: SET NULL if the source exercise is later deleted. exercise_name below is
  // denormalized at insert time so history stays readable even then.
  exercise_id: number | null;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  is_complete: boolean;
  // When this set was last marked complete. Null while incomplete — cleared (not just
  // left stale) if the set is unmarked, so it always reflects the current state.
  completed_at: string | null;
}

// One completed set, as shown on ExerciseHistoryScreen — reps/weight plus when it was
// finished. completed_at is always present here (the history query filters to
// is_complete = 1 AND completed_at IS NOT NULL).
export interface ExerciseHistoryEntry {
  id: number;
  reps: number | null;
  weight_kg: number | null;
  set_number: number;
  completed_at: string;
}

export interface CycleWorkoutExercise {
  // Nullable: null means the source exercise has been deleted from the library — the
  // logged sets (and exercise_name) remain, but you can't add further sets to it.
  exercise_id: number | null;
  exercise_name: string;
  exercise_type: ExerciseType | null;
  // The program_exercises row this cycle exercise was stamped from, if it still exists (null
  // if the program workout or this exercise's entry in it was deleted after the cycle
  // started). Editing the note here edits the same underlying program_exercises.notes row
  // shown in EditProgramWorkoutScreen — it's one shared note, not a per-cycle copy.
  program_exercise_id: number | null;
  program_exercise_notes: string | null;
  sets: CycleSet[];
}

export interface CycleWorkoutDetail {
  id: number;
  cycle_id: number;
  program_workout_id: number | null;
  label: string;
  is_complete: boolean;
  exercises: CycleWorkoutExercise[];
}

export interface CycleWorkoutSummary {
  id: number;
  program_workout_id: number | null;
  label: string;
  order_index: number;
  is_complete: boolean;
  exercise_preview: string;
}

export interface Cycle {
  id: number;
  started_at: string;
  finished_at: string | null;
  is_active: boolean;
  workouts: CycleWorkoutSummary[];
}

export interface UserSettings {
  // Whether completing a set automatically starts the rest timer. On by default.
  rest_timer_enabled: boolean;
  // Rest timer length, in seconds, started automatically whenever a set is checked off
  // (only when rest_timer_enabled is true).
  rest_timer_seconds: number;
  // Whether the rest-complete notification plays a sound. On by default.
  rest_timer_sound_enabled: boolean;
}
