import { db } from './client';
import { UserSettings } from '../services/api';

interface SettingsRow {
  rest_timer_enabled: number;
  rest_timer_seconds: number;
  rest_timer_sound_enabled: number;
}

function mapSettings(row: SettingsRow): UserSettings {
  return {
    rest_timer_enabled: !!row.rest_timer_enabled,
    rest_timer_seconds: row.rest_timer_seconds,
    rest_timer_sound_enabled: !!row.rest_timer_sound_enabled,
  };
}

export async function getSettings(): Promise<UserSettings> {
  const row = await db.getFirstAsync<SettingsRow>(
    'SELECT rest_timer_enabled, rest_timer_seconds, rest_timer_sound_enabled FROM user_settings WHERE id = 1',
  );
  return row
    ? mapSettings(row)
    : { rest_timer_enabled: true, rest_timer_seconds: 120, rest_timer_sound_enabled: true };
}

export async function updateSettings(patch: {
  rest_timer_enabled?: boolean;
  rest_timer_seconds?: number;
  rest_timer_sound_enabled?: boolean;
}): Promise<UserSettings> {
  await db.runAsync(
    `UPDATE user_settings
     SET rest_timer_enabled = COALESCE(?, rest_timer_enabled),
         rest_timer_seconds = COALESCE(?, rest_timer_seconds),
         rest_timer_sound_enabled = COALESCE(?, rest_timer_sound_enabled)
     WHERE id = 1`,
    [
      patch.rest_timer_enabled !== undefined ? (patch.rest_timer_enabled ? 1 : 0) : null,
      patch.rest_timer_seconds ?? null,
      patch.rest_timer_sound_enabled !== undefined ? (patch.rest_timer_sound_enabled ? 1 : 0) : null,
    ],
  );
  return getSettings();
}
