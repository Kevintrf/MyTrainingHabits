import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { describeChoice, useSetTimePrompt } from '../context/SetTimePromptContext';

export function minutesLeft(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 60000));
}

// Slim bar shown while a "Don't ask again for 1 hour" choice is active, so a wrong pick can
// be undone right where it matters. The same reset also lives in SettingsScreen.
export default function SetTimeChoiceToast() {
  const { remembered, clearRemembered } = useSetTimePrompt();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!remembered) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [remembered]);

  if (!remembered) return null;

  return (
    <View style={styles.bar}>
      <Ionicons name="time-outline" size={16} color="#2D6A4F" />
      <Text style={styles.text} numberOfLines={2}>
        Older sets: {describeChoice(remembered.choice)} · {minutesLeft(remembered.until, now)} min left
      </Text>
      <TouchableOpacity onPress={clearRemembered} style={styles.btn} hitSlop={8}>
        <Text style={styles.btnText}>Ask again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F3EC',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#CFE5D7',
  },
  text: { flex: 1, fontSize: 13, color: '#1A1A1A' },
  btn: {
    backgroundColor: '#2D6A4F',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
