import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useSetTimePrompt } from '../context/SetTimePromptContext';
import SetTimeChoiceToast from '../components/SetTimeChoiceToast';
import { CycleStackParamList } from '../navigation/RootNavigator';
import { getCycleWorkoutDetail } from '../db/cycles';
import { addSet, getLastSetsForExercise, getTargetStreak, markSetComplete, updateSet } from '../db/sets';
import { updateExerciseShortNote } from '../db/exercises';
import { getSettings } from '../db/settings';
import { suggestCompletionTime } from '../utils/setTiming';
import { CycleSet, CycleWorkoutDetail, CycleWorkoutExercise, TargetStreak } from '../services/api';

// Stable per-exercise key within a workout — falls back to name when the source
// exercise has been deleted (exercise_id null) so grouping doesn't collide.
function exerciseKey(exercise: CycleWorkoutExercise): string {
  return exercise.exercise_id !== null ? String(exercise.exercise_id) : `deleted:${exercise.exercise_name}`;
}

// The time to stamp on a set being checked off: { at, backdated } — or null if the user
// cancelled the "which time?" prompt and the set should stay unchecked.
type ResolveCompletedAt = (set: CycleSet) => Promise<{ at: string; backdated: boolean } | null>;

function SetRow({ set, lastSet, defaultReps, onToggled, resolveCompletedAt }: {
  set: CycleSet;
  lastSet?: CycleSet;
  // The program's target rep count for this exercise — the reps suggestion only when
  // there's no previous result to suggest from (see below).
  defaultReps: number | null;
  onToggled: () => void;
  resolveCompletedAt: ResolveCompletedAt;
}) {
  // Seeded only from the set's own saved value, never from a suggestion — a suggestion
  // (the reps/weight last logged for this exercise, else the program's default reps) is shown via
  // `placeholder` instead, so it reads as grey/suggested rather than indistinguishable from
  // something actually entered.
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight_kg != null ? String(set.weight_kg) : '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { startRestTimer } = useApp();

  // Same on every day the exercise appears: the latest logged result wins over the day's
  // program target, which is only a fallback for an exercise with no history yet.
  const suggestedReps = lastSet?.reps ?? defaultReps;
  const suggestedWeight = lastSet?.weight_kg ?? null;
  const repsPlaceholder = suggestedReps != null ? String(suggestedReps) : 'reps';
  const weightPlaceholder = suggestedWeight != null ? String(suggestedWeight) : 'kg';

  function parsedPatch(r: string, w: string) {
    const repsNum = parseInt(r, 10);
    const weightNum = parseFloat(w);
    return {
      reps: !isNaN(repsNum) ? repsNum : null,
      weight_kg: !isNaN(weightNum) ? weightNum : null,
    };
  }

  function schedule(r: string, w: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateSet(set.id, parsedPatch(r, w)), 500);
  }

  async function handleToggle() {
    const nowComplete = !set.is_complete;

    // Checking off a set in an older workout may prompt for which time to log it at. Asked
    // before touching anything else, so cancelling leaves the set exactly as it was (any
    // still-pending debounced reps/weight save is left to run as normal).
    let completion: { at: string; backdated: boolean } | null = null;
    if (nowComplete) {
      completion = await resolveCompletedAt(set);
      if (!completion) return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Finishing a set that was left blank takes on the shown grey suggestion rather than
    // saving nothing — un-marking a set never does this, only completing one, and a field
    // the user already typed something into is left exactly as entered.
    const finalReps = nowComplete && reps === '' && suggestedReps != null ? String(suggestedReps) : reps;
    const finalWeight = nowComplete && weight === '' && suggestedWeight != null ? String(suggestedWeight) : weight;
    if (finalReps !== reps) setReps(finalReps);
    if (finalWeight !== weight) setWeight(finalWeight);

    await updateSet(set.id, parsedPatch(finalReps, finalWeight));
    await markSetComplete(set.id, nowComplete, completion?.at);
    // Only starts the rest timer when finishing a set live — not when un-marking one, and not
    // when back-filling a set into its original (earlier) time.
    if (completion && !completion.backdated) startRestTimer();
    onToggled();
  }

  return (
    <View style={styles.setRow}>
      <Text style={styles.setNumber}>{set.set_number}</Text>
      <TextInput
        style={styles.setInput}
        keyboardType="number-pad"
        placeholder={repsPlaceholder}
        placeholderTextColor="#bbb"
        value={reps}
        onChangeText={(v) => { setReps(v); schedule(v, weight); }}
        autoComplete="off" textContentType="none" importantForAutofill="no"
      />
      <TextInput
        style={styles.setInput}
        keyboardType="decimal-pad"
        placeholder={weightPlaceholder}
        placeholderTextColor="#bbb"
        value={weight}
        onChangeText={(v) => { setWeight(v); schedule(reps, v); }}
        autoComplete="off" textContentType="none" importantForAutofill="no"
      />
      <TouchableOpacity onPress={handleToggle} style={styles.setCheckbox}>
        <Ionicons
          name={set.is_complete ? 'checkbox' : 'square-outline'}
          size={24}
          color={set.is_complete ? '#2D6A4F' : '#ccc'}
        />
      </TouchableOpacity>
    </View>
  );
}

