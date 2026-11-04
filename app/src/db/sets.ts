import { db } from './client';
import { CycleSet, ExerciseHistoryEntry } from '../services/api';

interface SetRow {
  id: number;
  cycle_workout_id: number;
  exercise_id: number | null;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  is_complete: number;
  completed_at: string | null;
}

const SET_COLUMNS = 'id, cycle_workout_id, exercise_id, exercise_name, set_number, reps, weight_kg, is_complete, completed_at';

function mapSet(row: SetRow): CycleSet {
  return {
    id: row.id,
    cycle_workout_id: row.cycle_workout_id,
    exercise_id: row.exercise_id,
    exercise_name: row.exercise_name,
    set_number: row.set_number,
    reps: row.reps,
    weight_kg: row.weight_kg,
    is_complete: !!row.is_complete,
    completed_at: row.completed_at,
  };
}

export async function getSetsForCycleWorkout(cycleWorkoutId: number): Promise<CycleSet[]> {
  const rows = await db.getAllAsync<SetRow>(
    `SELECT ${SET_COLUMNS} FROM cycle_sets WHERE cycle_workout_id = ? ORDER BY exercise_id, set_number`,
    [cycleWorkoutId],
  );
  return rows.map(mapSet);
}

// Adds an extra set beyond the workout's pre-seeded defaults.
export async function addSet(cycleWorkoutId: number, exerciseId: number): Promise<CycleSet> {
  const exercise = await db.getFirstAsync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', [exerciseId]);
  if (!exercise) throw new Error(`Exercise ${exerciseId} not found`);

  const maxRow = await db.getFirstAsync<{ max_set: number | null }>(
    'SELECT MAX(set_number) AS max_set FROM cycle_sets WHERE cycle_workout_id = ? AND exercise_id = ?',
    [cycleWorkoutId, exerciseId],
  );
  const setNumber = (maxRow?.max_set ?? 0) + 1;

  const result = await db.runAsync(
    'INSERT INTO cycle_sets (cycle_workout_id, exercise_id, exercise_name, set_number) VALUES (?, ?, ?, ?)',
    [cycleWorkoutId, exerciseId, exercise.name, setNumber],
  );
  const row = await db.getFirstAsync<SetRow>(
    `SELECT ${SET_COLUMNS} FROM cycle_sets WHERE id = ?`,
    [result.lastInsertRowId],
  );
  return mapSet(row!);
}

export async function updateSet(id: number, patch: { reps?: number | null; weight_kg?: number | null }): Promise<void> {
  await db.runAsync(
    `UPDATE cycle_sets
     SET reps      = COALESCE(?, reps),
         weight_kg = COALESCE(?, weight_kg)
     WHERE id = ?`,
    [patch.reps ?? null, patch.weight_kg ?? null, id],
  );
}

// Marking a set complete records when it happened (completed_at) — now by default, or an
// explicit earlier time when re-checking a set in an older workout (see utils/setTiming.ts).
// Unmarking it leaves completed_at in place rather than clearing it: history only reads sets
// with is_complete = 1, so the leftover value is invisible there, and keeping it is what lets
// a later re-check offer to restore the set's original time instead of stamping it with now.
export async function markSetComplete(id: number, complete: boolean, completedAt?: string): Promise<void> {
  if (complete) {
    await db.runAsync(
      `UPDATE cycle_sets SET is_complete = 1, completed_at = ? WHERE id = ?`,
      [completedAt ?? new Date().toISOString(), id],
    );
  } else {
    await db.runAsync(`UPDATE cycle_sets SET is_complete = 0 WHERE id = ?`, [id]);
  }
}

export async function deleteSet(id: number): Promise<void> {
  await db.runAsync('DELETE FROM cycle_sets WHERE id = ?', [id]);
}

// The most recently logged sets for this exercise, from the last finished cycle
// that included it — used to pre-fill values for progression.
export async function getLastSetsForExercise(exerciseId: number): Promise<CycleSet[]> {
  const lastWorkout = await db.getFirstAsync<{ cycle_workout_id: number }>(
    `SELECT cs.cycle_workout_id
     FROM cycle_sets cs
     JOIN cycle_workouts cw ON cw.id = cs.cycle_workout_id
     JOIN cycles c ON c.id = cw.cycle_id
     WHERE cs.exercise_id = ? AND c.is_active = 0
       AND (cs.reps IS NOT NULL OR cs.weight_kg IS NOT NULL)
     ORDER BY c.started_at DESC, cs.id DESC
     LIMIT 1`,
    [exerciseId],
  );
  if (!lastWorkout) return [];

  const rows = await db.getAllAsync<SetRow>(
    `SELECT ${SET_COLUMNS} FROM cycle_sets WHERE cycle_workout_id = ? AND exercise_id = ? ORDER BY set_number`,
    [lastWorkout.cycle_workout_id, exerciseId],
  );
  return rows.map(mapSet);
}

// Every completed set ever logged for this exercise, most recently finished first —
// the data behind ExerciseHistoryScreen. Only matches the exercise's own id, so sets
// left behind by a deleted-and-recreated exercise of the same name aren't included.
export async function getExerciseHistory(exerciseId: number): Promise<ExerciseHistoryEntry[]> {
  const rows = await db.getAllAsync<{ id: number; reps: number | null; weight_kg: number | null; set_number: number; completed_at: string }>(
    `SELECT id, reps, weight_kg, set_number, completed_at
     FROM cycle_sets
     WHERE exercise_id = ? AND is_complete = 1 AND completed_at IS NOT NULL
     ORDER BY completed_at DESC, id DESC`,
    [exerciseId],
  );
  return rows;
}
