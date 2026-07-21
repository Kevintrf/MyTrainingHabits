# Decision: Database — SQLite (expo-sqlite)

## Decision

Use **SQLite via expo-sqlite** as the primary database (on-device, offline-first).

## Reasoning

- All data is single-user and local — there is no need for a server-hosted database
- `expo-sqlite` is built into the Expo SDK — no extra native config or ejection required
- SQLite handles the expected query patterns well: active-cycle lookups, exercise search by name, set history for a given exercise
- Relational model is a natural fit — sessions, exercises, sets, and routines are strongly relational
- WAL mode improves concurrent read performance and crash safety
- Sufficient for single-user workloads; scale to a server-backed DB only if multi-user sync is added

## Alternatives Considered

**PostgreSQL (server-hosted)** — would require a backend server and network dependency for what is otherwise a fully local, single-user app. Would be added back if multi-user sync is ever needed.

**Realm / WatermelonDB** — offline-first ORMs with sync support. Heavier dependency, more complexity. Not needed at this stage.

**AsyncStorage** — key-value only, no relational queries. Unsuitable for structured workout data.

## Consequences

- Schema changes require migrations — `schema.ts` handles this with a version number and `ALTER TABLE` migrations
- No ORM — raw SQL queries in typed service functions in `src/db/`. Keeps it simple and debuggable.
- Local-only — no backup unless the user exports data manually (Phase 5 feature)
