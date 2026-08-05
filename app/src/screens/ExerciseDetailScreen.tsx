import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { deleteExercise, getExercise, updateExerciseNotes } from '../db/exercises';
import { ExercisesStackParamList } from '../navigation/RootNavigator';
import { Exercise } from '../services/api';
import { EXERCISE_IMAGES } from '../assets/exerciseImages';
import { showAlert } from '../utils/alert';

const IMAGE_WIDTH = Dimensions.get('window').width - 40;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ExerciseDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();
  const route = useRoute<RouteProp<ExercisesStackParamList, 'ExerciseDetail'>>();
  const { exerciseId } = route.params;

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refetches on every focus (not just first mount) so returning from editing the exercise
  // shows the updated name/muscle group/type without needing a manual refresh.
  useFocusEffect(useCallback(() => {
    getExercise(exerciseId).then((ex) => {
      setExercise(ex);
      setNotes(ex.notes ?? '');
      setLoading(false);
      // The header title otherwise stays frozen at whatever name was passed in the route
      // params at navigation time — update it directly so a rename shows up immediately.
      navigation.setOptions({ title: ex.name });
    });
  }, [exerciseId, navigation]));

  function handleNotesChange(v: string) {
    setNotes(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { updateExerciseNotes(exerciseId, v); }, 600);
  }

  function handleDelete() {
    if (!exercise) return;
    showAlert('Delete exercise?', `"${exercise.name}" will be removed from any programs using it. Past logged history keeps the exercise name and stays intact.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExercise(exerciseId);
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading || !exercise) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  const isCustom = exercise.source === 'USER';

  const images = exercise.source_slug ? EXERCISE_IMAGES[exercise.source_slug] ?? [] : [];
  const steps = exercise.instructions ? exercise.instructions.split('\n').filter(Boolean) : [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{exercise.name}</Text>
            {isCustom && (
              <TouchableOpacity
                style={styles.editIconBtn}
                onPress={() => navigation.navigate('CreateExercise', { editingExerciseId: exerciseId })}
              >
                <Ionicons name="pencil" size={18} color="#2D6A4F" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.tags}>
            <Text style={styles.tag}>{exercise.muscle_group}</Text>
            <Text style={styles.tag}>{exercise.type}</Text>
            {!!exercise.equipment && <Text style={styles.tag}>{titleCase(exercise.equipment)}</Text>}
            {!!exercise.level && <Text style={styles.tag}>{titleCase(exercise.level)}</Text>}
          </View>
        </View>

        <TouchableOpacity
          style={styles.historyRow}
          onPress={() => navigation.navigate('ExerciseHistory', { exerciseId, exerciseName: exercise.name })}
        >
          <Ionicons name="time-outline" size={20} color="#2D6A4F" />
          <Text style={styles.historyRowText}>View history</Text>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>

        <Text style={styles.sectionHeading}>NOTES</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={handleNotesChange}
            placeholder="Form cues, personal reminders, anything you want to remember..."
            placeholderTextColor="#bbb"
            multiline
            textAlignVertical="top"
            autoComplete="off" textContentType="none"
          />
        </View>

        <Text style={styles.sectionHeading}>IMAGES</Text>
        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
            {images.map((src, i) => (
              <Image key={i} source={src} style={styles.image} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.card, styles.placeholderCard]}>
            <Ionicons name="image-outline" size={28} color="#ccc" />
            <Text style={styles.placeholderText}>No images available</Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>GUIDE</Text>
        {steps.length > 0 ? (
          <View style={styles.card}>
            {steps.map((step, i) => (
              <View key={i} style={[styles.stepRow, i > 0 && styles.stepRowSpacing]}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.placeholderCard]}>
            <Ionicons name="book-outline" size={28} color="#ccc" />
            <Text style={styles.placeholderText}>No guide available</Text>
          </View>
        )}

        {isCustom && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete Exercise</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  editIconBtn: { padding: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  tag: { fontSize: 12, color: '#999', fontWeight: '600', letterSpacing: 0.5 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  notesInput: {
    minHeight: 100,
    fontSize: 15,
    color: '#1A1A1A',
  },
  imagesRow: { flexGrow: 0 },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH * (2 / 3),
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: '#eee',
  },
  placeholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  placeholderText: { fontSize: 13, color: '#999' },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepRowSpacing: { marginTop: 12 },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F0FAF4',
    color: '#2D6A4F',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  stepText: { flex: 1, fontSize: 14, color: '#1A1A1A', lineHeight: 20 },
  deleteBtn: { alignItems: 'center', marginTop: 28 },
  deleteBtnText: { color: '#e74c3c', fontWeight: '600', fontSize: 14 },
});
