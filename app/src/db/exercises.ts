import { db } from './client';
import { Exercise, ExerciseType, MuscleGroup } from '../services/api';

interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  type: string;
  source: string;
  notes: string | null;
  equipment: string | null;
  level: string | null;
  category: string | null;
  instructions: string | null;
  source_slug: string | null;
  created_at: string;
}

const EXERCISE_COLUMNS = 'id, name, muscle_group, type, source, notes, equipment, level, category, instructions, source_slug, created_at';

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscle_group: row.muscle_group as MuscleGroup,
    type: row.type as ExerciseType,
    source: row.source as Exercise['source'],
    notes: row.notes,
    equipment: row.equipment,
    level: row.level,
    category: row.category,
    instructions: row.instructions,
    source_slug: row.source_slug,
    created_at: row.created_at,
  };
}

export async function searchExercises(q: string, muscleGroup?: MuscleGroup): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS}
     FROM exercises
     WHERE name LIKE ?
       AND (? IS NULL OR muscle_group = ?)
     ORDER BY name
     LIMIT 50`,
    [`%${q}%`, muscleGroup ?? null, muscleGroup ?? null],
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
