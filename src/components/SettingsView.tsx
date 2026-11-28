import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Sparkles,
  LogOut,
  KeyRound,
  Check,
  AlertCircle,
  UserCircle,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { useChessAudio } from '../contexts/ChessAudioContext';
import type { ChessSoundType } from '../lib/sound';
import {
  BOARD_THEMES,
  DEFAULT_LOCAL_PLAY_PREFERENCES,
  type BoardTheme,
  type LocalPlayPreferences,
  type PieceStyle,
  type UserPrivateProfile,
  type UserSettings,
} from '../types/chess';
import { ChessPieceSvg } from './ChessPieces';

interface SettingsViewProps {
  user: UserPrivateProfile;
  settings: UserSettings;
  localPrefs?: LocalPlayPreferences;
  onUpdateSettings: (next: UserSettings) => Promise<void>;
  onUpdateLocalPrefs?: (next: LocalPlayPreferences) => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  settings,
  localPrefs = DEFAULT_LOCAL_PLAY_PREFERENCES,
  onUpdateSettings,
  onUpdateLocalPrefs,
  onOpenProfile,
  onLogout,
}) => {
  const { playSound, volume, setVolume } = useChessAudio();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchSettings = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSaving(true);
    setError(null);
    try {
      await onUpdateSettings(next);
      if (patch.soundEnabled === true) {
        playSound('move', { force: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user.email) return;
    setError(null);
    setNotice(null);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setNotice(`Password reset email sent to ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Customize your theme, chessboard appearance, pieces, sound, and account.
          </p>
        </div>
        {saving && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Saving...</span>}
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2.5">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Appearance & Theme */}
      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-5">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          Interface & Audio
        </h2>

        <div className="divide-y divide-slate-100 dark:divide-[#353330]">
          {/* Light / Dark Mode */}
          <div className="py-4 first:pt-0 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Color Theme</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Switch between tournament dark mode and bright light mode.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1F1E1B]">
              <button
                type="button"
                onClick={() => void patchSettings({ theme: 'dark' })}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
              <button
                type="button"
                onClick={() => void patchSettings({ theme: 'light' })}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
            </div>
          </div>

          {/* Sound Effects */}
          <div className="py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Sound Effects</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Play natural tabletop audio cues for moves, captures, castling, checks, and game results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void patchSettings({ soundEnabled: !settings.soundEnabled })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.soundEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-300'
                }`}
              >
                {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                {settings.soundEnabled ? 'Enabled' : 'Muted'}
              </button>
            </div>

            {settings.soundEnabled && (
              <div className="pt-2 space-y-3 pl-0 sm:pl-1">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label
                    htmlFor="chess-audio-volume"
                    className="text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    Audio Volume
                  </label>
                  <div className="flex items-center gap-3 w-full sm:w-64">
                    <input
                      id="chess-audio-volume"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(volume * 100)}
                      onChange={(e) => setVolume(Number(e.target.value) / 100)}
                      onPointerUp={() => playSound('move')}
                      className="flex-1 accent-emerald-600 cursor-pointer"
                    />
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 w-10 text-right tabular-nums">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Preview Cues
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { type: 'move', label: 'Move' },
                        { type: 'capture', label: 'Capture' },
                        { type: 'castle', label: 'Castle' },
                        { type: 'check', label: 'Check' },
                        { type: 'promote', label: 'Promote' },
                        { type: 'victory', label: 'Victory' },
                        { type: 'defeat', label: 'Defeat' },
                        { type: 'draw', label: 'Draw' },
                      ] as { type: ChessSoundType; label: string }[]
                    ).map((cue) => (
                      <button
                        key={cue.type}
                        type="button"
                        onClick={() => playSound(cue.type, { force: true })}
                        className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {cue.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Piece Animations */}
          <div className="py-4 last:pb-0 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Board Animations</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Smooth transitions when selecting and moving pieces on the chessboard.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void patchSettings({ animationsEnabled: !settings.animationsEnabled })}
              className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                settings.animationsEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-300'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {settings.animationsEnabled ? 'Enabled' : 'Reduced'}
            </button>
          </div>
        </div>
      </section>

      {/* Chess.com-style Gameplay Controls */}
      {onUpdateLocalPrefs && (
        <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Gameplay Controls
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-[#353330]">
            <div className="py-3.5 first:pt-0 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Enable Premoves</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Queue your next move during your opponent’s turn to execute instantly once they play.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUpdateLocalPrefs({ ...localPrefs, enablePremoves: !localPrefs.enablePremoves })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  localPrefs.enablePremoves
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-300'
                }`}
              >
                {localPrefs.enablePremoves ? 'On' : 'Off'}
              </button>
            </div>

            <div className="py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Auto-Promote to Queen</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Skip the pawn promotion picker and automatically promote to a Queen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUpdateLocalPrefs({ ...localPrefs, autoQueen: !localPrefs.autoQueen })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  localPrefs.autoQueen
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-300'
                }`}
              >
                {localPrefs.autoQueen ? 'On' : 'Off'}
              </button>
            </div>

            <div className="py-3.5 last:pb-0 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Show Board Coordinates</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Display file letters (a–h) and rank numbers (1–8) along the chessboard edges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUpdateLocalPrefs({ ...localPrefs, showCoordinates: !localPrefs.showCoordinates })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  localPrefs.showCoordinates
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-300'
                }`}
              >
                {localPrefs.showCoordinates ? 'Visible' : 'Hidden'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Board Color Selection */}
      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Chessboard Palette
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Select your preferred light and dark square finish.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((themeKey) => {
            const t = BOARD_THEMES[themeKey];
            const active = settings.boardTheme === themeKey;
            return (
              <button
                key={themeKey}
                type="button"
                onClick={() => void patchSettings({ boardTheme: themeKey })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-500/8'
                    : 'border-slate-200 dark:border-[#3C3A37] hover:border-slate-400'
                }`}
              >
                <div className="grid grid-cols-4 grid-rows-2 rounded-md overflow-hidden aspect-[2/1] mb-2.5 ring-1 ring-black/15">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                    const row = Math.floor(i / 4);
                    const col = i % 4;
                    const light = (row + col) % 2 === 0;
                    return <div key={i} style={{ backgroundColor: light ? t.light : t.dark }} />;
                  })}
                </div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">{t.name}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Piece Style Selection */}
      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Piece Style
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose the Staunton vector rendering style for live matches and puzzles.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {(
            [
              { id: 'neo' as PieceStyle, label: 'Neo Tournament', desc: 'Crisp high-contrast slate & ivory' },
              { id: 'classic' as PieceStyle, label: 'Classic Wood', desc: 'Warm boxwood & dark ebony tones' },
              { id: 'minimal' as PieceStyle, label: 'Minimal Flat', desc: 'Clean streamlined vector silhouettes' },
            ]
          ).map((item) => {
            const active = settings.pieceStyle === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void patchSettings({ pieceStyle: item.id })}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-500/8'
                    : 'border-slate-200 dark:border-[#3C3A37] hover:border-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[#769656]/25">
                  <ChessPieceSvg type="k" color="w" style={item.id} className="w-8 h-8" />
                  <ChessPieceSvg type="n" color="w" style={item.id} className="w-8 h-8" />
                  <ChessPieceSvg type="q" color="b" style={item.id} className="w-8 h-8" />
                  <ChessPieceSvg type="r" color="b" style={item.id} className="w-8 h-8" />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Account & Profile Settings */}
      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
          Account & Security
        </h2>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p>
            Signed in as <span className="font-semibold text-slate-900 dark:text-slate-200">{user.email}</span>{' '}
            (private — hidden from other players).
          </p>
          <p>
            Public handle: <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">@{user.username}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <UserCircle className="w-4 h-4" />
            Edit Profile & Username
          </button>

          <button
            type="button"
            onClick={() => void handlePasswordReset()}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            Send Password Reset Email
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </section>
    </div>
  );
};
