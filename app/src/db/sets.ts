import { db } from './client';
import { CycleSet, ExerciseHistoryEntry, TargetStreak } from '../services/api';

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

// The sets from the most recent workout (any day, any cycle — including the active one)
// where this exercise was logged, used as the reps/weight suggestion on every day the
// exercise appears. "Most recent" = latest completed_at; only completed sets count, and the
// workout being viewed is excluded so checking off its own sets doesn't shift the suggestions
// for the rest of them.
export async function getLastSetsForExercise(exerciseId: number, excludeCycleWorkoutId: number): Promise<CycleSet[]> {
  const lastWorkout = await db.getFirstAsync<{ cycle_workout_id: number }>(
    `SELECT cycle_workout_id
     FROM cycle_sets
     WHERE exercise_id = ? AND cycle_workout_id != ?
       AND is_complete = 1 AND completed_at IS NOT NULL
       AND (reps IS NOT NULL OR weight_kg IS NOT NULL)
     ORDER BY completed_at DESC, id DESC
     LIMIT 1`,
    [exerciseId, excludeCycleWorkoutId],
  );
  if (!lastWorkout) return [];

  const rows = await db.getAllAsync<SetRow>(
    `SELECT ${SET_COLUMNS} FROM cycle_sets
     WHERE cycle_workout_id = ? AND exercise_id = ? AND is_complete = 1
     ORDER BY set_number`,
    [lastWorkout.cycle_workout_id, exerciseId],
  );
  return rows.map(mapSet);
}

// How many of this exercise's most recent sessions in a row met `targetReps` on every set at
// one weight — the hint that it may be time to raise the weight. A session is a workout (any
// day, any cycle) with at least one completed set of the exercise, ordered by its latest
// completed_at; the workout being viewed is excluded, as in getLastSetsForExercise. A session
// counts only if every one of its sets for the exercise was completed, each with reps >=
// target, all at the same weight (or all without one). The streak stops at the first session
// that doesn't count or used a different weight than the latest one, so raising the weight
// starts a new streak. Null when the latest session didn't count (or there is none).
export async function getTargetStreak(
  exerciseId: number,
  targetReps: number,
  excludeCycleWorkoutId: number,
): Promise<TargetStreak | null> {
  const sessions = await db.getAllAsync<{
    total: number;
    done: number;
    min_reps: number | null;
    missing_reps: number;
    min_weight: number | null;
    max_weight: number | null;
    missing_weight: number;
  }>(
    `SELECT COUNT(*)                                            AS total,
            SUM(is_complete = 1 AND completed_at IS NOT NULL)   AS done,
            MIN(reps)                                           AS min_reps,
            SUM(reps IS NULL)                                   AS missing_reps,
            MIN(weight_kg)                                      AS min_weight,
            MAX(weight_kg)                                      AS max_weight,
            SUM(weight_kg IS NULL)                              AS missing_weight
     FROM cycle_sets
     WHERE exercise_id = ? AND cycle_workout_id != ?
     GROUP BY cycle_workout_id
     HAVING done > 0
     ORDER BY MAX(CASE WHEN is_complete = 1 THEN completed_at END) DESC, MAX(id) DESC`,
    [exerciseId, excludeCycleWorkoutId],
  );

  let streak: TargetStreak | null = null;
  for (const s of sessions) {
    const allDone = s.done === s.total;
    const repsMet = s.missing_reps === 0 && s.min_reps != null && s.min_reps >= targetReps;
    const sameWeight = s.missing_weight === s.total || (s.missing_weight === 0 && s.min_weight === s.max_weight);
    if (!allDone || !repsMet || !sameWeight) break;
    const weight = s.missing_weight === s.total ? null : s.max_weight;
    if (!streak) streak = { count: 0, weight_kg: weight };
    else if (weight !== streak.weight_kg) break;
    streak.count++;
  }
  return streak;
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
