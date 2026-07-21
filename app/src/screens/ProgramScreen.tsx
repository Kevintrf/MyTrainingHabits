import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { getProgram } from '../db/program';
import { ProgramStackParamList } from '../navigation/RootNavigator';
import { ProgramWorkout } from '../services/api';

export default function ProgramScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProgramStackParamList>>();
  const [workouts, setWorkouts] = useState<ProgramWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getProgram();
    setWorkouts(data);
  }, []);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load().finally(() => setRefreshing(false));
  }

  if (loading) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  return (
    <FlatList
      style={styles.container}
      data={workouts}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workouts in your program</Text>
          <Text style={styles.emptyText}>Tap + to add your first workout (e.g. "Push Day").</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('EditProgramWorkout', { workoutId: item.id })}
        >
          <View style={styles.rowBody}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.meta}>{item.exercises.length} exercise{item.exercises.length === 1 ? '' : 's'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  list: { padding: 16 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowBody: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  meta: { fontSize: 13, color: '#999', marginTop: 2 },
});
