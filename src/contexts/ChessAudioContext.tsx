import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  playChessSound,
  preloadChessSounds,
  resolveGameResultSoundType,
  resolveSanSoundType,
  unlockChessAudio,
  type ChessSoundType,
} from '../lib/sound';

const VOLUME_STORAGE_KEY = 'chess_arena_audio_volume';

interface PlaySoundOptions {
  /** Play even if user settings currently have soundEnabled=false (e.g., immediate test preview). */
  force?: boolean;
  /** Override master volume (0 to 1) for a single cue. */
  volume?: number;
}

interface ChessAudioContextValue {
  soundEnabled: boolean;
  volume: number;
  isPreloaded: boolean;
  setVolume: (nextVolume: number) => void;
  playSound: (type: ChessSoundType, options?: PlaySoundOptions) => void;
  playMoveFromSan: (san: string, options?: PlaySoundOptions) => void;
  playGameResult: (
    params: { result: string; winnerId?: string; currentUid?: string },
    options?: PlaySoundOptions
  ) => void;
  preloadAll: () => Promise<void>;
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 0.8;
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 0.8;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return 0.8;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return 0.8;
  }
}

const defaultContextValue: ChessAudioContextValue = {
  soundEnabled: true,
  volume: 0.8,
  isPreloaded: false,
  setVolume: () => {},
  playSound: (type, options) => {
    playChessSound(type, options?.force ?? true, options?.volume ?? 0.8);
  },
  playMoveFromSan: (san, options) => {
    playChessSound(resolveSanSoundType(san), options?.force ?? true, options?.volume ?? 0.8);
  },
  playGameResult: (params, options) => {
    playChessSound(resolveGameResultSoundType(params), options?.force ?? true, options?.volume ?? 0.8);
  },
  preloadAll: preloadChessSounds,
};

const ChessAudioContext = createContext<ChessAudioContextValue>(defaultContextValue);

interface ChessAudioProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

export const ChessAudioProvider: React.FC<ChessAudioProviderProps> = ({ enabled, children }) => {
  const [volume, setVolumeState] = useState<number>(readStoredVolume);
  const [isPreloaded, setIsPreloaded] = useState<boolean>(false);

  // Refs keep callbacks referentially stable even when settings/volume change mid-match,
  // avoiding unnecessary re-subscriptions in real-time Firestore listeners.
  const enabledRef = useRef<boolean>(enabled);
  const volumeRef = useRef<number>(volume);
  enabledRef.current = enabled;
  volumeRef.current = volume;

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(nextVolume) ? nextVolume : 0.8));
    setVolumeState(clamped);
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  }, []);

  const preloadAll = useCallback(async () => {
    await preloadChessSounds();
    setIsPreloaded(true);
  }, []);

  // Preload royalty-free audio buffers when sound is enabled
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void preloadChessSounds().then(() => {
      if (!cancelled) setIsPreloaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Unlock browser AudioContext cleanly on the user's first gesture
  useEffect(() => {
    const handleGesture = () => {
      unlockChessAudio();
      if (enabledRef.current) {
        void preloadChessSounds();
      }
    };

    window.addEventListener('pointerdown', handleGesture, { once: true, passive: true });
    window.addEventListener('keydown', handleGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  const playSound = useCallback((type: ChessSoundType, options?: PlaySoundOptions) => {
    const shouldPlay = options?.force || enabledRef.current;
    const effectiveVolume = options?.volume ?? volumeRef.current;
    playChessSound(type, shouldPlay, effectiveVolume);
  }, []);

  const playMoveFromSan = useCallback(
    (san: string, options?: PlaySoundOptions) => {
      playSound(resolveSanSoundType(san), options);
    },
    [playSound]
  );

  const playGameResult = useCallback(
    (params: { result: string; winnerId?: string; currentUid?: string }, options?: PlaySoundOptions) => {
      playSound(resolveGameResultSoundType(params), options);
    },
    [playSound]
  );

  const value = useMemo<ChessAudioContextValue>(
    () => ({
      soundEnabled: enabled,
      volume,
      isPreloaded,
      setVolume,
      playSound,
      playMoveFromSan,
      playGameResult,
      preloadAll,
    }),
    [enabled, volume, isPreloaded, setVolume, playSound, playMoveFromSan, playGameResult, preloadAll]
  );

  return <ChessAudioContext.Provider value={value}>{children}</ChessAudioContext.Provider>;
};

export function useChessAudio(): ChessAudioContextValue {
  return useContext(ChessAudioContext);
}
