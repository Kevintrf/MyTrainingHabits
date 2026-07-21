import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import CycleScreen from '../screens/CycleScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import ProgramScreen from '../screens/ProgramScreen';
import EditProgramWorkoutScreen from '../screens/EditProgramWorkoutScreen';
import ExercisesScreen from '../screens/ExercisesScreen';
import CreateExerciseScreen from '../screens/CreateExerciseScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import ExerciseHistoryScreen from '../screens/ExerciseHistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

// --- Param list types ---

export type CycleStackParamList = {
  CycleHome: undefined;
  Workout: { cycleWorkoutId: number; label: string };
  ExerciseDetail: { exerciseId: number; exerciseName: string };
  ExerciseHistory: { exerciseId: number; exerciseName: string };
};

export type ProgramStackParamList = {
  ProgramHome: undefined;
  EditProgramWorkout: { workoutId?: number };
};

export type ExercisesStackParamList = {
  ExercisesHome: undefined;
  CreateExercise: { initialName?: string } | undefined;
  ExerciseDetail: { exerciseId: number; exerciseName: string };
  ExerciseHistory: { exerciseId: number; exerciseName: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
};

type RootTabParamList = {
  CycleTab: undefined;
  ProgramTab: undefined;
  ExercisesTab: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const CycleStack = createNativeStackNavigator<CycleStackParamList>();
const ProgramStack = createNativeStackNavigator<ProgramStackParamList>();
const ExercisesStack = createNativeStackNavigator<ExercisesStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function CycleStackNavigator() {
  return (
    <CycleStack.Navigator>
      <CycleStack.Screen name="CycleHome" component={CycleScreen} options={{ title: 'Cycle' }} />
      <CycleStack.Screen
        name="Workout"
        component={WorkoutScreen}
        options={({ route }) => ({ title: route.params.label })}
      />
      <CycleStack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={({ route }) => ({ title: route.params.exerciseName })}
      />
      <CycleStack.Screen
        name="ExerciseHistory"
        component={ExerciseHistoryScreen}
        options={{ title: 'History' }}
      />
    </CycleStack.Navigator>
  );
}

function ProgramStackNavigator() {
  return (
    <ProgramStack.Navigator>
      <ProgramStack.Screen
        name="ProgramHome"
        component={ProgramScreen}
        options={({ navigation }) => ({
          title: 'Program',
          headerRight: () => (
            <Ionicons
              name="add"
              size={26}
              color="#2D6A4F"
              onPress={() => navigation.navigate('EditProgramWorkout', {})}
            />
          ),
        })}
      />
      <ProgramStack.Screen
        name="EditProgramWorkout"
        component={EditProgramWorkoutScreen}
        options={({ route }) => ({ title: route.params.workoutId ? 'Edit Workout' : 'New Workout' })}
      />
    </ProgramStack.Navigator>
  );
}

function ExercisesStackNavigator() {
  return (
    <ExercisesStack.Navigator>
      <ExercisesStack.Screen
        name="ExercisesHome"
        component={ExercisesScreen}
        options={({ navigation }) => ({
          title: 'Exercises',
          headerRight: () => (
            <Ionicons
              name="add"
              size={26}
              color="#2D6A4F"
              onPress={() => navigation.navigate('CreateExercise', {})}
            />
          ),
        })}
      />
      <ExercisesStack.Screen name="CreateExercise" component={CreateExerciseScreen} options={{ title: 'New Exercise' }} />
      <ExercisesStack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={({ route }) => ({ title: route.params.exerciseName })}
      />
      <ExercisesStack.Screen
        name="ExerciseHistory"
        component={ExerciseHistoryScreen}
        options={{ title: 'History' }}
      />
    </ExercisesStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
    </SettingsStack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  CycleTab: 'repeat-outline',
  ProgramTab: 'clipboard-outline',
  ExercisesTab: 'barbell-outline',
  Settings: 'settings-outline',
};

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
          tabBarActiveTintColor: '#2D6A4F',
          tabBarInactiveTintColor: '#999',
          headerShown: false,
        })}
      >
        <Tab.Screen name="CycleTab" component={CycleStackNavigator} options={{ title: 'Cycle' }} />
        <Tab.Screen name="ProgramTab" component={ProgramStackNavigator} options={{ title: 'Program' }} />
        <Tab.Screen name="ExercisesTab" component={ExercisesStackNavigator} options={{ title: 'Exercises' }} />
        <Tab.Screen name="Settings" component={SettingsStackNavigator} options={{ title: 'Settings', headerShown: false }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
