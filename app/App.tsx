import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/context/AppContext';
import { SetTimePromptProvider } from './src/context/SetTimePromptContext';
import RootNavigator from './src/navigation/RootNavigator';
import RestTimerBanner from './src/components/RestTimerBanner';
import NoteConflictPrompt from './src/components/NoteConflictPrompt';
import { initSchema } from './src/db/schema';

// Run synchronously at module load — creates tables and seeds defaults on first
// install, is a no-op on every subsequent launch (CREATE TABLE IF NOT EXISTS).
initSchema();

export default function App() {
  return (
    <AppProvider>
      <SetTimePromptProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <RootNavigator />
          <RestTimerBanner />
          <NoteConflictPrompt />
        </View>
      </SetTimePromptProvider>
    </AppProvider>
  );
}
