import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, SectionList, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { getExerciseHistory } from '../db/sets';
import { ExercisesStackParamList } from '../navigation/RootNavigator';
import { ExerciseHistoryEntry } from '../services/api';

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayHeading(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface DaySection {
  title: string;
  data: ExerciseHistoryEntry[];
}

// Groups already-DESC-ordered history entries by local calendar day, preserving order —
// most recent day first, most recent set within a day first.
function groupByDay(entries: ExerciseHistoryEntry[]): DaySection[] {
  const grouped = new Map<string, ExerciseHistoryEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const key = localDateKey(entry.completed_at);
    if (!grouped.has(key)) {
      order.push(key);
      grouped.set(key, []);
    }
    grouped.get(key)!.push(entry);
  }
  return order.map((key) => ({ title: formatDayHeading(key), data: grouped.get(key)! }));
}

export default function ExerciseHistoryScreen() {
  const route = useRoute<RouteProp<ExercisesStackParamList, 'ExerciseHistory'>>();
  const { exerciseId } = route.params;

  const [sections, setSections] = useState<DaySection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const entries = await getExerciseHistory(exerciseId);
    setSections(groupByDay(entries));
  }, [exerciseId]);

  useFocusEffect(useCallback(() => { load().finally(() => setLoading(false)); }, [load]));

  if (loading) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled={false}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptyText}>Completed sets for this exercise will show up here.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.dayHeading}>{section.title}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.rowValue}>
            {item.reps != null ? `${item.reps} reps` : '—'}
            {item.weight_kg != null ? `  ×  ${item.weight_kg} kg` : ''}
          </Text>
          <Text style={styles.rowTime}>{formatTime(item.completed_at)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center' },
  dayHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  rowValue: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowTime: { fontSize: 12, color: '#999' },
});
