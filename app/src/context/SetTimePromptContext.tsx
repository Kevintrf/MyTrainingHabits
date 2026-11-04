import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CompletionTimeSuggestion, formatClock, formatWhen } from '../utils/setTiming';

// What to stamp on a set being checked off in an older workout: its earlier time (the set's
// own original time, or an estimate placing it among that workout's other sets), or now.
export type SetTimeChoice = 'original' | 'now';

export const REMEMBER_CHOICE_MS = 60 * 60 * 1000;

export interface RememberedSetTimeChoice {
  choice: SetTimeChoice;
  until: number; // epoch ms
}

interface SetTimePromptContextType {
  // Asks the user (or answers straight away from a still-active "don't ask again" choice).
  // Resolves null if the user cancelled — the set should be left unchecked.
  chooseSetTime: (suggestion: CompletionTimeSuggestion) => Promise<SetTimeChoice | null>;
  // The active "don't ask again for 1 hour" choice, if any — shown by SetTimeChoiceToast and
  // SettingsScreen so it can be undone. In memory only: an app restart just means asking again.
  remembered: RememberedSetTimeChoice | null;
  clearRemembered: () => void;
}

const SetTimePromptContext = createContext<SetTimePromptContextType | null>(null);

interface Pending {
  suggestion: CompletionTimeSuggestion;
  resolve: (choice: SetTimeChoice | null) => void;
}

export function SetTimePromptProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [remembered, setRemembered] = useState<RememberedSetTimeChoice | null>(null);
  const rememberedRef = useRef<RememberedSetTimeChoice | null>(null);
  rememberedRef.current = remembered;

  // Drop the remembered choice the moment it expires, so the toast/settings row disappear on
  // time too. chooseSetTime also re-checks `until` itself in case this timer fires late.
  useEffect(() => {
    if (!remembered) return;
    const timeout = setTimeout(() => setRemembered(null), Math.max(0, remembered.until - Date.now()));
    return () => clearTimeout(timeout);
  }, [remembered]);

  const chooseSetTime = useCallback((suggestion: CompletionTimeSuggestion) => {
    const r = rememberedRef.current;
    if (r && r.until > Date.now()) return Promise.resolve(r.choice);
    return new Promise<SetTimeChoice | null>((resolve) => {
      setDontAsk(false);
      setPending((prev) => {
        prev?.resolve(null);
        return { suggestion, resolve };
      });
    });
  }, []);

  const clearRemembered = useCallback(() => setRemembered(null), []);

  function finish(choice: SetTimeChoice | null) {
    if (!pending) return;
    if (choice && dontAsk) setRemembered({ choice, until: Date.now() + REMEMBER_CHOICE_MS });
    pending.resolve(choice);
    setPending(null);
  }

  const s = pending?.suggestion;

  return (
    <SetTimePromptContext.Provider value={{ chooseSetTime, remembered, clearRemembered }}>
      {children}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => finish(null)}>
        <Pressable style={styles.backdrop} onPress={() => finish(null)}>
          {/* Inner Pressable swallows taps so only the backdrop itself cancels. */}
          <Pressable style={styles.dialog} onPress={() => {}}>
            {s && (
              <>
                <Text style={styles.title}>
                  {s.kind === 'original' ? 'Keep the original time?' : 'Log in its original workout?'}
                </Text>
                <Text style={styles.message}>
                  {s.kind === 'original'
                    ? `This set was first checked off ${formatWhen(s.at)}. Using the current time would move it in your history.`
                    : `The rest of this workout was logged ${formatWhen(s.referenceAt)}. Using the current time would put this set on a different day in your history.`}
                </Text>

                <TouchableOpacity style={styles.primaryBtn} onPress={() => finish('original')}>
                  <Text style={styles.primaryText}>
                    {s.kind === 'original' ? 'Keep original time' : 'Use estimated time'}
                  </Text>
                  <Text style={styles.primarySub}>
                    {s.kind === 'original' ? formatWhen(s.at) : `about ${formatClock(s.at)}, based on the sets around it`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => finish('now')}>
                  <Text style={styles.secondaryText}>Use current time</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.checkboxRow} onPress={() => setDontAsk((v) => !v)}>
                  <Ionicons
                    name={dontAsk ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={dontAsk ? '#2D6A4F' : '#bbb'}
                  />
                  <Text style={styles.checkboxLabel}>Don't ask again for 1 hour</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => finish(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SetTimePromptContext.Provider>
  );
}

export function useSetTimePrompt(): SetTimePromptContextType {
  const ctx = useContext(SetTimePromptContext);
  if (!ctx) throw new Error('useSetTimePrompt must be used within SetTimePromptProvider');
  return ctx;
}

export function describeChoice(choice: SetTimeChoice): string {
  return choice === 'original' ? 'keeping original times' : 'using current time';
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
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  message: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 18 },
  primaryBtn: {
    backgroundColor: '#2D6A4F',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  primarySub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2, textAlign: 'center' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#2D6A4F',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryText: { color: '#2D6A4F', fontSize: 15, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  checkboxLabel: { fontSize: 14, color: '#1A1A1A' },
  cancelBtn: { alignSelf: 'center', marginTop: 14, padding: 4 },
  cancelText: { color: '#999', fontSize: 14, fontWeight: '600' },
});
