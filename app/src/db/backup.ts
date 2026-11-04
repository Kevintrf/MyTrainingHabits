import { db } from './client';
import { curatedReplacementFor } from './curatedExercises';

// ---------------------------------------------------------------------------
// JSON backup / restore of everything the user has created or logged.
// ---------------------------------------------------------------------------
// The backup is a plain dump of every table's rows, except the seed exercise library: its
// 885 rows are the same reference data on every install (and ~750 KB), so seed exercises are
// written only as { id, source_slug, name, notes, short_note, weight_options } — the parts the
// user can change — and only the ones that have notes or a weight list, or are used by the
// program or history.
//
// Import replaces all current data. Seed exercise ids aren't stable across installs (they
// depend on what the install's library looked like when it was first seeded), so exercises
// are matched by source_slug and every exercise_id in the backup is remapped to the local id.
// Custom exercises that have since become library entries (see db/curatedExercises.ts) are
// matched to that entry by name. All other ids (workouts, cycles, sets) are kept as-is, since
// those tables are emptied first.
//
// Rows are inserted using only the columns that exist both in the backup and in the current
// schema, so a backup made by an older/newer version of the app still imports as long as
// the core shape matches.

const APP_ID = 'MyTrainingHabits';
const BACKUP_VERSION = 1;

type Value = string | number | null;
type Row = Record<string, Value>;

interface BackupData {
  user_settings: Row[];
  exercises: Row[];
  program_workouts: Row[];
  program_exercises: Row[];
  cycles: Row[];
  cycle_workouts: Row[];
  cycle_sets: Row[];
}

export interface BackupFile {
  app: typeof APP_ID;
  backup_version: number;
  exported_at: string;
  data: BackupData;
}

export interface BackupSummary {
  customExercises: number;
  programWorkouts: number;
  cycles: number;
  loggedSets: number;
}

const TABLES: (keyof BackupData)[] = [
  'user_settings',
  'exercises',
  'program_workouts',
  'program_exercises',
  'cycles',
  'cycle_workouts',
  'cycle_sets',
];

export async function exportBackup(): Promise<{ json: string; summary: BackupSummary }> {
  const all = (sql: string) => db.getAllAsync<Row>(sql);

  const data: BackupData = {
    user_settings: await all('SELECT * FROM user_settings'),
    exercises: [
      ...(await all(`SELECT * FROM exercises WHERE source = 'USER' ORDER BY id`)),
      ...(await all(
        `SELECT id, name, source, source_slug, notes, short_note, weight_options
         FROM exercises
         WHERE source = 'SEED'
           AND (notes IS NOT NULL OR short_note IS NOT NULL OR weight_options IS NOT NULL
                OR id IN (SELECT exercise_id FROM program_exercises)
                OR id IN (SELECT exercise_id FROM cycle_sets WHERE exercise_id IS NOT NULL))
         ORDER BY id`,
      )),
    ],
    program_workouts: await all('SELECT * FROM program_workouts ORDER BY id'),
    program_exercises: await all('SELECT * FROM program_exercises ORDER BY id'),
    cycles: await all('SELECT * FROM cycles ORDER BY id'),
    cycle_workouts: await all('SELECT * FROM cycle_workouts ORDER BY id'),
    cycle_sets: await all('SELECT * FROM cycle_sets ORDER BY id'),
  };

  const backup: BackupFile = {
    app: APP_ID,
    backup_version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data,
  };
  return { json: JSON.stringify(backup), summary: summarize(data) };
}

function summarize(data: BackupData): BackupSummary {
  return {
    customExercises: data.exercises.filter((e) => e.source === 'USER').length,
    programWorkouts: data.program_workouts.length,
    cycles: data.cycles.length,
    loggedSets: data.cycle_sets.filter((s) => s.is_complete === 1).length,
  };
}

// Parses and sanity-checks a backup file without touching the database, so the user can be
// shown what it contains before confirming the (destructive) import.
export function parseBackup(json: string): { backup: BackupFile; summary: BackupSummary } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  const b = parsed as Partial<BackupFile> | null;
  if (!b || typeof b !== 'object' || b.app !== APP_ID || typeof b.data !== 'object' || !b.data) {
    throw new Error("This file isn't a MyTrainingHabits backup.");
  }
  if (typeof b.backup_version !== 'number' || b.backup_version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  }
  for (const table of TABLES) {
    const rows = (b.data as Partial<BackupData>)[table];
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      throw new Error(`The backup is damaged (missing or invalid "${table}").`);
    }
    for (const row of rows as Row[]) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'boolean') {
          row[key] = value ? 1 : 0;
        } else if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
          throw new Error(`The backup is damaged (unexpected value in "${table}.${key}").`);
        }
      }
    }
  }
  const backup = b as BackupFile;
  return { backup, summary: summarize(backup.data) };
}

function tableColumns(table: string): Set<string> {
  return new Set(db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name));
}

// Inserts `row` into `table`, keeping only columns the current schema has (minus `omit`).
function insertRow(table: string, columns: Set<string>, row: Row, omit: string[] = []): number {
  const keys = Object.keys(row).filter((k) => columns.has(k) && !omit.includes(k));
  if (!keys.length) {
    return db.runSync(`INSERT INTO ${table} DEFAULT VALUES`).lastInsertRowId;
  }
  const result = db.runSync(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => row[k]),
  );
  return result.lastInsertRowId;
}

function nameTaken(name: string): boolean {
  return !!db.getFirstSync('SELECT 1 FROM exercises WHERE name = ?', [name]);
}

