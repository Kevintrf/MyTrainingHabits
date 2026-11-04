import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WeightOptionSet, composeWeight, decomposeWeight } from '../utils/weightOptions';

// Picks a set's weight from an exercise's fixed weight list (WorkoutScreen, for exercises with
// weight_options set). Tapping a step picks it and closes; the add-on toggle (lists that have
// one) adds its weight on top of whichever step is picked — toggled with a step already picked,
// it updates that pick straight away and stays open.
export default function WeightPickerModal({ visible, options, value, suggested, onPick, onClose }: {
  visible: boolean;
  options: WeightOptionSet;
  // The set's saved weight, or null if none yet.
  value: number | null;
  // The grey suggestion shown on an empty set (last time's weight) — outlined in the grid, and
  // decides the add-on toggle's starting state when nothing's picked yet.
  suggested: number | null;
  onPick: (weight: number | null) => void;
  onClose: () => void;
}) {
  const current = value !== null ? decomposeWeight(options, value) : null;
  const hint = value === null && suggested !== null ? decomposeWeight(options, suggested) : null;
  const [addOn, setAddOn] = useState(false);

  // Reset the toggle to match the set every time the picker opens.
  useEffect(() => {
    if (visible) setAddOn((current ?? hint)?.addOn ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleToggleAddOn() {
    const next = !addOn;
    setAddOn(next);
    if (current) onPick(composeWeight(options, current.base, next));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.title}>{options.name}</Text>
          <Text style={styles.subtitle}>
            {value === null
              ? 'No weight picked yet'
              : current
                ? `Picked: ${value} kg`
                : `Saved: ${value} kg (not on this list)`}
          </Text>

          {options.addOn !== null && (
            <TouchableOpacity style={styles.addOnRow} onPress={handleToggleAddOn} activeOpacity={0.7}>
              <Ionicons name={addOn ? 'checkbox' : 'square-outline'} size={22} color={addOn ? '#2D6A4F' : '#bbb'} />
              <Text style={styles.addOnLabel}>Add-on +{options.addOn} kg</Text>
            </TouchableOpacity>
          )}

          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
            {options.weights.map((base) => {
              const total = composeWeight(options, base, addOn);
              const selected = current?.base === base && current.addOn === addOn;
              const isHint = hint?.base === base && hint.addOn === addOn;
              return (
                <TouchableOpacity
                  key={base}
                  style={[styles.chip, isHint && styles.chipHint, selected && styles.chipSelected]}
                  onPress={() => { onPick(total); onClose(); }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{total}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            {value !== null && (
              <TouchableOpacity onPress={() => { onPick(null); onClose(); }} style={styles.footerBtn}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
            <View style={styles.footerSpacer} />
            <TouchableOpacity onPress={onClose} style={styles.footerBtn}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
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
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  subtitle: { fontSize: 13, color: '#999', marginTop: 2, marginBottom: 12 },
  addOnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  addOnLabel: { fontSize: 15, color: '#1A1A1A', fontWeight: '600' },
  gridScroll: { flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '22%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#F9F9F9',
    alignItems: 'center',
  },
  chipHint: { borderColor: '#2D6A4F', borderStyle: 'dashed' },
  chipSelected: { backgroundColor: '#2D6A4F', borderColor: '#2D6A4F', borderStyle: 'solid' },
  chipText: { fontSize: 15, color: '#1A1A1A', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  footerSpacer: { flex: 1 },
  footerBtn: { padding: 4 },
  clearText: { color: '#e74c3c', fontSize: 14, fontWeight: '600' },
  closeText: { color: '#999', fontSize: 14, fontWeight: '600' },
});
