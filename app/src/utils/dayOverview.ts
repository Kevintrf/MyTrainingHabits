import { getExerciseMuscles, ExerciseMuscle } from '../db/exerciseMuscles';
import { MUSCLE_INFO, MuscleKey } from '../assets/muscles';

// ---------------------------------------------------------------------------
// Overview of a workout day: which muscles its exercises work, and how much
// ---------------------------------------------------------------------------
// Pure and computed on the spot from the day's exercises and the library's muscle tags (via
// getExerciseMuscles), so it always matches whatever the day holds right now. Shown on
// WorkoutInfoScreen.
//
// Volume is counted in sets, the usual unit for training volume per muscle: an exercise's sets
// count as "direct" sets for its primary muscles and "indirect" sets for its secondary ones.
// Custom exercises (no library tags) and exercises removed from the library have no muscle data
// and are only counted in the totals.

export type BodyRegion = 'upper' | 'core' | 'lower';

export const REGION_NAMES: Record<BodyRegion, string> = {
  upper: 'Upper body',
  core: 'Core',
  lower: 'Lower body',
};

const REGION_OF: Record<MuscleKey, BodyRegion> = {
  chest: 'upper', lats: 'upper', 'middle back': 'upper', traps: 'upper', shoulders: 'upper',
  biceps: 'upper', triceps: 'upper', forearms: 'upper', neck: 'upper',
  abdominals: 'core', 'lower back': 'core',
  quadriceps: 'lower', hamstrings: 'lower', glutes: 'lower', calves: 'lower', abductors: 'lower', adductors: 'lower',
};

// Display order for muscles with equal volume, and for the "not worked" list: top to bottom.
const MUSCLE_ORDER: MuscleKey[] = [
  'neck', 'traps', 'shoulders', 'chest', 'lats', 'middle back', 'biceps', 'triceps', 'forearms',
  'abdominals', 'lower back', 'glutes', 'abductors', 'adductors', 'quadriceps', 'hamstrings', 'calves',
];

export interface DayOverviewInput {
  sourceSlug: string | null;
  setCount: number;
  doneSetCount: number;
}

export interface DayExercise {
  // Index into the input list.
  index: number;
  muscles: ExerciseMuscle[];
}

export interface MuscleVolume {
  key: MuscleKey;
  name: string;
  anatomy: string;
  action: string;
  directSets: number;
  indirectSets: number;
  // Indexes of the exercises working it, primary ones first, each in day order.
  primaryIn: number[];
  secondaryIn: number[];
}

export interface DayOverview {
  exerciseCount: number;
  setCount: number;
  doneSetCount: number;
  exercises: DayExercise[];
  // Every muscle the day works, most direct sets first (then most indirect sets).
  muscles: MuscleVolume[];
  // Muscles the day doesn't work at all, top to bottom.
  untrained: MuscleKey[];
  // Share (0–1) of the day's direct sets per region. An exercise whose primary muscles span
  // several regions (e.g. a deadlift: lower back + hamstrings) splits its sets between them.
  // Empty when no exercise has muscle data.
  regionShare: { region: BodyRegion; share: number }[];
  // Indexes of exercises with no muscle data (custom or removed from the library).
  withoutMuscleData: number[];
}

export function buildDayOverview(inputs: DayOverviewInput[]): DayOverview {
  const exercises: DayExercise[] = inputs.map((e, index) => ({ index, muscles: getExerciseMuscles(e.sourceSlug) }));

  const volumes = new Map<MuscleKey, MuscleVolume>();
  const volumeFor = (key: MuscleKey): MuscleVolume => {
    let v = volumes.get(key);
    if (!v) {
      const info = MUSCLE_INFO[key];
      v = { key, name: info.name, anatomy: info.anatomy, action: info.action, directSets: 0, indirectSets: 0, primaryIn: [], secondaryIn: [] };
      volumes.set(key, v);
    }
    return v;
  };

  const regionSets: Record<BodyRegion, number> = { upper: 0, core: 0, lower: 0 };
  for (const ex of exercises) {
    const sets = inputs[ex.index].setCount;
    for (const m of ex.muscles) {
      const v = volumeFor(m.key);
      if (m.role === 'primary') {
        v.directSets += sets;
        v.primaryIn.push(ex.index);
      } else {
        v.indirectSets += sets;
        v.secondaryIn.push(ex.index);
      }
    }
    const regions = [...new Set(ex.muscles.filter((m) => m.role === 'primary').map((m) => REGION_OF[m.key]))];
    for (const r of regions) regionSets[r] += sets / regions.length;
  }

  const muscles = [...volumes.values()].sort((a, b) =>
    b.directSets - a.directSets
    || b.indirectSets - a.indirectSets
    || MUSCLE_ORDER.indexOf(a.key) - MUSCLE_ORDER.indexOf(b.key));

  const totalRegionSets = regionSets.upper + regionSets.core + regionSets.lower;
  const regionShare = totalRegionSets > 0
    ? (['upper', 'core', 'lower'] as BodyRegion[])
      .filter((r) => regionSets[r] > 0)
      .map((region) => ({ region, share: regionSets[region] / totalRegionSets }))
    : [];

  return {
    exerciseCount: inputs.length,
    setCount: inputs.reduce((sum, e) => sum + e.setCount, 0),
    doneSetCount: inputs.reduce((sum, e) => sum + e.doneSetCount, 0),
    exercises,
    muscles,
    untrained: MUSCLE_ORDER.filter((k) => !volumes.has(k)),
    regionShare,
    withoutMuscleData: exercises.filter((e) => e.muscles.length === 0).map((e) => e.index),
  };
}
