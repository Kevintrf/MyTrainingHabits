import { CycleSet, CycleWorkoutExercise } from '../services/api';

// A set counts as "old" once its reference time is on an earlier calendar day, or 2+ hours
// ago on the same day. Checking it off then would stamp it with the current time and move it
// in ExerciseHistoryScreen, so the user is asked which time to use instead.
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

// Consecutive-set gaps longer than this aren't treated as "rest between sets" when working
// out a workout's typical pace (e.g. a long break, or sets logged out of order).
const MAX_PACE_GAP_MS = 20 * 60 * 1000;

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isStale(iso: string, now: Date = new Date()): boolean {
  const t = new Date(iso);
  return !isSameLocalDay(t, now) || now.getTime() - t.getTime() >= STALE_AFTER_MS;
}

export type CompletionTimeSuggestion =
  // The set was checked off before (then unchecked) — restore that exact time.
  | { kind: 'original'; at: string }
  // The set was never checked off, but the rest of its workout was logged a while ago —
  // place it among the sets around it. referenceAt is the workout's latest logged set.
  | { kind: 'estimated'; at: string; referenceAt: string };

function completedTimes(sets: CycleSet[], excludeId: number): { set: CycleSet; t: number }[] {
  return sets
    .filter((s) => s.id !== excludeId && s.is_complete && s.completed_at)
    .map((s) => ({ set: s, t: new Date(s.completed_at!).getTime() }));
}

// Median gap between consecutive completed sets of the same exercise in this workout — the
// user's actual pace that day, rest included. Null when there's nothing to measure.
function typicalGapMs(exercises: CycleWorkoutExercise[], excludeId: number): number | null {
  const gaps: number[] = [];
  for (const ex of exercises) {
    const times = completedTimes(ex.sets, excludeId).map((c) => c.t).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      if (gap > 0 && gap <= MAX_PACE_GAP_MS) gaps.push(gap);
    }
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

// Decides whether checking off `target` needs the "which time?" prompt, and if so what the
// non-current option should be. Returns null when it doesn't (current time is the only
// sensible answer): the set's own earlier time is recent, or nothing else in the workout was
// logged long enough ago to suggest the workout happened earlier.
export function suggestCompletionTime(
  target: CycleSet,
  exercises: CycleWorkoutExercise[],
  fallbackGapMs: number,
  now: Date = new Date(),
): CompletionTimeSuggestion | null {
  if (target.completed_at) {
    return isStale(target.completed_at, now) ? { kind: 'original', at: target.completed_at } : null;
  }

  const all = exercises.flatMap((ex) => completedTimes(ex.sets, target.id));
  if (!all.length) return null;
  const latest = Math.max(...all.map((c) => c.t));
  if (!isStale(new Date(latest).toISOString(), now)) return null;

  const gap = typicalGapMs(exercises, target.id) ?? fallbackGapMs;
  const exIndex = exercises.findIndex((ex) => ex.sets.some((s) => s.id === target.id));
  let estimate: number | null = null;

  // 1. Sets of the same exercise: slot between its neighbours, or one gap after/before.
  if (exIndex !== -1) {
    const siblings = completedTimes(exercises[exIndex].sets, target.id);
    const before = siblings.filter((c) => c.set.set_number < target.set_number);
    const after = siblings.filter((c) => c.set.set_number > target.set_number);
    const prev = before.length ? before.reduce((a, b) => (b.set.set_number > a.set.set_number ? b : a)) : null;
    const next = after.length ? after.reduce((a, b) => (b.set.set_number < a.set.set_number ? b : a)) : null;
    if (prev && next) estimate = Math.round((prev.t + next.t) / 2);
    else if (prev) estimate = prev.t + gap;
    else if (next) estimate = next.t - gap;
  }

  // 2. Otherwise the nearest exercise before it in the workout (one gap after its last
  // set), then the nearest one after it (one gap before its first set).
  if (estimate === null && exIndex !== -1) {
    for (let j = exIndex - 1; j >= 0 && estimate === null; j--) {
      const times = completedTimes(exercises[j].sets, target.id).map((c) => c.t);
      if (times.length) estimate = Math.max(...times) + gap;
    }
    for (let j = exIndex + 1; j < exercises.length && estimate === null; j++) {
      const times = completedTimes(exercises[j].sets, target.id).map((c) => c.t);
      if (times.length) estimate = Math.min(...times) - gap;
    }
  }

  if (estimate === null) estimate = latest + gap;
  estimate = Math.min(estimate, now.getTime());

  return { kind: 'estimated', at: new Date(estimate).toISOString(), referenceAt: new Date(latest).toISOString() };
}

// "today at 6:32 PM" / "yesterday at 6:32 PM" / "Tue, Nov 3 at 6:32 PM"
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = formatClock(iso);
  if (isSameLocalDay(d, now)) return `today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return `yesterday at ${time}`;
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${day} at ${time}`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
