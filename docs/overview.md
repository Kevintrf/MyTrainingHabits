# Overview

## What the App Does

MyTrainingHabits is a mobile workout tracking app built around the idea that logging training should be fast and habitual. You open the app, log what you did, and move on. The history is there when you want to look back at progression or consistency.

Training is organized into **cycles**, not calendar weeks. You define a program (a repeating list of workouts, e.g. Push/Pull/Legs) once; each cycle is one live run through it, at your own pace. You see at a glance which workouts in the current cycle are done, log sets as you go, and start a new cycle whenever you're ready — even before finishing the current one.

## Target Users

- People who train regularly and want a simple way to track what they did each session
- Users who want to see progression over time (did I lift more this week than last week?)
- Anyone frustrated by bloated fitness apps that require elaborate setup before you can log anything
- Initial focus: personal use / small audience

## Core Features

### Must have (MVP)

- Define a program — a repeating, ordered list of workouts (e.g. "Push day") with default exercises/targets
- Cycle view — see every workout in the active cycle and check them off
- Log a workout — add sets with reps and weight for each exercise
- Start a new cycle — archive the current one and get a fresh blank instance of the program, any time
- Exercise library — 873 built-in exercises (via [free-exercise-db](https://github.com/yuhonas/free-exercise-db)) with images and step-by-step guides, search and pick exercises, create custom ones

### High value (post-MVP)

- Progression tracking — show last cycle's weights when logging the same exercise
- Per-exercise history — every completed set for an exercise, across all cycles, grouped by day
- Cycle history — browse past finished cycles
- Rest timer — starts automatically after each completed set; in-app countdown + a notification when it ends, skippable; on/off toggle (default on), duration, and notification sound toggle (default on) all configurable in Settings
- Workout notes — free-text notes per cycle workout
- Cycle summary — workouts completed, total volume, consistency streak

### Deferred (build after real users exist)

- Authentication / multi-user
- Cloud sync / backup
- Advanced analytics and charts
- AI coaching or suggestions
- Social / sharing features

## Philosophy

- **SLC**: Simple, Loveable, Complete. Do the core well, not everything poorly.
- **Fast logging.** Target: log a completed set in under 5 seconds.
- **History should be effortless.** Past sessions are automatically saved and browsable by week.
- **Always keep the app runnable.** Never let the codebase sit broken for more than a day.
- **Show only what matters.** Exercise, sets, reps, weight. No noise.

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Expo (React Native)               |
| Database | SQLite (expo-sqlite, on-device)   |
| Backend  | Express (Node.js) — deferred      |
