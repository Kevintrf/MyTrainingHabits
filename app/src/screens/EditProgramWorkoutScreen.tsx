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
import { showAlert } from '../utils/alert';
import { ProgramStackParamList } from '../navigation/RootNavigator';
import {
  getProgramWorkout,
  createProgramWorkout,
  updateProgramWorkout,
  deleteProgramWorkout,
  addExerciseToProgramWorkout,
  removeExerciseFromProgramWorkout,
  updateProgramExercise,
  reorderProgramExercises,
} from '../db/program';
import { searchExercises } from '../db/exercises';
import { ProgramWorkout, ProgramExercise, Exercise } from '../services/api';

export default function EditProgramWorkoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProgramStackParamList>>();
  const route = useRoute<RouteProp<ProgramStackParamList, 'EditProgramWorkout'>>();

  const [workoutId, setWorkoutId] = useState<number | undefined>(route.params.workoutId);
  const [workout, setWorkout] = useState<ProgramWorkout | null>(null);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(!!route.params.workoutId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Exercise[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (id: number) => {
    const w = await getProgramWorkout(id);
    setWorkout(w);
    setLabel(w.label);
  }, []);

  useEffect(() => {
    if (workoutId) load(workoutId).finally(() => setLoading(false));
  }, [workoutId, load]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    searchDebounceRef.current = setTimeout(async () => {
      setResults(await searchExercises(query));
    }, 300);
  }, [query]);

  async function handleCreate() {
    if (!label.trim()) return showAlert('Enter a name for this workout');
    const created = await createProgramWorkout({ label: label.trim() });
    setWorkoutId(created.id);
    navigation.setParams({ workoutId: created.id });
  }

  function handleLabelChange(v: string) {
    setLabel(v);
    if (!workoutId) return;
    if (labelDebounceRef.current) clearTimeout(labelDebounceRef.current);
    labelDebounceRef.current = setTimeout(() => { updateProgramWorkout(workoutId, { label: v }); }, 600);
  }

  async function handleAddExercise(exercise: Exercise) {
    if (!workoutId) return;
    await addExerciseToProgramWorkout(workoutId, { exercise_id: exercise.id });
    setQuery('');
    setResults([]);
    await load(workoutId);
  }

  async function handleRemoveExercise(programExerciseId: number) {
    if (!workoutId) return;
    await removeExerciseFromProgramWorkout(programExerciseId);
    await load(workoutId);
  }

  function handleSetsChange(pe: ProgramExercise, sets: string) {
    const n = parseInt(sets, 10);
    if (isNaN(n) || n <= 0) return;
    updateProgramExercise(pe.id, { default_sets: n });
  }

  function handleRepsChange(pe: ProgramExercise, reps: string) {
    const n = parseInt(reps, 10);
    updateProgramExercise(pe.id, { default_reps: isNaN(n) ? null : n });
  }

  async function handleMove(index: number, dir: -1 | 1) {
    if (!workout || !workoutId) return;
    const ids = workout.exercises.map((e) => e.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderProgramExercises(ids);
    await load(workoutId);
  }

  function handleDeleteWorkout() {
    if (!workoutId) return;
    showAlert('Delete workout?', `This removes "${label}" from your program. Existing cycles keep their history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProgramWorkout(workoutId);
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>WORKOUT NAME</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={handleLabelChange}
          placeholder="e.g. Push Day"
          placeholderTextColor="#bbb"
          autoComplete="off" textContentType="none"
        />

        {!workoutId && (
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Text style={styles.createBtnText}>Create Workout</Text>
          </TouchableOpacity>
        )}

        {workoutId && workout && (
          <>
            <Text style={styles.sectionHeading}>EXERCISES</Text>
            {workout.exercises.length === 0 && (
              <Text style={styles.empty}>No exercises yet — add some below.</Text>
            )}
            {workout.exercises.map((pe, i) => (
              <View key={pe.id} style={styles.exerciseRow}>
                <View style={styles.exerciseRowTop}>
                  <Text style={styles.exerciseName}>{pe.exercise_name}</Text>
                  <TouchableOpacity onPress={() => handleRemoveExercise(pe.id)}>
                    <Ionicons name="close-circle" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
                <View style={styles.exerciseRowBottom}>
                  <View style={styles.moveBtns}>
                    <TouchableOpacity onPress={() => handleMove(i, -1)} disabled={i === 0}>
                      <Ionicons name="chevron-up" size={18} color={i === 0 ? '#ddd' : '#2D6A4F'} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleMove(i, 1)} disabled={i === workout.exercises.length - 1}>
                      <Ionicons name="chevron-down" size={18} color={i === workout.exercises.length - 1 ? '#ddd' : '#2D6A4F'} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.smallLabel}>Sets</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="number-pad"
                    defaultValue={String(pe.default_sets)}
                    onChangeText={(v) => handleSetsChange(pe, v)}
                    autoComplete="off" textContentType="none" importantForAutofill="no"
                  />
                  <Text style={styles.smallLabel}>Reps</Text>
                  <TextInput
                    style={styles.smallInput}
                    keyboardType="number-pad"
                    defaultValue={pe.default_reps != null ? String(pe.default_reps) : ''}
                    placeholder="—"
                    placeholderTextColor="#bbb"
                    onChangeText={(v) => handleRepsChange(pe, v)}
                    autoComplete="off" textContentType="none" importantForAutofill="no"
                  />
                </View>
              </View>
            ))}

            <Text style={styles.sectionHeading}>ADD EXERCISE</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search exercises..."
              placeholderTextColor="#bbb"
              autoComplete="off" textContentType="none"
            />
            {results.map((ex) => (
              <TouchableOpacity key={ex.id} style={styles.resultRow} onPress={() => handleAddExercise(ex)}>
                <Text style={styles.resultName}>{ex.name}</Text>
                <Ionicons name="add-circle-outline" size={20} color="#2D6A4F" />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteWorkout}>
              <Text style={styles.deleteBtnText}>Delete Workout</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 20, paddingBottom: 40 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  empty: { fontSize: 14, color: '#999', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  createBtn: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  exerciseRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  exerciseRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  exerciseRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  moveBtns: { flexDirection: 'row', gap: 4, marginRight: 8 },
  smallLabel: { fontSize: 12, color: '#999' },
  smallInput: {
    width: 48,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  resultName: { fontSize: 14, color: '#1A1A1A' },
  deleteBtn: { alignItems: 'center', marginTop: 28 },
  deleteBtnText: { color: '#e74c3c', fontWeight: '600', fontSize: 14 },
});
