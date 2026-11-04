import { db } from './client';
import { Exercise, ExerciseType, MuscleGroup } from '../services/api';

interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  type: string;
  source: string;
  notes: string | null;
  short_note: string | null;
  equipment: string | null;
  level: string | null;
  category: string | null;
  instructions: string | null;
  source_slug: string | null;
  weight_options: string | null;
  created_at: string;
}

const EXERCISE_COLUMNS = 'id, name, muscle_group, type, source, notes, short_note, equipment, level, category, instructions, source_slug, weight_options, created_at';

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscle_group: row.muscle_group as MuscleGroup,
    type: row.type as ExerciseType,
    source: row.source as Exercise['source'],
    notes: row.notes,
    short_note: row.short_note,
    equipment: row.equipment,
    level: row.level,
    category: row.category,
    instructions: row.instructions,
    source_slug: row.source_slug,
    weight_options: row.weight_options,
    created_at: row.created_at,
  };
}

// `filter` is either a muscle group or the special value 'CUSTOM' (user-created exercises,
// any muscle group) — the two are mutually exclusive, matching the ExercisesScreen chip row
// where CUSTOM sits alongside the muscle groups, not as a second independent dimension.
//
// Results rank custom (source = 'USER') exercises first, then by how many sets have actually
// been logged against each exercise (most-used first) — surfacing exercises the user created
// or actually trains ahead of the untouched majority of the 873-exercise seed library. Plain
// alphabetical is only the final tiebreaker, not the primary order.
export async function searchExercises(q: string, filter?: MuscleGroup | 'CUSTOM'): Promise<Exercise[]> {
  const isCustomFilter = filter === 'CUSTOM';
  const muscleGroup = isCustomFilter ? null : (filter ?? null);
  // Stored exercise names have no leading/trailing whitespace, so a query with any (e.g. left
  // over from typing a multi-word name, or backspacing) would LIKE-match against a substring
  // that can never exist in the data — silently returning nothing even for an exact name.
  const trimmedQuery = q.trim();

  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS.split(', ').map((c) => `e.${c}`).join(', ')}
     FROM exercises e
     LEFT JOIN (
       SELECT exercise_id, COUNT(*) AS set_count
       FROM cycle_sets
       WHERE reps IS NOT NULL OR weight_kg IS NOT NULL
       GROUP BY exercise_id
     ) usage ON usage.exercise_id = e.id
     WHERE e.name LIKE ?
       AND (? IS NULL OR e.muscle_group = ?)
       AND (? = 0 OR e.source = 'USER')
     ORDER BY (e.source = 'USER') DESC, COALESCE(usage.set_count, 0) DESC, e.name
     LIMIT 50`,
    [`%${trimmedQuery}%`, muscleGroup, muscleGroup, isCustomFilter ? 1 : 0],
  );
  return rows.map(mapExercise);
}

export async function getExercise(id: number): Promise<Exercise> {
  const row = await db.getFirstAsync<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE id = ?`,
    [id],
  );
  if (!row) throw new Error(`Exercise ${id} not found`);
  return mapExercise(row);
}

export async function createExercise(data: {
  name: string;
  muscle_group: MuscleGroup;
  type: ExerciseType;
}): Promise<Exercise> {
  const result = await db.runAsync(
    `INSERT INTO exercises (name, muscle_group, type, source) VALUES (?, ?, ?, 'USER')`,
    [data.name, data.muscle_group, data.type],
  );
  return getExercise(result.lastInsertRowId);
}

export async function updateExerciseNotes(id: number, notes: string): Promise<void> {
  await db.runAsync('UPDATE exercises SET notes = ? WHERE id = ?', [notes || null, id]);
}

// The short one-line-ish note shown under the exercise's name on every workout day.
export async function updateExerciseShortNote(id: number, note: string | null): Promise<void> {
  await db.runAsync('UPDATE exercises SET short_note = ? WHERE id = ?', [note?.trim() || null, id]);
}

