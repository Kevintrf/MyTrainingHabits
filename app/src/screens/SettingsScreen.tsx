import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getSettings, updateSettings } from '../db/settings';
import { BackupSummary, exportBackup, importBackup, parseBackup } from '../db/backup';
import { pickBackupFile, saveBackupFile } from '../services/backupFiles';
import { useApp } from '../context/AppContext';
import { showAlert } from '../utils/alert';
import { openExactAlarmSettings } from '../services/restTimerNotifications';
import { describeChoice, useSetTimePrompt } from '../context/SetTimePromptContext';
import { minutesLeft } from '../components/SetTimeChoiceToast';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function describeSummary(s: BackupSummary): string {
  return [
    plural(s.programWorkouts, 'program workout'),
    plural(s.cycles, 'cycle'),
    plural(s.loggedSets, 'logged set'),
    plural(s.customExercises, 'custom exercise'),
  ].join(', ');
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sanitizeMinutes(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 1);
}

function sanitizeSeconds(v: string): string {
  return v.replace(/[^0-9]/g, '').slice(0, 2);
}

export default function SettingsScreen() {
  const [restEnabled, setRestEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [headphonesOnly, setHeadphonesOnly] = useState(false);
  const [minutesText, setMinutesText] = useState('2');
  const [secondsText, setSecondsText] = useState('00');
  const durationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { remembered, clearRemembered } = useSetTimePrompt();
  const { refreshCycle, cancelRestTimer } = useApp();
  const navigation = useNavigation();
  const [backupBusy, setBackupBusy] = useState<'export' | 'import' | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setRestEnabled(s.rest_timer_enabled);
      setSoundEnabled(s.rest_timer_sound_enabled);
      setHeadphonesOnly(s.rest_timer_headphones_only);
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

  function handleToggleHeadphonesOnly(value: boolean) {
    setHeadphonesOnly(value);
    updateSettings({ rest_timer_headphones_only: value });
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

  async function handleExport() {
    if (backupBusy) return;
    setBackupBusy('export');
    try {
      const { json, summary } = await exportBackup();
      const name = await saveBackupFile(json);
      if (name) showAlert('Backup saved', `${name}\n\nContains ${describeSummary(summary)}.`);
    } catch (e) {
      showAlert('Export failed', errorMessage(e));
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleImport() {
    if (backupBusy) return;
    setBackupBusy('import');
    try {
      const json = await pickBackupFile();
      if (json === null) return;
      const { backup, summary } = parseBackup(json);
      const exportedAt = new Date(backup.exported_at);
      const from = isNaN(exportedAt.getTime()) ? '' : ` from ${exportedAt.toLocaleString()}`;
      showAlert(
        'Replace all data?',
        `This backup${from} contains ${describeSummary(summary)}.\n\nEverything currently in the app — program, history, custom exercises, notes and settings — will be replaced by it. This can't be undone; export a backup first if you might want the current data back.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => applyImport(backup) },
        ],
      );
    } catch (e) {
      showAlert('Import failed', errorMessage(e));
    } finally {
      setBackupBusy(null);
    }
  }

  async function applyImport(backup: ReturnType<typeof parseBackup>['backup']) {
    try {
      importBackup(backup);
    } catch (e) {
      showAlert('Import failed', `Nothing was changed.\n\n${errorMessage(e)}`);
      return;
    }
    cancelRestTimer();
    await refreshCycle();
    // Rebuild every tab from scratch: screens deeper in a stack (e.g. an open workout) hold
    // ids from the data that was just replaced. This also remounts this screen with the
    // imported settings.
    navigation.getParent()?.reset({
      index: 3,
      routes: [{ name: 'CycleTab' }, { name: 'ProgramTab' }, { name: 'ExercisesTab' }, { name: 'Settings' }],
    });
    showAlert('Backup imported', 'All data was restored from the backup.');
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

              {Platform.OS === 'android' && soundEnabled && (
                <>
                  <View style={styles.cardDivider} />
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleText}>
                      <Text style={styles.toggleLabel}>Headphones only</Text>
                      <Text style={styles.toggleDesc}>Never plays through the speaker — silent unless headphones are connected</Text>
                    </View>
                    <Switch
                      value={headphonesOnly}
                      onValueChange={handleToggleHeadphonesOnly}
                      trackColor={{ false: '#E5E5E5', true: '#2D6A4F' }}
                      thumbColor="#fff"
                    />
                  </View>
                </>
              )}

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

        <Text style={styles.sectionHeading}>EDITING OLDER SETS</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>
                {remembered ? `Not asking: ${describeChoice(remembered.choice)}` : 'Asking every time'}
              </Text>
              <Text style={styles.toggleDesc}>
                {remembered
                  ? `For another ${minutesLeft(remembered.until, Date.now())} min, from "Don't ask again for 1 hour". Checking off a set in a workout from an earlier day or 2+ hours ago won't ask which time to log it at.`
                  : 'Checking off a set in a workout from an earlier day or 2+ hours ago asks whether to keep its original time.'}
              </Text>
            </View>
            {remembered && (
              <TouchableOpacity style={styles.resetBtn} onPress={clearRemembered}>
                <Text style={styles.resetText}>Ask again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.sectionHeading}>BACKUP</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingsLinkRow} onPress={handleExport} disabled={!!backupBusy}>
            <Ionicons name="download-outline" size={20} color="#2D6A4F" />
            <View style={styles.settingsLinkText}>
              <Text style={styles.settingsLinkTitle}>Export data</Text>
              <Text style={styles.settingsLinkDesc}>
                Saves everything — program, workout history, custom exercises, notes and settings — as a JSON file in a folder you pick
              </Text>
            </View>
            {backupBusy === 'export' ? <ActivityIndicator color="#2D6A4F" /> : <Ionicons name="chevron-forward" size={18} color="#ccc" />}
          </TouchableOpacity>

          <View style={styles.cardDivider} />

          <TouchableOpacity style={styles.settingsLinkRow} onPress={handleImport} disabled={!!backupBusy}>
            <Ionicons name="push-outline" size={20} color="#2D6A4F" />
            <View style={styles.settingsLinkText}>
              <Text style={styles.settingsLinkTitle}>Import data</Text>
              <Text style={styles.settingsLinkDesc}>Restores a backup file, replacing all current data</Text>
            </View>
            {backupBusy === 'import' ? <ActivityIndicator color="#2D6A4F" /> : <Ionicons name="chevron-forward" size={18} color="#ccc" />}
          </TouchableOpacity>
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
  resetBtn: { backgroundColor: '#2D6A4F', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  resetText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
