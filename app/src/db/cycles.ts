import { db } from './client';
import { Cycle, CycleWorkoutSummary, CycleWorkoutDetail, CycleWorkoutExercise, ExerciseType } from '../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Stamp out cycle_workouts + blank cycle_sets for a new cycle from the current program.
async function stampCycleFromProgram(cycleId: number): Promise<void> {
  const workouts = await db.getAllAsync<{ id: number; label: string; order_index: number }>(
    'SELECT id, label, order_index FROM program_workouts ORDER BY order_index',
  );

  for (const w of workouts) {
    const cwResult = await db.runAsync(
      'INSERT INTO cycle_workouts (cycle_id, program_workout_id, label, order_index) VALUES (?, ?, ?, ?)',
      [cycleId, w.id, w.label, w.order_index],
    );
    const cycleWorkoutId = cwResult.lastInsertRowId;

    const exercises = await db.getAllAsync<{ exercise_id: number; exercise_name: string; default_sets: number }>(
      `SELECT pe.exercise_id, e.name AS exercise_name, pe.default_sets
       FROM program_exercises pe JOIN exercises e ON e.id = pe.exercise_id
       WHERE pe.program_workout_id = ? ORDER BY pe.order_index`,
      [w.id],
    );

    for (const ex of exercises) {
      for (let setNumber = 1; setNumber <= ex.default_sets; setNumber++) {
        await db.runAsync(
          'INSERT INTO cycle_sets (cycle_workout_id, exercise_id, exercise_name, set_number) VALUES (?, ?, ?, ?)',
          [cycleWorkoutId, ex.exercise_id, ex.exercise_name, setNumber],
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface CycleSummaryRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  is_active: number;
  cw_id: number | null;
  program_workout_id: number | null;
  label: string | null;
  order_index: number | null;
  is_complete: number | null;
  preview: string | null;
}

export async function getActiveCycle(): Promise<Cycle | null> {
  const rows = await db.getAllAsync<CycleSummaryRow>(
    `SELECT c.id, c.started_at, c.finished_at, c.is_active,
            cw.id AS cw_id, cw.program_workout_id, cw.label, cw.order_index, cw.is_complete,
            (SELECT GROUP_CONCAT(DISTINCT cs.exercise_name)
               FROM cycle_sets cs
              WHERE cs.cycle_workout_id = cw.id) AS preview
     FROM cycles c
     LEFT JOIN cycle_workouts cw ON cw.cycle_id = c.id
     WHERE c.is_active = 1
     ORDER BY cw.order_index`,
    [],
  );
  if (!rows.length) return null;

  const workouts: CycleWorkoutSummary[] = rows
    .filter((r) => r.cw_id !== null)
    .map((r) => ({
      id: r.cw_id!,
      program_workout_id: r.program_workout_id,
      label: r.label!,
      order_index: r.order_index!,
      is_complete: !!r.is_complete,
      exercise_preview: r.preview ?? '',
    }));

  const first = rows[0];
  return {
    id: first.id,
    started_at: first.started_at,
    finished_at: first.finished_at,
    is_active: !!first.is_active,
    workouts,
  };
}

// Returns the active cycle, creating one (stamped from the current program) if none exists.
export async function getOrCreateActiveCycle(): Promise<Cycle> {
  const existing = await getActiveCycle();
  if (existing) return existing;

  let cycleId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync('INSERT INTO cycles DEFAULT VALUES');
    cycleId = result.lastInsertRowId;
    await stampCycleFromProgram(cycleId);
  });

  return (await getActiveCycle())!;
}

// Finishes the active cycle (if any) and stamps out a fresh one from the current program.
export async function startNewCycle(): Promise<Cycle> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE cycles SET is_active = 0, finished_at = datetime('now') WHERE is_active = 1`);
    const result = await db.runAsync('INSERT INTO cycles DEFAULT VALUES');
    await stampCycleFromProgram(result.lastInsertRowId);
  });

  return (await getActiveCycle())!;
}

export async function markWorkoutComplete(cycleWorkoutId: number, complete: boolean): Promise<void> {
  await db.runAsync('UPDATE cycle_workouts SET is_complete = ? WHERE id = ?', [complete ? 1 : 0, cycleWorkoutId]);
}

interface DetailRow {
  cw_id: number;
  cycle_id: number;
  program_workout_id: number | null;
  label: string;
  is_complete: number;
  set_id: number | null;
  exercise_id: number | null;
  exercise_name: string | null;
  exercise_type: string | null;
  set_number: number | null;
  reps: number | null;
  weight_kg: number | null;
  set_complete: number | null;
  completed_at: string | null;
  program_exercise_id: number | null;
  short_note: string | null;
  program_exercise_default_reps: number | null;
  weight_options: string | null;
  source_slug: string | null;
}

export async function getCycleWorkoutDetail(cycleWorkoutId: number): Promise<CycleWorkoutDetail> {
  const rows = await db.getAllAsync<DetailRow>(
    `SELECT cw.id AS cw_id, cw.cycle_id, cw.program_workout_id, cw.label, cw.is_complete,
            cs.id AS set_id, cs.exercise_id, cs.exercise_name, e.type AS exercise_type,
            cs.set_number, cs.reps, cs.weight_kg, cs.is_complete AS set_complete, cs.completed_at,
            pe.id AS program_exercise_id, e.short_note, pe.default_reps AS program_exercise_default_reps,
            e.weight_options, e.source_slug
     FROM cycle_workouts cw
     LEFT JOIN cycle_sets cs ON cs.cycle_workout_id = cw.id
     LEFT JOIN exercises e ON e.id = cs.exercise_id
     LEFT JOIN program_exercises pe ON pe.program_workout_id = cw.program_workout_id AND pe.exercise_id = cs.exercise_id
     WHERE cw.id = ?
     ORDER BY pe.order_index, cs.set_number`,
    [cycleWorkoutId],
  );
  if (!rows.length) throw new Error(`Cycle workout ${cycleWorkoutId} not found`);

  // Grouping key: the exercise's id when it still exists, otherwise its (denormalized,
  // stable) name — exercise_id can be NULL for every deleted exercise, so it can't be
  // used as a map key on its own without merging unrelated deleted exercises together.
  const exerciseOrder: string[] = [];
  const exerciseMap = new Map<string, CycleWorkoutExercise>();

  for (const row of rows) {
    if (row.set_id === null) continue;
    const key = row.exercise_id !== null ? `id:${row.exercise_id}` : `name:${row.exercise_name}`;
    if (!exerciseMap.has(key)) {
      exerciseOrder.push(key);
      exerciseMap.set(key, {
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name!,
        exercise_type: row.exercise_type as ExerciseType | null,
        program_exercise_id: row.program_exercise_id,
        short_note: row.short_note,
        program_exercise_default_reps: row.program_exercise_default_reps,
        weight_options: row.weight_options,
        source_slug: row.source_slug,
        sets: [],
      });
    }
    exerciseMap.get(key)!.sets.push({
      id: row.set_id,
      cycle_workout_id: cycleWorkoutId,
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name!,
      set_number: row.set_number!,
      reps: row.reps,
      weight_kg: row.weight_kg,
      is_complete: !!row.set_complete,
      completed_at: row.completed_at,
    });
  }

  const first = rows[0];
  return {
    id: first.cw_id,
    cycle_id: first.cycle_id,
    program_workout_id: first.program_workout_id,
    label: first.label,
    is_complete: !!first.is_complete,
    exercises: exerciseOrder.map((key) => exerciseMap.get(key)!),
  };
}
