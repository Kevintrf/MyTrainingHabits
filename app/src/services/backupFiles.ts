import { Platform } from 'react-native';
import { Directory, File } from 'expo-file-system';

// File-system side of backups and the training history export (the data side is
// src/db/backup.ts and src/db/trainingExport.ts). Uses expo-file-system's
// system pickers: a folder picker to save into (Android's Storage Access Framework / the iOS
// Files app — so the backup can go anywhere, including cloud drives), and a file picker to
// open one. Both resolve to null when the user cancels the picker.

function isPickerCancel(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  return /cancel/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
}

function timestampedFileName(prefix: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${date}-${time}.json`;
}

// Asks for a folder and writes `json` into a new file there named `<prefix>-<date>-<time>.json`.
// Returns the file name.
export async function saveJsonFile(json: string, prefix: string): Promise<string | null> {
  let directory: Directory;
  try {
    directory = new Directory((await Directory.pickDirectoryAsync()).uri);
  } catch (e) {
    if (isPickerCancel(e)) return null;
    throw e;
  }
  const name = timestampedFileName(prefix);
  const file = directory.createFile(name, 'application/json');
  file.write(json);
  return name;
}

export function saveBackupFile(json: string): Promise<string | null> {
  return saveJsonFile(json, 'MyTrainingHabits-backup');
}

export function saveTrainingHistoryFile(json: string): Promise<string | null> {
  return saveJsonFile(json, 'MyTrainingHabits-training-history');
}

// Asks for a file and returns its text contents.
export async function pickBackupFile(): Promise<string | null> {
  let picked: { uri: string } | { uri: string }[];
  try {
    // No type filter on Android: depending on where the file is stored (Downloads, Drive, …)
    // a .json file is often reported as application/octet-stream and would be greyed out.
    picked = await File.pickFileAsync(undefined, Platform.OS === 'ios' ? 'application/json' : undefined);
  } catch (e) {
    if (isPickerCancel(e)) return null;
    throw e;
  }
  const first = Array.isArray(picked) ? picked[0] : picked;
  if (!first) return null;
  return new File(first.uri).text();
}