function ExerciseCard({ exercise, lastSets, targetStreak, onChanged, resolveCompletedAt }: {
  exercise: CycleWorkoutExercise;
  lastSets: CycleSet[];
  // Set when last time (and maybe several times in a row) every set hit the target reps at
  // one weight — shown as a small "maybe raise the weight" hint under the name.
  targetStreak: TargetStreak | null;
  onChanged: () => void;
  resolveCompletedAt: ResolveCompletedAt;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<CycleStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(exercise.short_note ?? '');
  const allDone = exercise.sets.length > 0 && exercise.sets.every((s) => s.is_complete);
  const exerciseId = exercise.exercise_id;

  async function handleAddSet() {
    if (exerciseId === null) return;
    await addSet(exercise.sets[0].cycle_workout_id, exerciseId);
    onChanged();
  }

  function handleStartEditNote() {
    if (exerciseId === null) return;
    setNoteDraft(exercise.short_note ?? '');
    setEditingNote(true);
  }

  async function handleCommitNote() {
    setEditingNote(false);
    if (exerciseId === null) return;
    await updateExerciseShortNote(exerciseId, noteDraft);
    onChanged();
  }

  return (
    <View style={[styles.card, allDone && styles.cardDone]}>
      <TouchableOpacity
        style={styles.cardHeader}
        activeOpacity={0.6}
        onPress={() => setExpanded((v) => !v)}
        onLongPress={exerciseId !== null ? handleStartEditNote : undefined}
        delayLongPress={350}
      >
        <View style={styles.cardHeaderText}>
          <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
          <Text style={styles.exerciseMeta}>
            {exercise.sets.length} sets{exerciseId === null ? ' · removed from library' : ''}
          </Text>
          {targetStreak && (
            <View style={styles.streakHint}>
              <Ionicons name="trending-up" size={13} color="#2D6A4F" />
              <Text style={styles.streakHintText}>
                Hit {exercise.program_exercise_default_reps} reps on all sets
                {targetStreak.weight_kg != null ? ` @ ${targetStreak.weight_kg} kg` : ''}
                {targetStreak.count > 1 ? ` · ${targetStreak.count}× in a row` : ' last time'}
              </Text>
            </View>
          )}
          {!!exercise.short_note && !editingNote && (
            <Text style={styles.exerciseNote}>{exercise.short_note}</Text>
          )}
        </View>

        {exerciseId !== null && (
          <>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('ExerciseDetail', { exerciseId, exerciseName: exercise.exercise_name })}
            >
              <Ionicons name="book-outline" size={18} color="#2D6A4F" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('ExerciseHistory', { exerciseId, exerciseName: exercise.exercise_name })}
            >
              <Ionicons name="time-outline" size={18} color="#2D6A4F" />
            </TouchableOpacity>
          </>
        )}

        {allDone && <Ionicons name="checkmark-circle" size={20} color="#2D6A4F" />}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
      </TouchableOpacity>

      {editingNote && (
        <TextInput
          style={styles.noteInput}
          value={noteDraft}
          onChangeText={setNoteDraft}
          onBlur={handleCommitNote}
          placeholder="Add a note for this exercise..."
          placeholderTextColor="#bbb"
          autoFocus
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          autoComplete="off" textContentType="none" importantForAutofill="no"
        />
      )}

      {expanded && (
        <View style={styles.cardBody}>
          {exercise.sets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              // Positional (set #1 ← last time's set #1); sets beyond last time's count
              // reuse its final set rather than showing no suggestion.
              lastSet={lastSets[i] ?? lastSets[lastSets.length - 1]}
              defaultReps={exercise.program_exercise_default_reps}
              onToggled={onChanged}
              resolveCompletedAt={resolveCompletedAt}
            />
          ))}
          {exerciseId !== null && (
            <TouchableOpacity style={styles.addSetBtn} onPress={handleAddSet}>
              <Ionicons name="add" size={16} color="#2D6A4F" />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function WorkoutScreen() {
  const route = useRoute<RouteProp<CycleStackParamList, 'Workout'>>();
  const { cycleWorkoutId } = route.params;
  const { refreshCycle } = useApp();
  const { chooseSetTime } = useSetTimePrompt();

  const [detail, setDetail] = useState<CycleWorkoutDetail | null>(null);
  const [lastSets, setLastSets] = useState<Record<string, CycleSet[]>>({});
  const [targetStreaks, setTargetStreaks] = useState<Record<string, TargetStreak | null>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await getCycleWorkoutDetail(cycleWorkoutId);
    setDetail(d);

    // Deleted exercises (exercise_id null) have no "current" exercise to look up
    // progression for — and can't be re-added anyway, so skip the lookup.
    const entries = await Promise.all(
      d.exercises.map((e) => (e.exercise_id !== null ? getLastSetsForExercise(e.exercise_id, cycleWorkoutId) : Promise.resolve([]))),
    );
    const map: Record<string, CycleSet[]> = {};
    d.exercises.forEach((e, i) => { map[exerciseKey(e)] = entries[i]; });
    setLastSets(map);

    // Only exercises with a program target rep count can have "met the target" streaks.
    const streaks = await Promise.all(
      d.exercises.map((e) => (e.exercise_id !== null && e.program_exercise_default_reps != null
        ? getTargetStreak(e.exercise_id, e.program_exercise_default_reps, cycleWorkoutId)
        : Promise.resolve(null))),
    );
    const streakMap: Record<string, TargetStreak | null> = {};
    d.exercises.forEach((e, i) => { streakMap[exerciseKey(e)] = streaks[i]; });
    setTargetStreaks(streakMap);

    return d;
  }, [cycleWorkoutId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const handleChanged = useCallback(async () => {
    await load();
    await refreshCycle();
  }, [load, refreshCycle]);

  const resolveCompletedAt = useCallback<ResolveCompletedAt>(async (set) => {
    const now = new Date();
    const settings = await getSettings();
    // Fallback pace when the workout has no consecutive sets to measure: one rest period
    // plus roughly a minute for the set itself.
    const fallbackGapMs = (settings.rest_timer_seconds + 60) * 1000;
    const suggestion = suggestCompletionTime(set, detail?.exercises ?? [], fallbackGapMs, now);
    if (!suggestion) return { at: now.toISOString(), backdated: false };

    const choice = await chooseSetTime(suggestion);
    if (choice === null) return null;
    return choice === 'original'
      ? { at: suggestion.at, backdated: true }
      : { at: new Date().toISOString(), backdated: false };
  }, [detail, chooseSetTime]);

  if (loading || !detail) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SetTimeChoiceToast />
      <ScrollView contentContainerStyle={styles.content}>
        {detail.exercises.length === 0 ? (
          <Text style={styles.empty}>This workout has no exercises. Add some in the Program tab.</Text>
        ) : (
          detail.exercises.map((ex) => (
            <ExerciseCard
              key={exerciseKey(ex)}
              exercise={ex}
              lastSets={lastSets[exerciseKey(ex)] ?? []}
              targetStreak={targetStreaks[exerciseKey(ex)] ?? null}
              onChanged={handleChanged}
              resolveCompletedAt={resolveCompletedAt}
            />
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardDone: {
    backgroundColor: '#F0FAF4',
    borderColor: '#2D6A4F',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 4,
  },
  cardHeaderText: { flex: 1 },
  exerciseName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  exerciseMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  streakHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  streakHintText: { fontSize: 12, color: '#2D6A4F' },
  exerciseNote: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 2 },
  headerIconBtn: { padding: 6 },
  noteInput: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#1A1A1A',
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  setNumber: { width: 18, fontSize: 13, color: '#999', textAlign: 'center' },
  setInput: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  setCheckbox: { paddingLeft: 4 },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  addSetText: { color: '#2D6A4F', fontSize: 13, fontWeight: '600' },
});
