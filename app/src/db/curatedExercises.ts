import { SEED_EXERCISES_FULL, SeedExerciseData } from './seedExercisesData';

// ---------------------------------------------------------------------------
// Curated library entries that replace custom exercises
// ---------------------------------------------------------------------------
// The hand-curated additions at the end of SEED_EXERCISES_FULL (from scripts/extra-exercises.json)
// started out as custom exercises; each lists those custom names in `replaces_custom`. A custom
// exercise with one of those names is the same exercise, so it becomes the library entry instead
// of staying a separate custom one — in place on launch (promoteCustomExercises in schema.ts) and
// when restoring an older backup (importBackup in backup.ts).

export const CURATED_EXERCISES = SEED_EXERCISES_FULL.filter((entry) => entry.replaces_custom);

// Custom names are matched ignoring case and surrounding whitespace.
export function customNameKey(name: string): string {
  return name.trim().toLowerCase();
}

const BY_CUSTOM_NAME = new Map<string, SeedExerciseData>();
for (const entry of CURATED_EXERCISES) {
  for (const name of entry.replaces_custom!) BY_CUSTOM_NAME.set(customNameKey(name), entry);
}

// The curated library entry that replaced the custom exercise called `name`, if any.
export function curatedReplacementFor(name: string): SeedExerciseData | undefined {
  return BY_CUSTOM_NAME.get(customNameKey(name));
}
