import { db } from './client';

// ---------------------------------------------------------------------------
// Training history export — a self-contained, human/tool-readable JSON file for analysing
// training outside the app (spreadsheets, scripts, an AI assistant…). Unlike the backup
// (src/db/backup.ts) it's not meant to be imported back: there are no internal ids, every
// set names its exercise directly, and every exercise that appears in the program or history
// comes with its full description, so nothing in the file needs the app to be understood.
//
// Only completed (checked-off) sets are included — pre-filled or unchecked sets aren't
// training that happened.
// ---------------------------------------------------------------------------

const ABOUT =
  'Training log exported from the MyTrainingHabits app. The "program" is the repeating list of ' +
  'workout days the user trains; each run through it is a "cycle". "history" lists every cycle ' +
  '(oldest first) with the workouts done in it and every completed set, grouped by exercise in ' +
  'the order they were first performed. "exercises" describes every exercise referenced in the ' +
  'program or history, keyed by the same name used there. Weights are in kilograms; a set with ' +
  'no weight is bodyweight/unloaded. Times are ISO 8601 in UTC.';

interface ExportedSet {
  set: number;
  reps: number | null;
  weight_kg: number | null;
  completed_at: string | null;
}

interface ExportedWorkout {
  day: string;
  completed: boolean;
  started_at: string | null;
  finished_at: string | null;
  exercises: { exercise: string; sets: ExportedSet[] }[];
}

interface ExportedCycle {
  cycle: number;
  started_at: string;
  finished_at: string | null;
  in_progress: boolean;
  workouts: ExportedWorkout[];
}

interface ExportedExercise {
  name: string;
  custom: boolean;
  deleted: boolean;
  muscle_group: string | null;
  type: string | null;
  equipment: string | null;
  level: string | null;
  category: string | null;
  description: string | null;
  notes: string | null;
  short_note: string | null;
}

export interface TrainingExportSummary {
  cycles: number;
  workouts: number;
  sets: number;
  exercises: number;
}

// SQLite's datetime('now') gives 'YYYY-MM-DD HH:MM:SS' (UTC); set times are already ISO.
function toIso(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
}

