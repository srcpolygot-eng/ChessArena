import { DEFAULT_LOCAL_PLAY_PREFERENCES, type LocalPlayPreferences } from '../types/chess';

const STORAGE_KEY = 'chess_arena_local_play_prefs_v1';

export function loadLocalPlayPreferences(): LocalPlayPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_LOCAL_PLAY_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOCAL_PLAY_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<LocalPlayPreferences>;
    return {
      autoQueen: typeof parsed.autoQueen === 'boolean' ? parsed.autoQueen : DEFAULT_LOCAL_PLAY_PREFERENCES.autoQueen,
      showCoordinates:
        typeof parsed.showCoordinates === 'boolean'
          ? parsed.showCoordinates
          : DEFAULT_LOCAL_PLAY_PREFERENCES.showCoordinates,
      enablePremoves:
        typeof parsed.enablePremoves === 'boolean'
          ? parsed.enablePremoves
          : DEFAULT_LOCAL_PLAY_PREFERENCES.enablePremoves,
    };
  } catch {
    return { ...DEFAULT_LOCAL_PLAY_PREFERENCES };
  }
}

export function saveLocalPlayPreferences(prefs: LocalPlayPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}
