import { openDatabaseSync } from 'expo-sqlite';

// Single shared database connection for the whole app.
// Foreign keys are enforced on every connection open.
export const db = openDatabaseSync('mytraininghabits.db');
db.execSync('PRAGMA foreign_keys = ON;');
