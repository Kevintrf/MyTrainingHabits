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
import { CycleStackParamList } from '../navigation/RootNavigator';
import { getCycleWorkoutDetail, markWorkoutComplete } from '../db/cycles';
import { addSet, getLastSetsForExercise, markSetComplete, updateSet } from '../db/sets';
import { updateProgramExercise } from '../db/program';
import { CycleSet, CycleWorkoutDetail, CycleWorkoutExercise } from '../services/api';

// Stable per-exercise key within a workout — falls back to name when the source
// exercise has been deleted (exercise_id null) so grouping doesn't collide.
function exerciseKey(exercise: CycleWorkoutExercise): string {
  return exercise.exercise_id !== null ? String(exercise.exercise_id) : `deleted:${exercise.exercise_name}`;
}

function SetRow({ set, lastSet, defaultReps, onToggled }: {
  set: CycleSet;
  lastSet?: CycleSet;
  // The program's target rep count for this exercise — shown as a grey placeholder
  // suggestion, not preloaded as a real value (see below).
  defaultReps: number | null;
  onToggled: () => void;
}) {
  // Seeded only from the set's own saved value, never from a suggestion — a suggestion
  // (the program's default reps, or the weight last used for this exercise) is shown via
  // `placeholder` instead, so it reads as grey/suggested rather than indistinguishable from
  // something actually entered.
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : '');
  const [weight, setWeight] = useState(set.weight_kg != null ? String(set.weight_kg) : '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { startRestTimer } = useApp();

  const repsPlaceholder = defaultReps != null ? String(defaultReps) : 'reps';
  const weightPlaceholder = lastSet?.weight_kg != null ? String(lastSet.weight_kg) : 'kg';

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const nowComplete = !set.is_complete;

    // Finishing a set that was left blank takes on the shown grey suggestion rather than
    // saving nothing — un-marking a set never does this, only completing one, and a field
    // the user already typed something into is left exactly as entered.
    const finalReps = nowComplete && reps === '' && defaultReps != null ? String(defaultReps) : reps;
    const finalWeight = nowComplete && weight === '' && lastSet?.weight_kg != null ? String(lastSet.weight_kg) : weight;
    if (finalReps !== reps) setReps(finalReps);
    if (finalWeight !== weight) setWeight(finalWeight);

    await updateSet(set.id, parsedPatch(finalReps, finalWeight));
    await markSetComplete(set.id, nowComplete);
    // Only starts the rest timer when finishing a set, not when un-marking one.
    if (nowComplete) startRestTimer();
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

function ExerciseCard({ exercise, lastSets, onChanged }: {
  exercise: CycleWorkoutExercise;
  lastSets: CycleSet[];
  onChanged: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<CycleStackParamList>>();
  const [expanded, setExpanded] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(exercise.program_exercise_notes ?? '');
  const allDone = exercise.sets.length > 0 && exercise.sets.every((s) => s.is_complete);
  const exerciseId = exercise.exercise_id;
  const programExerciseId = exercise.program_exercise_id;

  async function handleAddSet() {
    if (exerciseId === null) return;
    await addSet(exercise.sets[0].cycle_workout_id, exerciseId);
    onChanged();
  }

  function handleStartEditNote() {
    if (programExerciseId === null) return;
    setNoteDraft(exercise.program_exercise_notes ?? '');
    setEditingNote(true);
  }

  async function handleCommitNote() {
    setEditingNote(false);
    if (programExerciseId === null) return;
    await updateProgramExercise(programExerciseId, { notes: noteDraft.trim() || null });
    onChanged();
  }

  return (
    <View style={[styles.card, allDone && styles.cardDone]}>
      <TouchableOpacity
        style={styles.cardHeader}
        activeOpacity={0.6}
        onPress={() => setExpanded((v) => !v)}
        onLongPress={programExerciseId !== null ? handleStartEditNote : undefined}
        delayLongPress={350}
      >
        <View style={styles.cardHeaderText}>
          <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
          <Text style={styles.exerciseMeta}>
            {exercise.sets.length} sets{exerciseId === null ? ' · removed from library' : ''}
          </Text>
          {!!exercise.program_exercise_notes && !editingNote && (
            <Text style={styles.exerciseNote} numberOfLines={1}>{exercise.program_exercise_notes}</Text>
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
              lastSet={lastSets[i]}
              defaultReps={exercise.program_exercise_default_reps}
              onToggled={onChanged}
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

  const [detail, setDetail] = useState<CycleWorkoutDetail | null>(null);
  const [lastSets, setLastSets] = useState<Record<string, CycleSet[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await getCycleWorkoutDetail(cycleWorkoutId);
    setDetail(d);

    // Deleted exercises (exercise_id null) have no "current" exercise to look up
    // progression for — and can't be re-added anyway, so skip the lookup.
    const entries = await Promise.all(
      d.exercises.map((e) => (e.exercise_id !== null ? getLastSetsForExercise(e.exercise_id) : Promise.resolve([]))),
    );
    const map: Record<string, CycleSet[]> = {};
    d.exercises.forEach((e, i) => { map[exerciseKey(e)] = entries[i]; });
    setLastSets(map);

    const allComplete = d.exercises.length > 0 && d.exercises.every((e) => e.sets.every((s) => s.is_complete));
    if (allComplete !== d.is_complete) {
      await markWorkoutComplete(cycleWorkoutId, allComplete);
    }

    return d;
  }, [cycleWorkoutId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const handleChanged = useCallback(async () => {
    await load();
    await refreshCycle();
  }, [load, refreshCycle]);

  if (loading || !detail) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        {detail.exercises.length === 0 ? (
          <Text style={styles.empty}>This workout has no exercises. Add some in the Program tab.</Text>
        ) : (
          detail.exercises.map((ex) => (
            <ExerciseCard
              key={exerciseKey(ex)}
              exercise={ex}
              lastSets={lastSets[exerciseKey(ex)] ?? []}
              onChanged={handleChanged}
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
