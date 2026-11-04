import { getExerciseMuscles } from '../db/exerciseMuscles';
import { MuscleKey } from '../assets/muscles';

// ---------------------------------------------------------------------------
// Superset ideas for a workout's exercises
// ---------------------------------------------------------------------------
// Pairs up a day's exercises so each pair can be done back-to-back (a set of one, straight into
// a set of the other, then the usual rest). Based on Zhang et al., "Superset Versus Traditional
// Resistance Training Prescriptions: A Systematic Review and Meta-analysis", Sports Medicine 2025
// (19 studies): supersets cut session time by roughly a third with the same strength and
// hypertrophy results; agonist–antagonist pairs even raised the reps done, while pairs for the
// same muscles lowered the volume lifted. So, in order of preference:
//   1. opposing muscles (chest + back, biceps + triceps, quads + hamstrings, ...)
//   2. upper body + lower body (no shared muscles, and far apart)
//   3. any other two exercises that don't share a working muscle
// and never two exercises where one's main muscle also works in the other (a curl after a row
// starts with tired biceps), nor two that both load the lower back or the grip.
// Muscles come from the library's primary/secondary tags, so custom exercises (no tags) and
// cardio are left out.

// free-exercise-db only says "shoulders", but the three delt heads pair very differently: a rear
// delt fly opposes a chest press, a lateral raise after a shoulder press does not.
type DeltHead = 'front delts' | 'side delts' | 'rear delts' | 'delts';
type Muscle = Exclude<MuscleKey, 'shoulders'> | DeltHead;

const DELTS: readonly Muscle[] = ['front delts', 'side delts', 'rear delts', 'delts'];

function deltHead(name: string, primary: MuscleKey[], role: 'primary' | 'secondary'): DeltHead {
  const n = name.toLowerCase();
  if (/face pull|reverse fl|rear delt|rear lateral|bent[- ]over (lateral|raise)|reverse pec/.test(n)) return 'rear delts';
  if (/lateral raise|side raise|upright row/.test(n)) return 'side delts';
  if (role === 'primary') return /press|front raise|arnold|push/.test(n) ? 'front delts' : 'delts';
  // As a helper: pushing works the front delt, pulling the rear one.
  if (primary.includes('chest') || primary.includes('triceps') || /press|push|dip/.test(n)) return 'front delts';
  if (primary.includes('lats') || primary.includes('middle back') || /row|pull|chin/.test(n)) return 'rear delts';
  return 'delts';
}

interface Profile {
  index: number;
  primary: Set<Muscle>;
  all: Set<Muscle>;
}

function profile(index: number, name: string, sourceSlug: string | null): Profile | null {
  const muscles = getExerciseMuscles(sourceSlug);
  const primaryKeys = muscles.filter((m) => m.role === 'primary').map((m) => m.key);
  if (primaryKeys.length === 0) return null;
  const refine = (key: MuscleKey, role: 'primary' | 'secondary'): Muscle =>
    key === 'shoulders' ? deltHead(name, primaryKeys, role) : key;
  const primary = new Set(muscles.filter((m) => m.role === 'primary').map((m) => refine(m.key, 'primary')));
  const all = new Set([...primary, ...muscles.filter((m) => m.role === 'secondary').map((m) => refine(m.key, 'secondary'))]);
  return { index, primary, all };
}

// Opposing muscle pairs, each with the short label shown for it.
const ANTAGONISTS: [Muscle, Muscle, string][] = [
  ['chest', 'middle back', 'chest + back'],
  ['chest', 'lats', 'chest + back'],
  ['chest', 'rear delts', 'chest + rear delts'],
  ['front delts', 'lats', 'shoulders + back'],
  ['front delts', 'middle back', 'shoulders + back'],
  ['biceps', 'triceps', 'biceps + triceps'],
  ['quadriceps', 'hamstrings', 'quads + hamstrings'],
  ['abdominals', 'lower back', 'abs + lower back'],
  ['abductors', 'adductors', 'outer + inner thighs'],
];

