/**
 * Backup export/import («Данные» section).
 *
 * File shape (JSON download):
 *   { app: 'b2-words', version: 1, exportedAt: ISO,
 *     data: { srs, activity, selection, settings } }
 *
 * Import is strictly validated: wrong app/version is rejected, unknown word-ids
 * and malformed records are dropped, settings are sanitized. Applying a backup
 * REPLACES current data (no merge).
 */

import type { ActivityMap, SrsState, SrsRecord } from '@/lib/srs';
import { computeStreak, localDayKey, saveActivity, saveSrs } from '@/lib/srs';
import type { SelectionSet, StoredSelection } from '@/lib/selection';
import { parseSelection, saveSelection, serializeSelection } from '@/lib/selection';
import type { Settings } from '@/lib/storage';
import { DEFAULT_SETTINGS, sanitizeSettings, saveSettings } from '@/lib/storage';

export const BACKUP_APP = 'b2-words';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string; // ISO timestamp
  data: {
    srs: SrsState;
    activity: ActivityMap;
    selection: StoredSelection;
    settings: Settings;
  };
}

/** Validated, ready-to-apply user data. */
export interface BackupData {
  srs: SrsState;
  activity: ActivityMap;
  selection: SelectionSet;
  settings: Settings;
}

export function buildBackup(data: BackupData, allWords: string[], now = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      srs: data.srs,
      activity: data.activity,
      selection: serializeSelection(data.selection, allWords),
      settings: data.settings,
    },
  };
}

/** b2words-backup-YYYY-MM-DD.json (local date). */
export function backupFileName(now = new Date()): string {
  return `b2words-backup-${localDayKey(now)}.json`;
}

export type ParseBackupResult =
  | { ok: true; data: BackupData; wordsInWork: number; streak: number }
  | { ok: false; error: string };

function fail(error: string): ParseBackupResult {
  return { ok: false, error };
}

function isSrsRecord(v: unknown): v is SrsRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as SrsRecord;
  return (
    Number.isInteger(r.box) &&
    r.box >= 1 &&
    r.box <= 5 &&
    typeof r.due === 'number' &&
    Number.isFinite(r.due) &&
    typeof r.lapses === 'number' &&
    Number.isFinite(r.lapses) &&
    r.lapses >= 0
  );
}

/**
 * Parse + validate a backup file's text. Never throws.
 * Unknown word-ids and malformed records are dropped; missing sections fall
 * back to safe defaults (empty srs/activity, «all» selection, default settings).
 */
export function parseBackup(
  text: string,
  valid: Set<string>,
  allWords: string[],
): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Файл повреждён: это не JSON.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('Файл не похож на бэкап B2 Words.');
  }
  const f = raw as Partial<BackupFile>;
  if (f.app !== BACKUP_APP) return fail('Файл не похож на бэкап B2 Words.');
  if (f.version !== BACKUP_VERSION) {
    return fail(`Неподдерживаемая версия бэкапа: ${String(f.version)}.`);
  }
  const d = f.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return fail('В файле нет данных бэкапа.');
  }

  // SRS: keep only known words with well-formed records
  const srs: SrsState = {};
  const rawSrs: unknown = d.srs;
  if (rawSrs && typeof rawSrs === 'object' && !Array.isArray(rawSrs)) {
    for (const [word, rec] of Object.entries(rawSrs)) {
      if (valid.has(word) && isSrsRecord(rec)) {
        srs[word] = {
          box: rec.box,
          due: rec.due,
          lapses: Math.max(0, Math.floor(rec.lapses)),
        };
      }
    }
  }

  // Activity: valid day keys + non-negative counters
  const activity: ActivityMap = {};
  const rawAct: unknown = d.activity;
  if (rawAct && typeof rawAct === 'object' && !Array.isArray(rawAct)) {
    for (const [key, val] of Object.entries(rawAct)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (!val || typeof val !== 'object') continue;
      const studied = (val as { studied?: unknown }).studied;
      if (typeof studied !== 'number' || !Number.isFinite(studied) || studied < 0) continue;
      const newIntroduced = (val as { newIntroduced?: unknown }).newIntroduced;
      activity[key] = {
        studied: Math.floor(studied),
        newIntroduced:
          typeof newIntroduced === 'number' && Number.isFinite(newIntroduced) && newIntroduced > 0
            ? Math.floor(newIntroduced)
            : 0,
      };
    }
  }

  // Selection: unknown ids dropped, garbage → «all» (same rules as the app)
  const selection = parseSelection(d.selection, valid, allWords);

  // Settings: full sanitization over defaults
  const rawSettings = d.settings;
  const settings = sanitizeSettings(
    (rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) as Partial<Settings>,
    { ...DEFAULT_SETTINGS },
  );

  return {
    ok: true,
    data: { srs, activity, selection, settings },
    wordsInWork: Object.keys(srs).length,
    streak: computeStreak(activity, settings.dailyGoal),
  };
}

/** Persist a validated backup, REPLACING current user data. */
export function applyBackup(data: BackupData, allWords: string[]): void {
  saveSrs(data.srs); // also syncs the legacy known map
  saveActivity(data.activity);
  saveSelection(data.selection, allWords);
  saveSettings(data.settings);
}
