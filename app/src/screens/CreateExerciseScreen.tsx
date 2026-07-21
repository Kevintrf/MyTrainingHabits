import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { showAlert } from '../utils/alert';
import { createExercise } from '../db/exercises';
import { ExercisesStackParamList } from '../navigation/RootNavigator';
import { MuscleGroup, ExerciseType } from '../services/api';

const MUSCLE_GROUPS: MuscleGroup[] = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'CARDIO', 'OTHER'];
const EXERCISE_TYPES: { value: ExerciseType; label: string }[] = [
  { value: 'STRENGTH', label: 'Strength' },
  { value: 'BODYWEIGHT', label: 'Bodyweight' },
  { value: 'CARDIO', label: 'Cardio' },
];

export default function CreateExerciseScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();
  const route = useRoute<RouteProp<ExercisesStackParamList, 'CreateExercise'>>();

  const [name, setName] = useState(route.params?.initialName ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('OTHER');
  const [type, setType] = useState<ExerciseType>('STRENGTH');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return showAlert('Enter an exercise name');
    setSaving(true);
    try {
      await createExercise({ name: name.trim(), muscle_group: muscleGroup, type });
      navigation.goBack();
    } catch (e) {
      showAlert('Could not save', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>NAME</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Incline Dumbbell Press"
          placeholderTextColor="#bbb"
          autoComplete="off" textContentType="none"
        />

        <Text style={styles.sectionHeading}>MUSCLE GROUP</Text>
        <View style={styles.chipsWrap}>
          {MUSCLE_GROUPS.map((mg) => (
            <TouchableOpacity
              key={mg}
              style={[styles.chip, muscleGroup === mg && styles.chipActive]}
              onPress={() => setMuscleGroup(mg)}
            >
              <Text style={[styles.chipText, muscleGroup === mg && styles.chipTextActive]}>{mg}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionHeading}>TYPE</Text>
        <View style={styles.chipsWrap}>
          {EXERCISE_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.chip, type === t.value && styles.chipActive]}
              onPress={() => setType(t.value)}
            >
              <Text style={[styles.chipText, type === t.value && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Exercise'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 20, paddingBottom: 40 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#2D6A4F', borderColor: '#2D6A4F' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#2D6A4F',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