const LOWER_BODY: readonly Muscle[] = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'];
const UPPER_BODY: readonly Muscle[] = [
  'chest', 'lats', 'middle back', 'traps', 'biceps', 'triceps', 'forearms', 'neck', ...DELTS,
];

function competes(a: Profile, b: Profile): boolean {
  for (const m of a.primary) if (b.all.has(m)) return true;
  for (const m of b.primary) if (a.all.has(m)) return true;
  // Two delt heads as main muscles still share the joint and most of the work.
  if ([...a.primary].some((m) => DELTS.includes(m)) && [...b.primary].some((m) => DELTS.includes(m))) return true;
  // Spine and grip tire out across exercises even as helpers (e.g. a row next to a deadlift).
  if (a.all.has('lower back') && b.all.has('lower back')) return true;
  if (a.all.has('forearms') && b.all.has('forearms')) return true;
  return false;
}

export type SupersetKind = 'opposing' | 'upper-lower' | 'separate';

interface PairFit {
  kind: SupersetKind;
  reason: string;
  score: number;
}

// Weighted so that one opposing pair always beats two weaker ones it would have to be split into.
function fit(a: Profile, b: Profile): PairFit | null {
  if (competes(a, b)) return null;
  for (const [x, y, label] of ANTAGONISTS) {
    if ((a.primary.has(x) && b.primary.has(y)) || (a.primary.has(y) && b.primary.has(x))) {
      return { kind: 'opposing', reason: `Opposing muscles: ${label}`, score: 5 };
    }
  }
  const only = (p: Profile, region: readonly Muscle[]) => [...p.primary].every((m) => region.includes(m));
  if ((only(a, LOWER_BODY) && only(b, UPPER_BODY)) || (only(a, UPPER_BODY) && only(b, LOWER_BODY))) {
    return { kind: 'upper-lower', reason: 'Upper + lower body', score: 2 };
  }
  return { kind: 'separate', reason: 'No shared muscles', score: 1 };
}

export interface SupersetInput {
  name: string;
  sourceSlug: string | null;
  isCardio: boolean;
}

export interface SupersetPair {
  // Indexes into the input list, first < second.
  first: number;
  second: number;
  kind: SupersetKind;
  reason: string;
}

// The set of pairs with the best total fit (exhaustive over subsets, fine for a day's handful of
// exercises). Ties go to pairs closer together in the day's order, so following the ideas means
// moving as little as possible. Returned in day order.
export function suggestSupersets(exercises: SupersetInput[]): SupersetPair[] {
  const profiles = exercises
    .map((e, i) => (e.isCardio ? null : profile(i, e.name, e.sourceSlug)))
    .filter((p): p is Profile => p !== null)
    .slice(0, 16);
  const n = profiles.length;
  if (n < 2) return [];

  const fits: (PairFit | null)[][] = profiles.map((a) => profiles.map((b) => (a === b ? null : fit(a, b))));
  const value = (i: number, j: number) => {
    const f = fits[i][j]!;
    return f.score - Math.abs(profiles[i].index - profiles[j].index) / 1000;
  };

  const memo = new Map<number, { total: number; pairs: [number, number][] }>();
  function best(used: number): { total: number; pairs: [number, number][] } {
    let i = 0;
    while (i < n && used & (1 << i)) i++;
    if (i >= n) return { total: 0, pairs: [] };
    const cached = memo.get(used);
    if (cached) return cached;
    let result = best(used | (1 << i)); // leave exercise i unpaired
    for (let j = i + 1; j < n; j++) {
      if (used & (1 << j) || !fits[i][j]) continue;
      const rest = best(used | (1 << i) | (1 << j));
      const total = rest.total + value(i, j);
      if (total > result.total) result = { total, pairs: [[i, j], ...rest.pairs] };
    }
    memo.set(used, result);
    return result;
  }

  return best(0).pairs
    .map(([i, j]) => ({ first: profiles[i].index, second: profiles[j].index, ...fits[i][j]! }))
    .map(({ first, second, kind, reason }) => ({ first, second, kind, reason }))
    .sort((a, b) => a.first - b.first);
}
