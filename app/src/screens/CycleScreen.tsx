import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { markWorkoutComplete } from '../db/cycles';
import { CycleStackParamList } from '../navigation/RootNavigator';
import { CycleWorkoutSummary } from '../services/api';
import { showAlert } from '../utils/alert';

export default function CycleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CycleStackParamList>>();
  const { activeCycle, refreshCycle, startNewCycle } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [startingNew, setStartingNew] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await refreshCycle().finally(() => setRefreshing(false));
  }

  const toggleComplete = useCallback(async (workout: CycleWorkoutSummary) => {
    await markWorkoutComplete(workout.id, !workout.is_complete);
    await refreshCycle();
  }, [refreshCycle]);

  function handleNewCycle() {
    const workouts = activeCycle?.workouts ?? [];
    const allDone = workouts.length > 0 && workouts.every((w) => w.is_complete);

    const start = async () => {
      setStartingNew(true);
      try {
        await startNewCycle();
      } finally {
        setStartingNew(false);
      }
    };

    if (allDone || workouts.length === 0) {
      start();
      return;
    }

    showAlert('Start a new cycle?', 'Some workouts in this cycle are still unfinished. Starting a new cycle archives it as-is.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start New Cycle', style: 'destructive', onPress: start },
    ]);
  }

  if (!activeCycle) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  const workouts = activeCycle.workouts;

  return (
    <View style={styles.container}>
      <FlatList
        data={workouts}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyText}>Set up your program in the Program tab, then start a new cycle.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity onPress={() => toggleComplete(item)} style={styles.checkbox}>
              <Ionicons
                name={item.is_complete ? 'checkbox' : 'square-outline'}
                size={26}
                color={item.is_complete ? '#2D6A4F' : '#ccc'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rowBody}
              onPress={() => navigation.navigate('Workout', { cycleWorkoutId: item.id, label: item.label })}
            >
              <Text style={[styles.label, item.is_complete && styles.labelDone]}>{item.label}</Text>
              {!!item.exercise_preview && (
                <Text style={styles.preview} numberOfLines={1}>{item.exercise_preview}</Text>
              )}
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </View>
        )}
      />

      <TouchableOpacity style={styles.newCycleBtn} onPress={handleNewCycle} disabled={startingNew}>
        {startingNew ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.newCycleText}>New Cycle</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  list: { padding: 16, paddingBottom: 8 },
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
  checkbox: { marginRight: 12 },
  rowBody: { flex: 1 },
  label: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  labelDone: { color: '#999', textDecorationLine: 'line-through' },
  preview: { fontSize: 13, color: '#999', marginTop: 2 },
  newCycleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2D6A4F',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
  },
  newCycleText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
