import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Floating, app-wide countdown — visible regardless of which tab you're on, since resting
// isn't tied to staying on WorkoutScreen. Positioned above the tab bar; endAt is an
// epoch-ms timestamp rather than an accumulating counter, so the countdown stays correct
// even if the app was backgrounded and the interval below missed ticks while suspended.
export default function RestTimerBanner() {
  const { restTimerEndAt, cancelRestTimer } = useApp();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!restTimerEndAt) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [restTimerEndAt]);

  useEffect(() => {
    if (restTimerEndAt && now >= restTimerEndAt) {
      cancelRestTimer();
    }
  }, [now, restTimerEndAt, cancelRestTimer]);

  if (!restTimerEndAt) return null;

  const remaining = restTimerEndAt - now;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        <Ionicons name="time-outline" size={20} color="#fff" />
        <Text style={styles.label}>Resting</Text>
        <Text style={styles.time}>{formatRemaining(remaining)}</Text>
        <TouchableOpacity onPress={cancelRestTimer} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 90 : 70,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D6A4F',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  label: { color: '#fff', fontSize: 14, fontWeight: '600' },
  time: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, marginLeft: 4 },
  skipBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
