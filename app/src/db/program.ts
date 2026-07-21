import { db } from './client';
import { ProgramWorkout, ProgramExercise } from '../services/api';

interface ProgramRow {
  workout_id: number;
  workout_label: string;
  workout_order: number;
  // exercise columns — nullable because of LEFT JOIN (workout with no exercises)
  pe_id: number | null;
  exercise_id: number | null;
  exercise_name: string | null;
  pe_order: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight_kg: number | null;
}

const PROGRAM_QUERY = `
  SELECT pw.id AS workout_id, pw.label AS workout_label, pw.order_index AS workout_order,
         pe.id AS pe_id, pe.exercise_id, e.name AS exercise_name, pe.order_index AS pe_order,
         pe.default_sets, pe.default_reps, pe.default_weight_kg
  FROM program_workouts pw
  LEFT JOIN program_exercises pe ON pe.program_workout_id = pw.id
  LEFT JOIN exercises e ON e.id = pe.exercise_id
`;

function groupProgramRows(rows: ProgramRow[]): ProgramWorkout[] {
  const map = new Map<number, ProgramWorkout>();

  for (const row of rows) {
    if (!map.has(row.workout_id)) {
      map.set(row.workout_id, {
        id: row.workout_id,
        label: row.workout_label,
        order_index: row.workout_order,
        exercises: [],
      });
    }

    if (row.pe_id !== null && row.exercise_id !== null) {
      const workout = map.get(row.workout_id)!;
      const exercise: ProgramExercise = {
        id: row.pe_id,
        program_workout_id: row.workout_id,
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_name!,
        order_index: row.pe_order!,
        default_sets: row.default_sets!,
        default_reps: row.default_reps,
        default_weight_kg: row.default_weight_kg,
      };
      workout.exercises.push(exercise);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.order_index - b.order_index);
}

export async function getProgram(): Promise<ProgramWorkout[]> {
  const rows = await db.getAllAsync<ProgramRow>(
    `${PROGRAM_QUERY} ORDER BY pw.order_index, pe.order_index`,
    [],
  );
  return groupProgramRows(rows);
}

export async function getProgramWorkout(id: number): Promise<ProgramWorkout> {
  const rows = await db.getAllAsync<ProgramRow>(
    `${PROGRAM_QUERY} WHERE pw.id = ? ORDER BY pe.order_index`,
    [id],
  );
  if (!rows.length) throw new Error(`Program workout ${id} not found`);
  return groupProgramRows(rows)[0];
}

export async function createProgramWorkout(data: { label: string }): Promise<ProgramWorkout> {
  const maxRow = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(order_index) AS max_order FROM program_workouts',
  );
  const orderIndex = (maxRow?.max_order ?? -1) + 1;

  const result = await db.runAsync(
    'INSERT INTO program_workouts (label, order_index) VALUES (?, ?)',
    [data.label, orderIndex],
  );
  return getProgramWorkout(result.lastInsertRowId);
}

export async function updateProgramWorkout(id: number, patch: { label?: string }): Promise<ProgramWorkout> {
  if (patch.label !== undefined) {
    await db.runAsync('UPDATE program_workouts SET label = ? WHERE id = ?', [patch.label, id]);
  }
  return getProgramWorkout(id);
}

export async function deleteProgramWorkout(id: number): Promise<void> {
  // program_exercises are deleted automatically via ON DELETE CASCADE.
  // Any cycle_workouts already stamped from this workout are NOT deleted — their
  // program_workout_id is set to NULL (ON DELETE SET NULL) so history is preserved.
  await db.runAsync('DELETE FROM program_workouts WHERE id = ?', [id]);
}

export async function addExerciseToProgramWorkout(
  programWorkoutId: number,
  data: { exercise_id: number; default_sets?: number; default_reps?: number; default_weight_kg?: number },
): Promise<ProgramWorkout> {
  const maxRow = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(order_index) AS max_order FROM program_exercises WHERE program_workout_id = ?',
    [programWorkoutId],
  );
  const orderIndex = (maxRow?.max_order ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO program_exercises (program_workout_id, exercise_id, order_index, default_sets, default_reps, default_weight_kg)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      programWorkoutId,
      data.exercise_id,
      orderIndex,
      data.default_sets ?? 3,
      data.default_reps ?? null,
      data.default_weight_kg ?? null,
    ],
  );
  return getProgramWorkout(programWorkoutId);
}

export async function updateProgramExercise(
  id: number,
  patch: { default_sets?: number; default_reps?: number | null; default_weight_kg?: number | null },
): Promise<void> {
  const existing = await db.getFirstAsync<{ default_sets: number; default_reps: number | null; default_weight_kg: number | null }>(
    'SELECT default_sets, default_reps, default_weight_kg FROM program_exercises WHERE id = ?',
    [id],
  );
  if (!existing) return;

  await db.runAsync(
    'UPDATE program_exercises SET default_sets = ?, default_reps = ?, default_weight_kg = ? WHERE id = ?',
    [
      patch.default_sets !== undefined ? patch.default_sets : existing.default_sets,
      patch.default_reps !== undefined ? patch.default_reps : existing.default_reps,
      patch.default_weight_kg !== undefined ? patch.default_weight_kg : existing.default_weight_kg,
      id,
    ],
  );
}

export async function removeExerciseFromProgramWorkout(programExerciseId: number): Promise<void> {
  await db.runAsync('DELETE FROM program_exercises WHERE id = ?', [programExerciseId]);
}

export async function reorderProgramExercises(programExerciseIds: number[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < programExerciseIds.length; i++) {
      await db.runAsync('UPDATE program_exercises SET order_index = ? WHERE id = ?', [i, programExerciseIds[i]]);
    }
  });
}
