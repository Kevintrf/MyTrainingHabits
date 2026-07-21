import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSettings, updateSettings } from '../db/settings';
import { openExactAlarmSettings } from '../services/restTimerNotifications';

function sanitizeMinutes(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 1);
}

function sanitizeSeconds(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 2);
}

export default function SettingsScreen() {
  const [restEnabled, setRestEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [minutesText, setMinutesText] = useState('2');
  const [secondsText, setSecondsText] = useState('00');
  const durationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setRestEnabled(s.rest_timer_enabled);
      setSoundEnabled(s.rest_timer_sound_enabled);
      setMinutesText(String(Math.floor(s.rest_timer_seconds / 60)));
      setSecondsText(String(s.rest_timer_seconds % 60).padStart(2, '0'));
    });
  }, []);

  function handleToggleEnabled(value: boolean) {
    setRestEnabled(value);
    updateSettings({ rest_timer_enabled: value });
  }

  function handleToggleSound(value: boolean) {
    setSoundEnabled(value);
    updateSettings({ rest_timer_sound_enabled: value });
  }

  // Only persists when the resulting total is > 0 — a 0:00 duration is left unsaved
  // (with a warning shown) rather than silently falling back to some other value.
  function commitDuration(minutesStr: string, secondsStr: string) {
    const minutes = parseInt(minutesStr, 10) || 0;
    const seconds = parseInt(secondsStr, 10) || 0;
    const total = minutes * 60 + seconds;
    if (total <= 0) return;
    updateSettings({ rest_timer_seconds: total });
  }

  function scheduleDurationSave(m: string, s: string) {
    if (durationDebounceRef.current) clearTimeout(durationDebounceRef.current);
    durationDebounceRef.current = setTimeout(() => commitDuration(m, s), 600);
  }

  function handleMinutesChange(v: string) {
    const clean = sanitizeMinutes(v);
    setMinutesText(clean);
    scheduleDurationSave(clean, secondsText);
  }

  function handleSecondsChange(v: string) {
    const clean = sanitizeSeconds(v);
    setSecondsText(clean);
    scheduleDurationSave(minutesText, clean);
  }

  const totalSeconds = (parseInt(minutesText, 10) || 0) * 60 + (parseInt(secondsText, 10) || 0);
  const durationInvalid = totalSeconds <= 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeading}>REST TIMER</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Enable rest timer</Text>
              <Text style={styles.toggleDesc}>Starts automatically when you check off a set</Text>
            </View>
            <Switch
              value={restEnabled}
              onValueChange={handleToggleEnabled}
              trackColor={{ false: '#E5E5E5', true: '#2D6A4F' }}
              thumbColor="#fff"
            />
          </View>

          {restEnabled && (
            <>
              <View style={styles.cardDivider} />

              <Text style={styles.label}>DURATION</Text>
              <View style={styles.durationRow}>
                <TextInput
                  style={styles.durationInput}
                  keyboardType="number-pad"
                  value={minutesText}
                  onChangeText={handleMinutesChange}
                  maxLength={1}
                  placeholder="0"
                  placeholderTextColor="#bbb"
                  autoComplete="off" textContentType="none" importantForAutofill="no"
                />
                <Text style={styles.durationUnit}>min</Text>
                <TextInput
                  style={styles.durationInput}
                  keyboardType="number-pad"
                  value={secondsText}
                  onChangeText={handleSecondsChange}
                  maxLength={2}
                  placeholder="00"
                  placeholderTextColor="#bbb"
                  autoComplete="off" textContentType="none" importantForAutofill="no"
                />
                <Text style={styles.durationUnit}>sec</Text>
              </View>
              {durationInvalid && (
                <Text style={styles.durationWarning}>Enter a duration greater than 0</Text>
              )}

              <View style={styles.cardDivider} />

              <View style={styles.toggleRow}>
                <View style={styles.toggleText}>
                  <Text style={styles.toggleLabel}>Play sound</Text>
                  <Text style={styles.toggleDesc}>Plays when rest ends, even if the app is in the background</Text>
                </View>
                <Switch
                  value={soundEnabled}
                  onValueChange={handleToggleSound}
                  trackColor={{ false: '#E5E5E5', true: '#2D6A4F' }}
                  thumbColor="#fff"
                />
              </View>

              {Platform.OS === 'android' && (
                <>
                  <View style={styles.cardDivider} />
                  <TouchableOpacity style={styles.settingsLinkRow} onPress={openExactAlarmSettings}>
                    <Ionicons name="alarm-outline" size={20} color="#2D6A4F" />
                    <View style={styles.settingsLinkText}>
                      <Text style={styles.settingsLinkTitle}>Notification arriving late?</Text>
                      <Text style={styles.settingsLinkDesc}>
                        Android may delay it unless "Alarms & reminders" is allowed for this app. Tap to open that setting.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  content: { padding: 20, paddingBottom: 40 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  toggleDesc: { fontSize: 12, color: '#999', marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: '#E5E5E5', marginVertical: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 8 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  durationInput: {
    width: 52,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  durationUnit: { fontSize: 14, color: '#999', marginRight: 8 },
  durationWarning: { fontSize: 12, color: '#e74c3c', marginTop: 8 },
  settingsLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsLinkText: { flex: 1 },
  settingsLinkTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  settingsLinkDesc: { fontSize: 12, color: '#999', marginTop: 2 },
});
