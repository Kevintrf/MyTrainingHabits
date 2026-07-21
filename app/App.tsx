import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';
import RestTimerBanner from './src/components/RestTimerBanner';
import { initSchema } from './src/db/schema';

// Run synchronously at module load — creates tables and seeds defaults on first
// install, is a no-op on every subsequent launch (CREATE TABLE IF NOT EXISTS).
initSchema();

export default function App() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <RootNavigator />
        <RestTimerBanner />
      </View>
    </AppProvider>
  );
}
