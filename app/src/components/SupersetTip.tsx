import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CycleWorkoutExercise } from '../services/api';
import { suggestSupersets } from '../utils/supersets';

// Collapsible tip at the top of a workout: which of the day's exercises go well together as
// supersets (see utils/supersets.ts for how they're picked). Hidden when nothing pairs up.
export default function SupersetTip({ exercises }: { exercises: CycleWorkoutExercise[] }) {
  const [expanded, setExpanded] = useState(false);

  // Cheap for a day's handful of exercises, so simply redone whenever the workout reloads.
  const pairs = useMemo(
    () => suggestSupersets(exercises.map((e) => ({
      name: e.exercise_name,
      sourceSlug: e.source_slug,
      isCardio: e.exercise_type === 'CARDIO',
    }))),
    [exercises],
  );

  if (pairs.length === 0) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} activeOpacity={0.6} onPress={() => setExpanded((v) => !v)}>
        <Ionicons name="bulb-outline" size={18} color="#2D6A4F" />
        <Text style={styles.title}>Superset ideas</Text>
        <Text style={styles.count}>{pairs.length} {pairs.length === 1 ? 'pair' : 'pairs'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {pairs.map((p) => (
            <View key={`${p.first}-${p.second}`} style={styles.pair}>
              <Ionicons
                name={p.kind === 'opposing' ? 'swap-horizontal' : 'git-compare-outline'}
                size={16}
                color={p.kind === 'opposing' ? '#2D6A4F' : '#999'}
                style={styles.pairIcon}
              />
              <View style={styles.pairText}>
                <Text style={styles.pairNames}>
                  {exercises[p.first].exercise_name} + {exercises[p.second].exercise_name}
                </Text>
                <Text style={styles.pairReason}>{p.reason}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.howTo}>
            Do a set of the first, go straight into a set of the second, then rest as usual. Pairing
            opposing or unrelated muscles keeps your reps up and cuts the workout by about a third.
            Pairing two exercises for the same muscle costs reps, and a superset is harder on your
            breathing, so drop it on heavy days.
          </Text>
          <Text style={styles.source}>Zhang et al., Sports Medicine 2025: meta-analysis of 19 studies</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D8EDE0',
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: '#2D6A4F' },
  count: { fontSize: 12, color: '#999' },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  pairIcon: { marginTop: 1 },
  pairText: { flex: 1 },
  pairNames: { fontSize: 14, color: '#1A1A1A' },
  pairReason: { fontSize: 12, color: '#999', marginTop: 1 },
  howTo: { fontSize: 12, color: '#666', marginTop: 12, lineHeight: 17 },
  source: { fontSize: 11, color: '#bbb', marginTop: 6, fontStyle: 'italic' },
});
