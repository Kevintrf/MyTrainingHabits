import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { CycleStackParamList } from '../navigation/RootNavigator';
import { getCycleWorkoutDetail } from '../db/cycles';
import { getExercise } from '../db/exercises';
import { CycleWorkoutDetail, Exercise } from '../services/api';
import { MUSCLE_INFO } from '../assets/muscles';
import MuscleMap, { MUSCLE_COLORS } from '../components/MuscleMap';
import { BodyRegion, REGION_NAMES, buildDayOverview } from '../utils/dayOverview';

// Inside a card (20px screen padding + 14px card padding each side), capped for tablets.
const MUSCLE_MAP_WIDTH = Math.min(Dimensions.get('window').width - 68, 360);

const REGION_COLORS: Record<BodyRegion, string> = {
  upper: '#2D6A4F',
  core: '#52B788',
  lower: '#B7E4C7',
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The (i) page of a workout day: what the day's exercises are and which muscles they work, how
// many sets each muscle gets, and which muscles the day leaves out. Everything is derived from the
// day's exercises and the library's muscle tags (utils/dayOverview.ts), so it follows any change
// to the day.
export default function WorkoutInfoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CycleStackParamList>>();
  const route = useRoute<RouteProp<CycleStackParamList, 'WorkoutInfo'>>();
  const { cycleWorkoutId } = route.params;

  const [detail, setDetail] = useState<CycleWorkoutDetail | null>(null);
  // Library details (equipment, level) per exercise id; missing for exercises removed from it.
  const [library, setLibrary] = useState<Record<number, Exercise>>({});

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const d = await getCycleWorkoutDetail(cycleWorkoutId);
      const found = await Promise.all(
        d.exercises.map((e) => (e.exercise_id !== null ? getExercise(e.exercise_id).catch(() => null) : null)),
      );
      if (cancelled) return;
      const map: Record<number, Exercise> = {};
      for (const ex of found) if (ex) map[ex.id] = ex;
      setLibrary(map);
      setDetail(d);
    })();
    return () => { cancelled = true; };
  }, [cycleWorkoutId]));

  const overview = useMemo(() => (detail ? buildDayOverview(detail.exercises.map((e) => ({
    sourceSlug: e.source_slug,
    setCount: e.sets.length,
    doneSetCount: e.sets.filter((s) => s.is_complete).length,
  }))) : null), [detail]);

  if (!detail || !overview) return <ActivityIndicator style={styles.loader} color="#2D6A4F" />;

  if (detail.exercises.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>This workout has no exercises. Add some in the Program tab.</Text>
      </View>
    );
  }

  const exercises = detail.exercises;
  const primaryKeys = overview.muscles.filter((m) => m.directSets > 0).map((m) => m.key);
  const secondaryKeys = overview.muscles.filter((m) => m.directSets === 0).map((m) => m.key);
  const maxSets = Math.max(1, ...overview.muscles.map((m) => m.directSets + m.indirectSets));
  const namesOf = (indexes: number[]) => indexes.map((i) => exercises[i].exercise_name).join(', ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* --- Summary --- */}
      <View style={styles.card}>
        <View style={styles.statsRow}>
          <Stat value={overview.exerciseCount} label={overview.exerciseCount === 1 ? 'exercise' : 'exercises'} />
          <Stat value={overview.setCount} label={overview.setCount === 1 ? 'set' : 'sets'} />
          <Stat value={overview.muscles.length} label={overview.muscles.length === 1 ? 'muscle' : 'muscles'} />
        </View>
        {overview.doneSetCount > 0 && (
          <Text style={styles.progress}>
            {overview.doneSetCount === overview.setCount
              ? 'All sets done'
              : `${overview.doneSetCount} of ${plural(overview.setCount, 'set')} done`}
          </Text>
        )}
        {overview.regionShare.length > 0 && (
          <View style={styles.regionBlock}>
            <Text style={styles.subheading}>FOCUS</Text>
            <View style={styles.regionBar}>
              {overview.regionShare.map((r) => (
                <View key={r.region} style={{ flex: r.share, backgroundColor: REGION_COLORS[r.region] }} />
              ))}
            </View>
            <View style={styles.regionLegend}>
              {overview.regionShare.map((r) => (
                <View key={r.region} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: REGION_COLORS[r.region] }]} />
                  <Text style={styles.legendText}>{REGION_NAMES[r.region]} {Math.round(r.share * 100)}%</Text>
                </View>
              ))}
            </View>
            <Text style={styles.footnote}>Share of the day's sets, by where each exercise's main muscles are.</Text>
          </View>
        )}
      </View>

      {/* --- Body map + per-muscle volume --- */}
      {overview.muscles.length > 0 && (
        <>
          <Text style={styles.sectionHeading}>MUSCLES WORKED</Text>
          <View style={styles.card}>
            <MuscleMap primary={primaryKeys} secondary={secondaryKeys} width={MUSCLE_MAP_WIDTH} />
            <Text style={[styles.footnote, styles.centered]}>
              Dark: a main muscle in at least one exercise. Light: only helps.
            </Text>
          </View>

          <Text style={styles.sectionHeading}>SETS PER MUSCLE</Text>
          <View style={styles.card}>
            <Text style={styles.footnote}>
              Direct sets have the muscle as a main mover; indirect sets use it as a helper.
            </Text>
            {overview.muscles.map((m, i) => (
              <View key={m.key} style={[styles.muscleRow, i === 0 && styles.muscleRowFirst]}>
                <View style={styles.muscleHeader}>
                  <Text style={styles.muscleName}>{m.name}</Text>
                  <Text style={styles.muscleSets}>
                    {m.directSets > 0 ? `${m.directSets} direct` : ''}
                    {m.directSets > 0 && m.indirectSets > 0 ? ' · ' : ''}
                    {m.indirectSets > 0 ? `${m.indirectSets} indirect` : ''}
                  </Text>
                </View>
                <View style={styles.volumeTrack}>
                  <View style={{ flex: m.directSets / maxSets, backgroundColor: MUSCLE_COLORS.primary }} />
                  <View style={{ flex: m.indirectSets / maxSets, backgroundColor: MUSCLE_COLORS.secondary }} />
                  <View style={{ flex: 1 - (m.directSets + m.indirectSets) / maxSets }} />
                </View>
                <Text style={styles.muscleAnatomy}>{m.anatomy}</Text>
                <Text style={styles.muscleAction}>{m.action}</Text>
                {m.primaryIn.length > 0 && (
                  <Text style={styles.muscleFrom}>
                    <Text style={styles.muscleFromLabel}>Main muscle in: </Text>{namesOf(m.primaryIn)}
                  </Text>
                )}
                {m.secondaryIn.length > 0 && (
                  <Text style={styles.muscleFrom}>
                    <Text style={styles.muscleFromLabel}>Helps in: </Text>{namesOf(m.secondaryIn)}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {overview.untrained.length > 0 && (
            <>
              <Text style={styles.sectionHeading}>NOT WORKED TODAY</Text>
              <View style={[styles.card, styles.chips]}>
                {overview.untrained.map((k) => (
                  <Text key={k} style={styles.chip}>{MUSCLE_INFO[k].name}</Text>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {/* --- Exercises --- */}
      <Text style={styles.sectionHeading}>EXERCISES</Text>
      {overview.exercises.map((ov) => {
        const e = exercises[ov.index];
        const lib = e.exercise_id !== null ? library[e.exercise_id] : undefined;
        const primary = ov.muscles.filter((m) => m.role === 'primary').map((m) => m.name);
        const secondary = ov.muscles.filter((m) => m.role === 'secondary').map((m) => m.name);
        const meta = [
          e.program_exercise_default_reps != null
            ? `${plural(e.sets.length, 'set')} × ${e.program_exercise_default_reps} reps`
            : plural(e.sets.length, 'set'),
          lib?.equipment ? titleCase(lib.equipment) : null,
          lib?.level ? titleCase(lib.level) : null,
        ].filter(Boolean).join(' · ');
        const exerciseId = e.exercise_id;

        return (
          <TouchableOpacity
            key={`${exerciseId ?? 'deleted'}:${e.exercise_name}`}
            style={[styles.card, styles.exerciseCard]}
            activeOpacity={0.6}
            disabled={exerciseId === null}
            onPress={() => exerciseId !== null && navigation.navigate('ExerciseDetail', { exerciseId, exerciseName: e.exercise_name })}
          >
            <View style={styles.exerciseText}>
              <Text style={styles.exerciseName}>
                <Text style={styles.exerciseNumber}>{ov.index + 1}. </Text>{e.exercise_name}
              </Text>
              <Text style={styles.exerciseMeta}>{meta}</Text>
              {primary.length > 0 ? (
                <>
                  <MuscleLine color={MUSCLE_COLORS.primary} label="Main" names={primary} />
                  {secondary.length > 0 && <MuscleLine color={MUSCLE_COLORS.secondary} label="Helpers" names={secondary} />}
                </>
              ) : (
                <Text style={styles.noData}>
                  {exerciseId === null
                    ? 'Removed from the library, so no muscle info'
                    : lib?.source === 'USER' ? 'Custom exercise, so no muscle info' : 'No muscle info'}
                </Text>
              )}
            </View>
            {exerciseId !== null && <Ionicons name="chevron-forward" size={18} color="#ccc" />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MuscleLine({ color, label, names }: { color: string; label: string; names: string[] }) {
  return (
    <View style={styles.muscleLine}>
      <View style={[styles.swatch, styles.muscleLineSwatch, { backgroundColor: color }]} />
      <Text style={styles.muscleLineText}>
        <Text style={styles.muscleFromLabel}>{label}: </Text>{names.join(', ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, marginTop: 100 },
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 20, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 15 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  subheading: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statsRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#2D6A4F' },
  statLabel: { fontSize: 12, color: '#999', marginTop: 2 },
  progress: { textAlign: 'center', fontSize: 13, color: '#666', marginTop: 10 },
  regionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },
  regionBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F0F0F0' },
  regionLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: '#666' },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  footnote: { fontSize: 12, color: '#999', marginTop: 8, lineHeight: 17 },
  centered: { textAlign: 'center' },
  muscleRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },
  muscleRowFirst: { marginTop: 10 },
  muscleHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  muscleName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  muscleSets: { fontSize: 12, fontWeight: '600', color: '#2D6A4F' },
  volumeTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
    marginTop: 6,
    marginBottom: 6,
  },
  muscleAnatomy: { fontSize: 13, color: '#1A1A1A', lineHeight: 18 },
  muscleAction: { fontSize: 13, color: '#777', lineHeight: 18, marginTop: 2 },
  muscleFrom: { fontSize: 13, color: '#1A1A1A', lineHeight: 18, marginTop: 4 },
  muscleFromLabel: { color: '#999', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  exerciseCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  exerciseText: { flex: 1 },
  exerciseNumber: { color: '#999' },
  exerciseName: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  exerciseMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  muscleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  muscleLineSwatch: { width: 10, height: 10, marginTop: 4 },
  muscleLineText: { flex: 1, fontSize: 13, color: '#1A1A1A', lineHeight: 18 },
  noData: { fontSize: 12, color: '#bbb', fontStyle: 'italic', marginTop: 6 },
});