// Which fixed weight list (utils/weightOptions.ts) the exercise's set weights are picked from;
// null switches back to typing the weight in. Works for library and custom exercises alike.
export async function updateExerciseWeightOptions(id: number, weightOptions: string | null): Promise<void> {
  await db.runAsync('UPDATE exercises SET weight_options = ? WHERE id = ?', [weightOptions, id]);
}

// Exercises whose short note couldn't be migrated automatically because different program
// workouts had different notes for it (see migrateProgramExerciseNotes in schema.ts). Each
// option lists the program workouts that used it, so the user can tell them apart.
export interface ShortNoteConflict {
  exercise_id: number;
  exercise_name: string;
  options: { note: string; workouts: string[] }[];
}

export async function getShortNoteConflicts(): Promise<ShortNoteConflict[]> {
  const rows = await db.getAllAsync<{ exercise_id: number; exercise_name: string; short_note: string | null; note: string; workout_label: string }>(
    `SELECT e.id AS exercise_id, e.name AS exercise_name, e.short_note,
            TRIM(pe.notes) AS note, pw.label AS workout_label
     FROM program_exercises pe
     JOIN exercises e ON e.id = pe.exercise_id
     JOIN program_workouts pw ON pw.id = pe.program_workout_id
     WHERE pe.notes IS NOT NULL AND TRIM(pe.notes) != ''
     ORDER BY e.name, pw.order_index`,
  );
  const map = new Map<number, ShortNoteConflict>();
  for (const row of rows) {
    let conflict = map.get(row.exercise_id);
    if (!conflict) {
      conflict = { exercise_id: row.exercise_id, exercise_name: row.exercise_name, options: [] };
      if (row.short_note?.trim()) conflict.options.push({ note: row.short_note.trim(), workouts: [] });
      map.set(row.exercise_id, conflict);
    }
    let option = conflict.options.find((o) => o.note === row.note);
    if (!option) {
      option = { note: row.note, workouts: [] };
      conflict.options.push(option);
    }
    if (!option.workouts.includes(row.workout_label)) option.workouts.push(row.workout_label);
  }
  return Array.from(map.values()).filter((c) => c.options.length > 1);
}

// Keeps `note` as the exercise's short note and drops the old per-workout copies.
export async function resolveShortNoteConflict(exerciseId: number, note: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE exercises SET short_note = ? WHERE id = ?', [note, exerciseId]);
    await db.runAsync('UPDATE program_exercises SET notes = NULL WHERE exercise_id = ?', [exerciseId]);
  });
}

// Scoped to source = 'USER' as a defense-in-depth check — the seed library (free-exercise-db)
// is shared reference data, not the user's own, so it shouldn't be editable/deletable even if
// a caller somehow reaches this for a non-custom exercise. The UI already only exposes these
// actions for custom exercises.
export async function updateExercise(id: number, data: {
  name: string;
  muscle_group: MuscleGroup;
  type: ExerciseType;
}): Promise<void> {
  await db.runAsync(
    `UPDATE exercises SET name = ?, muscle_group = ?, type = ? WHERE id = ? AND source = 'USER'`,
    [data.name, data.muscle_group, data.type, id],
  );
}

// program_exercises.exercise_id cascades (removed from any program workout it's used in);
// cycle_sets.exercise_id sets NULL with exercise_name already denormalized, so past logged
// history stays fully readable even after the exercise itself is gone.
export async function deleteExercise(id: number): Promise<void> {
  await db.runAsync(`DELETE FROM exercises WHERE id = ? AND source = 'USER'`, [id]);
}

// Exercises with the most recently logged sets, most recent first.
// Only counts sets that actually have a value — pre-seeded blank sets from
// stamping a cycle don't count as "recent" until the user logs something.
export async function getRecentExercises(limit = 10): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS.split(', ').map((c) => `e.${c}`).join(', ')}
     FROM exercises e
     JOIN (
       SELECT exercise_id, MAX(id) AS last_set_id
       FROM cycle_sets
       WHERE reps IS NOT NULL OR weight_kg IS NOT NULL
       GROUP BY exercise_id
     ) recent ON recent.exercise_id = e.id
     ORDER BY recent.last_set_id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapExercise);
}
