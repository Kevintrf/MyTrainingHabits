import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { searchExercises } from '../db/exercises';
import { Exercise, MuscleGroup } from '../services/api';
import { ExercisesStackParamList } from '../navigation/RootNavigator';

const MUSCLE_GROUPS: MuscleGroup[] = ['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'CARDIO', 'OTHER'];

export default function ExercisesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ExercisesStackParamList>>();
  const [query, setQuery] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await searchExercises(query, muscleGroup ?? undefined);
    setExercises(data);
  }, [query, muscleGroup]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercises..."
        placeholderTextColor="#bbb"
        autoComplete="off" textContentType="none"
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsContent}
        data={[null, ...MUSCLE_GROUPS]}
        keyExtractor={(item) => item ?? 'ALL'}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, muscleGroup === item && styles.chipActive]}
            onPress={() => setMuscleGroup(item)}
          >
            <Text style={[styles.chipText, muscleGroup === item && styles.chipTextActive]} numberOfLines={1}>
              {item ?? 'ALL'}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#2D6A4F" />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No exercises found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id, exerciseName: item.name })}
            >
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.tags}>
                  <Text style={styles.tag}>{item.muscle_group}</Text>
                  <Text style={styles.tag}>{item.type}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    margin: 16,
    marginBottom: 8,
  },
  chipsRow: { flexGrow: 0, minHeight: 44, marginBottom: 8 },
  chipsContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#fff',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#2D6A4F', borderColor: '#2D6A4F' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  loader: { flex: 1, marginTop: 40 },
  list: { padding: 16, paddingTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowBody: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  tags: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tag: { fontSize: 11, color: '#999', fontWeight: '600', letterSpacing: 0.5 },
});