// A custom exercise can collide with a local seed exercise's name (e.g. the seed library on
// this install was renamed since the backup was made) — keep both by suffixing the custom one.
function freeExerciseName(name: string): string {
  if (!nameTaken(name)) return name;
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? `${name} (custom)` : `${name} (custom ${i})`;
    if (!nameTaken(candidate)) return candidate;
  }
}

// Replaces all current data with the backup's, atomically — on any error nothing changes.
export function importBackup(backup: BackupFile): void {
  const { data } = backup;

  db.withTransactionSync(() => {
    // Children first (FKs are enforced). Seed exercises stay — they're reference data — but
    // lose any notes and weight lists, which come back from the backup below.
    db.execSync(`
      DELETE FROM cycle_sets;
      DELETE FROM cycle_workouts;
      DELETE FROM cycles;
      DELETE FROM program_exercises;
      DELETE FROM program_workouts;
      DELETE FROM exercises WHERE source = 'USER';
      UPDATE exercises SET notes = NULL, short_note = NULL, weight_options = NULL;
    `);

    // --- settings: the single id = 1 row ---
    const settingsCols = tableColumns('user_settings');
    const settings = data.user_settings[0];
    if (settings) {
      const keys = Object.keys(settings).filter((k) => settingsCols.has(k) && k !== 'id' && k !== 'schema_version');
      if (keys.length) {
        db.runSync(
          `UPDATE user_settings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = 1`,
          keys.map((k) => settings[k]),
        );
      }
    }

    // --- exercises: build backup id → local id ---
    const exerciseCols = tableColumns('exercises');
    const exerciseIdMap = new Map<number, number>();
    // Backup exercise id → its old and new name, for custom exercises mapped onto a library entry
    // with a different name (see the cycle_sets import below).
    const renamedExercises = new Map<number, { from: string; to: string }>();
    const adoptedIds = new Set<number>();
    const restoreNotes = (ex: Row, localId: number) =>
      db.runSync('UPDATE exercises SET notes = ?, short_note = ?, weight_options = ? WHERE id = ?', [
        ex.notes ?? null,
        ex.short_note ?? null,
        ex.weight_options ?? null, // absent in backups made before weight lists existed
        localId,
      ]);
    for (const ex of data.exercises) {
      const backupId = Number(ex.id);
      if (ex.source === 'SEED' && typeof ex.source_slug === 'string') {
        const local = db.getFirstSync<{ id: number }>(
          `SELECT id FROM exercises WHERE source = 'SEED' AND source_slug = ?`,
          [ex.source_slug],
        );
        if (local) {
          restoreNotes(ex, local.id);
          exerciseIdMap.set(backupId, local.id);
          continue;
        }
        // Seed exercise that no longer exists in this install's library — keep it (and the
        // history pointing at it) as a custom exercise instead of dropping it.
      }
      // A custom exercise that has since become a library entry maps onto that entry, the same
      // way the phone's own copy was converted in place (promoteCustomExercises in schema.ts) —
      // restoring an older backup must not bring it back as a duplicate custom exercise.
      const curated = ex.source === 'USER' && typeof ex.name === 'string' ? curatedReplacementFor(ex.name) : undefined;
      if (curated) {
        const local = db.getFirstSync<{ id: number; name: string }>(
          `SELECT id, name FROM exercises WHERE source = 'SEED' AND source_slug = ?`,
          [curated.slug],
        );
        if (local && !adoptedIds.has(local.id)) {
          restoreNotes(ex, local.id);
          exerciseIdMap.set(backupId, local.id);
          adoptedIds.add(local.id);
          if (local.name !== ex.name) renamedExercises.set(backupId, { from: ex.name as string, to: local.name });
          continue;
        }
      }
      if (typeof ex.name !== 'string' || !ex.name.trim()) continue;
      const localId = insertRow(
        'exercises',
        exerciseCols,
        { ...ex, name: freeExerciseName(ex.name), source: 'USER', source_slug: null },
        ['id'],
      );
      exerciseIdMap.set(backupId, localId);
    }
    const mapExerciseId = (id: Value) => (id === null || id === undefined ? null : exerciseIdMap.get(Number(id)) ?? null);

    // --- program ---
    const programWorkoutCols = tableColumns('program_workouts');
    for (const row of data.program_workouts) insertRow('program_workouts', programWorkoutCols, row);

    const programExerciseCols = tableColumns('program_exercises');
    for (const row of data.program_exercises) {
      const exerciseId = mapExerciseId(row.exercise_id);
      if (exerciseId === null) continue; // exercise_id is NOT NULL — nothing to point at
      insertRow('program_exercises', programExerciseCols, { ...row, exercise_id: exerciseId });
    }

    // --- history ---
    const cycleCols = tableColumns('cycles');
    for (const row of data.cycles) insertRow('cycles', cycleCols, row);

    const cycleWorkoutCols = tableColumns('cycle_workouts');
    for (const row of data.cycle_workouts) insertRow('cycle_workouts', cycleWorkoutCols, row);

    // A set's exercise_name is a copy of the exercise's name; follow a custom → library rename the
    // same way promoteCustomExercises does on the phone, so a restore matches an in-place upgrade.
    const cycleSetCols = tableColumns('cycle_sets');
    for (const row of data.cycle_sets) {
      const rename = row.exercise_id === null ? undefined : renamedExercises.get(Number(row.exercise_id));
      insertRow('cycle_sets', cycleSetCols, {
        ...row,
        exercise_id: mapExerciseId(row.exercise_id),
        ...(rename && row.exercise_name === rename.from ? { exercise_name: rename.to } : {}),
      });
    }
  });
}
