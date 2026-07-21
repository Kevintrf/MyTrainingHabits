import { db } from './client';
import { SEED_EXERCISES_FULL } from './seedExercisesData';

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------
// SQLite conventions used throughout:
//   - INTEGER PRIMARY KEY  → auto-increments
//   - INTEGER              → booleans (0 = false, 1 = true)
//   - REAL                 → floats
//   - TEXT CHECK (...)     → enums
//   - TEXT DEFAULT (datetime('now')) → timestamps, ISO-8601 strings
//
// Domain model: a repeating "program" (program_workouts/program_exercises)
// defines the workouts the user trains. A "cycle" is one live run through
// the program — cycles are stamped out from the program and manually
// advanced (see database/schema.md for the full design).

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS user_settings (
    id                        INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
    rest_timer_enabled        INTEGER NOT NULL DEFAULT 1,
    rest_timer_seconds        INTEGER NOT NULL DEFAULT 120,
    rest_timer_sound_enabled  INTEGER NOT NULL DEFAULT 1,
    schema_version            INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id            INTEGER PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL UNIQUE,
    muscle_group  TEXT NOT NULL DEFAULT 'OTHER'
                    CHECK (muscle_group IN ('CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'CARDIO', 'OTHER')),
    type          TEXT NOT NULL DEFAULT 'STRENGTH'
                    CHECK (type IN ('STRENGTH', 'CARDIO', 'BODYWEIGHT')),
    source        TEXT NOT NULL DEFAULT 'USER' CHECK (source IN ('SEED', 'USER')),
    notes         TEXT,
    equipment     TEXT,
    level         TEXT,
    category      TEXT,
    instructions  TEXT,
    source_slug   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS program_workouts (
    id           INTEGER PRIMARY KEY NOT NULL,
    label        TEXT NOT NULL,
    order_index  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS program_exercises (
    id                   INTEGER PRIMARY KEY NOT NULL,
    program_workout_id   INTEGER NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
    exercise_id          INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    order_index          INTEGER NOT NULL DEFAULT 0,
    default_sets         INTEGER NOT NULL DEFAULT 3,
    default_reps         INTEGER,
    default_weight_kg    REAL
  );

  CREATE TABLE IF NOT EXISTS cycles (
    id           INTEGER PRIMARY KEY NOT NULL,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS cycle_workouts (
    id                   INTEGER PRIMARY KEY NOT NULL,
    cycle_id             INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
    program_workout_id   INTEGER REFERENCES program_workouts(id) ON DELETE SET NULL,
    label                TEXT NOT NULL,
    order_index          INTEGER NOT NULL DEFAULT 0,
    is_complete          INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cycle_sets (
    id                  INTEGER PRIMARY KEY NOT NULL,
    cycle_workout_id    INTEGER NOT NULL REFERENCES cycle_workouts(id) ON DELETE CASCADE,
    exercise_id         INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
    exercise_name       TEXT NOT NULL,
    set_number          INTEGER NOT NULL,
    reps                INTEGER,
    weight_kg           REAL,
    is_complete         INTEGER NOT NULL DEFAULT 0,
    completed_at        TEXT
  );
`;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_program_exercises_workout
    ON program_exercises(program_workout_id);

  CREATE INDEX IF NOT EXISTS idx_cycle_workouts_cycle
    ON cycle_workouts(cycle_id);

  CREATE INDEX IF NOT EXISTS idx_cycle_sets_workout
    ON cycle_sets(cycle_workout_id);

  CREATE INDEX IF NOT EXISTS idx_cycle_sets_exercise
    ON cycle_sets(exercise_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_cycles_one_active
    ON cycles(is_active) WHERE is_active = 1;
`;

// ---------------------------------------------------------------------------
// Starter exercise library — the full free-exercise-db dataset (873 exercises,
// public domain). See scripts/import-free-exercise-db.py for how this data and
// its accompanying image manifest (src/assets/exerciseImages.ts) are generated.
// ---------------------------------------------------------------------------

function seedExercises(): void {
  // The original 10-exercise placeholder library (pre-free-exercise-db) never had a
  // source_slug — delete it. Only matches those original rows: every exercise in the
  // real import always has a source_slug, so this is a no-op after the first run.
  db.execSync(`DELETE FROM exercises WHERE source = 'SEED' AND source_slug IS NULL;`);

  // Skip the (large) insert loop once it's already been done — every row here has a
  // source_slug, so counting them tells us whether this install is already caught up.
  const { count } = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM exercises WHERE source_slug IS NOT NULL`,
  )!;
  if (count >= SEED_EXERCISES_FULL.length) return;

  for (const ex of SEED_EXERCISES_FULL) {
    db.runSync(
      `INSERT OR IGNORE INTO exercises
         (name, muscle_group, type, source, equipment, level, category, instructions, source_slug)
       VALUES (?, ?, ?, 'SEED', ?, ?, ?, ?, ?)`,
      [ex.name, ex.muscle_group, ex.type, ex.equipment, ex.level, ex.category, ex.instructions, ex.slug],
    );
  }
}

// ---------------------------------------------------------------------------
// initSchema — call once on app start, before any queries are made
// ---------------------------------------------------------------------------

export function initSchema(): void {
  // WAL mode improves concurrent read performance and crash safety
  db.execSync('PRAGMA journal_mode = WAL;');

  db.withTransactionSync(() => {
    // Drop tables left over from the MyFoodHabits pivot — irrelevant to this domain.
    // weights/body-weight tracking was later removed from this app entirely.
    db.execSync(`
      DROP TABLE IF EXISTS log_items;
      DROP TABLE IF EXISTS day_logs;
      DROP TABLE IF EXISTS meal_items;
      DROP TABLE IF EXISTS meals;
      DROP TABLE IF EXISTS food_servings;
      DROP TABLE IF EXISTS foods;
      DROP TABLE IF EXISTS weights;
    `);

    // user_settings has shed columns across several pivots (food targets, then
    // weight_unit) that don't fit CREATE TABLE IF NOT EXISTS — rebuild it fresh if it's
    // that old a shape. Nothing on it is worth preserving from that era.
    const settingsCols = db.getAllSync<{ name: string }>('PRAGMA table_info(user_settings)');
    if (settingsCols.some((c) => c.name === 'target_calories' || c.name === 'weight_unit')) {
      db.execSync('DROP TABLE user_settings;');
    }

    // cycle_workouts.program_workout_id used to be NOT NULL with no ON DELETE behavior,
    // which made deleting a program workout fail with a foreign key constraint error the
    // moment any cycle had been stamped from it (i.e. almost always). Rebuild the table
    // with a nullable FK + ON DELETE SET NULL if it's still the old shape — ids are
    // preserved, so cycle_sets' references and all history stay intact.
    const cycleWorkoutsCols = db.getAllSync<{ name: string; notnull: number }>('PRAGMA table_info(cycle_workouts)');
    const programWorkoutIdCol = cycleWorkoutsCols.find((c) => c.name === 'program_workout_id');
    if (programWorkoutIdCol && programWorkoutIdCol.notnull === 1) {
      db.execSync(`
        CREATE TABLE cycle_workouts_new (
          id                   INTEGER PRIMARY KEY NOT NULL,
          cycle_id             INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
          program_workout_id   INTEGER REFERENCES program_workouts(id) ON DELETE SET NULL,
          label                TEXT NOT NULL,
          order_index          INTEGER NOT NULL DEFAULT 0,
          is_complete          INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO cycle_workouts_new (id, cycle_id, program_workout_id, label, order_index, is_complete)
          SELECT id, cycle_id, program_workout_id, label, order_index, is_complete FROM cycle_workouts;
        DROP TABLE cycle_workouts;
        ALTER TABLE cycle_workouts_new RENAME TO cycle_workouts;
      `);
    }

    // program_exercises.exercise_id used to have no ON DELETE behavior, which would make
    // deleting an exercise fail with a foreign key error if it was used anywhere in the
    // program. It's just config (not history), so CASCADE is correct: if the exercise is
    // gone, drop it from the program too. Rebuild if the old (non-CASCADE) shape is found.
    const programExerciseFks = db.getAllSync<{ table: string; from: string; on_delete: string }>(
      'PRAGMA foreign_key_list(program_exercises)',
    );
    const exerciseFk = programExerciseFks.find((fk) => fk.table === 'exercises' && fk.from === 'exercise_id');
    if (exerciseFk && exerciseFk.on_delete !== 'CASCADE') {
      db.execSync(`
        CREATE TABLE program_exercises_new (
          id                   INTEGER PRIMARY KEY NOT NULL,
          program_workout_id   INTEGER NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
          exercise_id          INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
          order_index          INTEGER NOT NULL DEFAULT 0,
          default_sets         INTEGER NOT NULL DEFAULT 3,
          default_reps         INTEGER,
          default_weight_kg    REAL
        );
        INSERT INTO program_exercises_new SELECT * FROM program_exercises;
        DROP TABLE program_exercises;
        ALTER TABLE program_exercises_new RENAME TO program_exercises;
      `);
    }

    // cycle_sets.exercise_id used to have no ON DELETE behavior either — but unlike
    // program_exercises, these rows are historical training logs, so CASCADE would
    // silently destroy logged sets whenever an exercise is deleted. Instead: make the FK
    // nullable with ON DELETE SET NULL, and denormalize the exercise's name onto the row
    // (like cycle_workouts.label) so history stays fully readable even after the source
    // exercise is gone. Rebuild if the old shape (no exercise_name column) is found.
    const cycleSetsCols = db.getAllSync<{ name: string }>('PRAGMA table_info(cycle_sets)');
    if (cycleSetsCols.length > 0 && !cycleSetsCols.some((c) => c.name === 'exercise_name')) {
      db.execSync(`
        CREATE TABLE cycle_sets_new (
          id                  INTEGER PRIMARY KEY NOT NULL,
          cycle_workout_id    INTEGER NOT NULL REFERENCES cycle_workouts(id) ON DELETE CASCADE,
          exercise_id         INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
          exercise_name       TEXT NOT NULL,
          set_number          INTEGER NOT NULL,
          reps                INTEGER,
          weight_kg           REAL,
          is_complete         INTEGER NOT NULL DEFAULT 0,
          completed_at        TEXT
        );
        INSERT INTO cycle_sets_new (id, cycle_workout_id, exercise_id, exercise_name, set_number, reps, weight_kg, is_complete)
          SELECT cs.id, cs.cycle_workout_id, cs.exercise_id, e.name, cs.set_number, cs.reps, cs.weight_kg, cs.is_complete
          FROM cycle_sets cs JOIN exercises e ON e.id = cs.exercise_id;
        DROP TABLE cycle_sets;
        ALTER TABLE cycle_sets_new RENAME TO cycle_sets;
      `);
    }

    db.execSync(CREATE_TABLES);
    db.execSync(CREATE_INDEXES);

    // exercises columns added after the initial CREATE TABLE IF NOT EXISTS shipped —
    // add them for existing installs (no-op on fresh installs, already created above).
    for (const column of ['notes', 'equipment', 'level', 'category', 'instructions', 'source_slug']) {
      try {
        db.execSync(`ALTER TABLE exercises ADD COLUMN ${column} TEXT;`);
      } catch {
        // already exists
      }
    }

    // cycle_sets.completed_at added after exercise_name shipped — covers installs that
    // already went through the exercise_name rebuild above (so completed_at wasn't part
    // of it) as well as fresh installs (no-op, already created by CREATE_TABLES).
    try {
      db.execSync('ALTER TABLE cycle_sets ADD COLUMN completed_at TEXT;');
    } catch {
      // already exists
    }

    // user_settings.rest_timer_seconds added after the initial table shipped.
    try {
      db.execSync('ALTER TABLE user_settings ADD COLUMN rest_timer_seconds INTEGER NOT NULL DEFAULT 120;');
    } catch {
      // already exists
    }

    // user_settings.rest_timer_enabled added after rest_timer_seconds.
    try {
      db.execSync('ALTER TABLE user_settings ADD COLUMN rest_timer_enabled INTEGER NOT NULL DEFAULT 1;');
    } catch {
      // already exists
    }

    // user_settings.rest_timer_sound_enabled added after rest_timer_enabled.
    try {
      db.execSync('ALTER TABLE user_settings ADD COLUMN rest_timer_sound_enabled INTEGER NOT NULL DEFAULT 1;');
    } catch {
      // already exists
    }

    // The "name" profile field was removed — drop it for installs that still have it.
    // Requires SQLite 3.35+ (bundled by expo-sqlite); harmless no-op once already dropped.
    try {
      db.execSync('ALTER TABLE user_settings DROP COLUMN name;');
    } catch {
      // already dropped, or never had it
    }

    // Seed the single user_settings row on first install
    db.runSync('INSERT OR IGNORE INTO user_settings (id, schema_version) VALUES (1, 1)');

    seedExercises();
  });
}