export async function exportTrainingHistory(): Promise<{ json: string; summary: TrainingExportSummary }> {
  // --- exercises referenced anywhere: id → description ---
  const exerciseRows = await db.getAllAsync<{
    id: number; name: string; source: string; muscle_group: string; type: string;
    equipment: string | null; level: string | null; category: string | null;
    instructions: string | null; notes: string | null; short_note: string | null;
  }>(
    `SELECT id, name, source, muscle_group, type, equipment, level, category, instructions, notes, short_note
     FROM exercises
     WHERE id IN (SELECT exercise_id FROM program_exercises)
        OR id IN (SELECT exercise_id FROM cycle_sets WHERE is_complete = 1 AND exercise_id IS NOT NULL)
     ORDER BY name`,
  );
  const exercises = new Map<string, ExportedExercise>();
  const nameById = new Map<number, string>();
  for (const e of exerciseRows) {
    nameById.set(e.id, e.name);
    exercises.set(e.name, {
      name: e.name,
      custom: e.source === 'USER',
      deleted: false,
      muscle_group: e.muscle_group,
      type: e.type,
      equipment: e.equipment,
      level: e.level,
      category: e.category,
      description: e.instructions,
      notes: e.notes,
      short_note: e.short_note,
    });
  }

  // --- program ---
  const programWorkouts = await db.getAllAsync<{ id: number; label: string }>(
    'SELECT id, label FROM program_workouts ORDER BY order_index, id',
  );
  const programExercises = await db.getAllAsync<{
    program_workout_id: number; exercise_id: number; default_sets: number;
    default_reps: number | null; default_weight_kg: number | null;
  }>(
    `SELECT program_workout_id, exercise_id, default_sets, default_reps, default_weight_kg
     FROM program_exercises ORDER BY order_index, id`,
  );
  const program = programWorkouts.map((w, i) => ({
    day: w.label,
    position: i + 1,
    exercises: programExercises
      .filter((pe) => pe.program_workout_id === w.id)
      .map((pe) => ({
        exercise: nameById.get(pe.exercise_id) ?? `Exercise #${pe.exercise_id}`,
        sets: pe.default_sets,
        target_reps: pe.default_reps,
        target_weight_kg: pe.default_weight_kg,
      })),
  }));

  // --- history ---
  const cycles = await db.getAllAsync<{ id: number; started_at: string; finished_at: string | null; is_active: number }>(
    'SELECT id, started_at, finished_at, is_active FROM cycles ORDER BY started_at, id',
  );
  const cycleWorkouts = await db.getAllAsync<{ id: number; cycle_id: number; label: string; is_complete: number }>(
    'SELECT id, cycle_id, label, is_complete FROM cycle_workouts ORDER BY order_index, id',
  );
  const sets = await db.getAllAsync<{
    cycle_workout_id: number; exercise_id: number | null; exercise_name: string; current_name: string | null;
    set_number: number; reps: number | null; weight_kg: number | null; completed_at: string | null;
  }>(
    `SELECT cs.cycle_workout_id, cs.exercise_id, cs.exercise_name, e.name AS current_name,
            cs.set_number, cs.reps, cs.weight_kg, cs.completed_at
     FROM cycle_sets cs LEFT JOIN exercises e ON e.id = cs.exercise_id
     WHERE cs.is_complete = 1
     ORDER BY cs.cycle_workout_id, cs.set_number, cs.completed_at, cs.id`,
  );

  const setsByWorkout = new Map<number, typeof sets>();
  for (const s of sets) {
    if (!setsByWorkout.has(s.cycle_workout_id)) setsByWorkout.set(s.cycle_workout_id, []);
    setsByWorkout.get(s.cycle_workout_id)!.push(s);

    // A deleted exercise only survives as the name stored on its sets.
    const name = s.current_name ?? s.exercise_name;
    if (!exercises.has(name)) {
      exercises.set(name, {
        name, custom: false, deleted: true, muscle_group: null, type: null, equipment: null,
        level: null, category: null, description: null, notes: null, short_note: null,
      });
    }
  }

  let workoutCount = 0;
  const history: ExportedCycle[] = cycles.map((c, i) => {
    const workouts: ExportedWorkout[] = [];
    for (const cw of cycleWorkouts) {
      if (cw.cycle_id !== c.id) continue;
      const done = setsByWorkout.get(cw.id) ?? [];
      if (!cw.is_complete && !done.length) continue; // not trained (yet)

      // Group by exercise — by its current name (so renamed exercises stay one exercise),
      // ordered by when each was first performed in the workout.
      const groups = new Map<string, { first: string; sets: ExportedSet[] }>();
      for (const s of done) {
        const name = s.current_name ?? s.exercise_name;
        if (!groups.has(name)) groups.set(name, { first: s.completed_at ?? '', sets: [] });
        const g = groups.get(name)!;
        if (s.completed_at && (!g.first || s.completed_at < g.first)) g.first = s.completed_at;
        g.sets.push({ set: g.sets.length + 1, reps: s.reps, weight_kg: s.weight_kg, completed_at: toIso(s.completed_at) });
      }
      const times = done.map((s) => s.completed_at).filter((t): t is string => !!t).sort();
      workouts.push({
        day: cw.label,
        completed: !!cw.is_complete,
        started_at: toIso(times[0] ?? null),
        finished_at: toIso(times[times.length - 1] ?? null),
        exercises: [...groups.entries()]
          .sort(([, a], [, b]) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
          .map(([exercise, g]) => ({ exercise, sets: g.sets })),
      });
    }
    workoutCount += workouts.length;
    return {
      cycle: i + 1,
      started_at: toIso(c.started_at)!,
      finished_at: toIso(c.finished_at),
      in_progress: !!c.is_active,
      workouts,
    };
  });

  const exerciseList = [...exercises.values()].sort((a, b) => a.name.localeCompare(b.name));
  const json = JSON.stringify(
    {
      about: ABOUT,
      app: 'MyTrainingHabits',
      exported_at: new Date().toISOString(),
      units: { weight: 'kg', time: 'ISO 8601, UTC' },
      program,
      exercises: exerciseList,
      history,
    },
    null,
    2,
  );
  return {
    json,
    summary: { cycles: history.length, workouts: workoutCount, sets: sets.length, exercises: exerciseList.length },
  };
}
