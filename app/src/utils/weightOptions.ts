// Fixed lists of weights an exercise can be switched to (ExerciseDetailScreen's "Weight input"
// section), so the weight on a set is picked from a grid instead of typed in. Which list an
// exercise uses is stored as its id in exercises.weight_options — ids are stored data, so never
// rename one; add a new list instead.

export interface WeightOptionSet {
  id: string;
  name: string;
  weights: number[];
  // A small extra weight that can be added on top of any step (e.g. a stack's add-on plate),
  // null if the list has none.
  addOn: number | null;
}

function steps(from: number, step: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => roundKg(from + i * step));
}

export function roundKg(n: number): number {
  return Math.round(n * 100) / 100;
}

export const WEIGHT_OPTION_SETS: WeightOptionSet[] = [
  {
    id: 'stack-2.5-44.5',
    name: 'Weight stack 2.5–44.5 kg',
    weights: steps(2.5, 3.5, 13), // 2.5, 6, 9.5, … 44.5
    addOn: 1.75,
  },
  {
    id: 'stack-5-117',
    name: 'Weight stack 5–117 kg',
    weights: steps(5, 7, 17), // 5, 12, 19, … 117
    addOn: 3.5,
  },
  {
    id: 'stack-7.5-82.5',
    name: 'Weight stack 7.5–82.5 kg',
    weights: steps(7.5, 7.5, 11), // 7.5, 15, 22.5, … 82.5
    addOn: 3.75,
  },
  {
    id: 'dumbbells-1-32.5',
    name: 'Dumbbells 1–32.5 kg',
    weights: [...steps(1, 1, 10), ...steps(12.5, 2.5, 9)], // 1–10, then 12.5 … 32.5
    addOn: null,
  },
];

// Undefined for null and for an id this version of the app doesn't know (e.g. from a backup
// made by a newer version) — the exercise then falls back to typing the weight in.
export function getWeightOptionSet(id: string | null | undefined): WeightOptionSet | undefined {
  return id ? WEIGHT_OPTION_SETS.find((s) => s.id === id) : undefined;
}

// Splits a weight into a step of the list plus whether the add-on is on top of it, or null if
// it isn't a weight the list can make (e.g. typed in before the exercise was switched over).
export function decomposeWeight(set: WeightOptionSet, weight: number): { base: number; addOn: boolean } | null {
  const w = roundKg(weight);
  if (set.weights.includes(w)) return { base: w, addOn: false };
  if (set.addOn !== null) {
    const base = roundKg(w - set.addOn);
    if (set.weights.includes(base)) return { base, addOn: true };
  }
  return null;
}

export function composeWeight(set: WeightOptionSet, base: number, addOn: boolean): number {
  return roundKg(base + (addOn && set.addOn !== null ? set.addOn : 0));
}

// Short summary for the settings list, e.g. "2.5, 6, 9.5 … 44.5 · +1.75 on any step".
export function describeWeightOptionSet(set: WeightOptionSet): string {
  const w = set.weights;
  const range = w.length > 4 ? `${w.slice(0, 3).join(', ')} … ${w[w.length - 1]}` : w.join(', ');
  return set.addOn !== null ? `${range} · +${set.addOn} on any step` : range;
}
