import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { getShortNoteConflicts, resolveShortNoteConflict, ShortNoteConflict } from '../db/exercises';

// Short exercise notes used to be stored per program workout and are now one note per
// exercise. Where an exercise had different notes on different days, the startup migration
// can't pick one itself — this asks the user, one exercise at a time, which note to keep.
// Shown on launch until every conflict is resolved; no-op (renders nothing) once there are none.
export default function NoteConflictPrompt() {
  const [conflicts, setConflicts] = useState<ShortNoteConflict[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getShortNoteConflicts().then(setConflicts).catch(() => {});
  }, []);

  const current = conflicts[0];

  async function handleChoose(note: string) {
    if (!current || saving) return;
    setSaving(true);
    try {
      await resolveShortNoteConflict(current.exercise_id, note);
      setConflicts((cs) => cs.slice(1));
    } finally {
      setSaving(false);
    }
  }

  return (
    // onRequestClose is a no-op: a choice is required (the back button doesn't dismiss it).
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          {current && (
            <>
              {conflicts.length > 1 && (
                <Text style={styles.counter}>{conflicts.length} exercises left</Text>
              )}
              <Text style={styles.title}>Which note should {current.exercise_name} keep?</Text>
              <Text style={styles.message}>
                Exercise notes are now shared by every day an exercise appears in. This one had
                different notes on different days — pick the one to keep.
              </Text>
              <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
                {current.options.map((option) => (
                  <TouchableOpacity
                    key={option.note}
                    style={styles.optionBtn}
                    disabled={saving}
                    onPress={() => handleChoose(option.note)}
                  >
                    <Text style={styles.optionNote}>{option.note}</Text>
                    <Text style={styles.optionWorkouts}>
                      {option.workouts.length ? option.workouts.join(', ') : 'Current note'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  counter: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  message: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 14 },
  options: { flexGrow: 0 },
  optionsContent: { gap: 10 },
  optionBtn: {
    borderWidth: 1,
    borderColor: '#2D6A4F',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionNote: { fontSize: 15, color: '#1A1A1A', fontStyle: 'italic' },
  optionWorkouts: { fontSize: 12, color: '#2D6A4F', fontWeight: '600', marginTop: 4 },
});
