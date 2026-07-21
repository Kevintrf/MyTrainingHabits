# Decision: Tech Stack — Expo + SQLite

## Decision

- **Frontend:** Expo (React Native, TypeScript)
- **Database:** SQLite via expo-sqlite (on-device)
- **Backend:** None (deferred — would be Express/Node.js if multi-user sync is added)

## Reasoning

### Expo

- React Native with a managed workflow removes most of the native build complexity
- Allows running on iOS and Android from a single codebase
- Expo Go enables fast iteration — no build step needed during development
- TypeScript support is first-class
- `expo-sqlite` is built into the SDK — no ejection needed for local storage

### SQLite (expo-sqlite)

- Offline-first by default — no server or network dependency
- Sufficient for single-user, relational workout data
- See [database-choice.md](database-choice.md) for full reasoning

### Backend (deferred)

- Not required — all functionality runs on-device
- Express (Node.js, TypeScript) would be the natural choice if multi-user sync is added later

## Alternatives Considered

**Next.js (backend)** — API routes are convenient but mixing frontend and backend concerns is a tradeoff not worth it here since the frontend is mobile, not web.

**React Native CLI (without Expo)** — more control, but the overhead of managing native builds slows down early development with no benefit at this stage.

**Firebase / Supabase** — managed backend with offline sync. Good option if multi-user sync is added. Avoided for now to keep the stack simple and free.

## Consequences

- TypeScript everywhere — types can potentially be shared between frontend and backend when sync is added
- Expo managed workflow limits some native module options — eject only if necessary
- All data is local-only until a sync layer is added
