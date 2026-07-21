# MyTrainingHabits

The goal of MyTrainingHabits is to create a simple, frictionless workout tracker. The core idea is to make logging workouts fast and habitual. Training is organized into cycles — you define a program once (a repeating list of workouts), work through it at your own pace, and start a new cycle whenever you're ready. History is saved so you can look back, track progression, and stay consistent.

Everything that can be made faster should be made faster. Pre-fill from previous cycles, suggest exercises based on recent activity, and show progress without requiring manual analysis.

The app should follow the SLC model "Simple, Loveable, Complete" and focus on doing its core features well rather than doing many features poorly.

## Getting Started

### Prerequisites

- Node.js
- Android Studio (for the emulator or to provide the Android SDK for physical device builds)

### Running on a physical phone (Expo Go)

```bash
cd app && npx expo start --clear
```

Scan the QR code with the Expo Go app on your phone.

> **Tip:** If the app fails to load (e.g. "Failed to download remote update"), UFW may be blocking Metro. Run once to open the port:
> ```bash
> sudo ufw allow 8081/tcp
> ```
> As a fallback, tunnel mode also works:
> ```bash
> cd app && npx expo start --tunnel --clear
> ```

### Running on an Android emulator

1. Open Android Studio → **Device Manager** → create a virtual device (e.g. Pixel 8, API 35) if you don't have one
2. Start the emulator from Device Manager (or via the AVD Manager)
3. Start Metro:
   ```bash
   cd app && npx expo start --clear
   ```
4. Press `a` in the Metro terminal to open the app in the running emulator

The first launch installs the Expo Go app automatically into the emulator.

### Building a standalone APK (no Metro required)

A release build bundles the JavaScript directly into the APK so the app runs fully standalone — no computer, no Metro needed. Requires a connected physical device or a running emulator.

```bash
cd app
npx expo run:android --variant release
```

The APK is built and installed directly on the connected device. The first build takes a few minutes; subsequent builds are faster due to Gradle's cache.

---

## Technology stack

### Frontend

Expo (React Native) — runs on Android and iOS from a single codebase. All data stored locally in SQLite via `expo-sqlite`. No backend server required.

### Backend

None currently. A server-hosted backend would be added only if multi-user sync is built (deferred — see `docs/roadmap.md`).

### Database

Local SQLite database on-device. Stores the exercise library, the repeating program (workouts + their default sets/reps), and cycles (each run through the program, with every logged set).
