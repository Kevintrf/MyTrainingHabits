import { SEED_EXERCISES_FULL } from './seedExercisesData';
import { MUSCLE_INFO, MuscleKey } from '../assets/muscles';

// ---------------------------------------------------------------------------
// Muscles worked by a library exercise
// ---------------------------------------------------------------------------
// Read straight from the bundled library data by source_slug (like the images in
// EXERCISE_IMAGES) rather than stored per row, so a data update reaches existing installs
// without a migration. Custom exercises have no slug and therefore no muscle data.

export type MuscleRole = 'primary' | 'secondary';

export interface ExerciseMuscle {
  key: MuscleKey;
  role: MuscleRole;
  name: string;
  // The exercise's own narrower anatomy line if it has one, else MUSCLE_INFO's general one.
  anatomy: string;
  action: string;
}

const BY_SLUG = new Map(SEED_EXERCISES_FULL.map((entry) => [entry.slug, entry]));

export function getExerciseMuscles(sourceSlug: string | null): ExerciseMuscle[] {
  const entry = sourceSlug ? BY_SLUG.get(sourceSlug) : undefined;
  if (!entry) return [];
  const describe = (key: MuscleKey, role: MuscleRole): ExerciseMuscle => ({
    key,
    role,
    name: MUSCLE_INFO[key].name,
    anatomy: entry.muscle_details?.[key] ?? MUSCLE_INFO[key].anatomy,
    action: MUSCLE_INFO[key].action,
  });
  return [
    ...entry.primary_muscles.map((key) => describe(key, 'primary')),
    ...entry.secondary_muscles.map((key) => describe(key, 'secondary')),
  ];
}
