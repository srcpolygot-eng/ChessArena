import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import {
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  Trophy,
  Calendar,
  Flame,
  Heart,
  Timer,
  GraduationCap,
  Play,
  Loader2,
  Zap,
  Shield,
} from 'lucide-react';
import { CHESS_PUZZLES, getDailyPuzzle } from '../lib/puzzlesData';
import {
  recordDailyPuzzleCompleted,
  recordPuzzleRushScore,
  recordPuzzleSolved,
} from '../lib/firestoreService';
import { getLocalDateKey } from '../lib/rewardsAndStreaks';
import { askCoachPosition } from '../lib/coachEngine';
import { useChessAudio } from '../contexts/ChessAudioContext';
import {
  DEFAULT_LOCAL_PLAY_PREFERENCES,
  type ChessPuzzle,
  type LocalPlayPreferences,
  type UserPrivateProfile,
  type UserProgression,
  type UserSettings,
} from '../types/chess';
import { ChessBoard } from './ChessBoard';

export type PuzzleMode = 'daily' | 'library' | 'rush' | 'survival';

interface PuzzlesViewProps {
  user: UserPrivateProfile;
  settings: UserSettings;
  localPrefs?: LocalPlayPreferences;
  progression?: UserProgression | null;
  initialMode?: PuzzleMode;
}

export const PuzzlesView: React.FC<PuzzlesViewProps> = ({
  user,
  settings,
  localPrefs = DEFAULT_LOCAL_PLAY_PREFERENCES,
  progression = null,
  initialMode = 'library',
}) => {
  const { playSound, playMoveFromSan } = useChessAudio();
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const dailyPuzzle = useMemo(() => getDailyPuzzle(todayKey), [todayKey]);

  const [mode, setMode] = useState<PuzzleMode>(initialMode);
  const [difficultyFilter, setDifficultyFilter] = useState<
    'All' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Master'
  >('All');
  const [activePuzzleId, setActivePuzzleId] = useState<string>(
    initialMode === 'daily' ? dailyPuzzle.id : CHESS_PUZZLES[0].id
  );

  // Rush / Survival run state
  const [runActive, setRunActive] = useState(false);
  const [runOver, setRunOver] = useState(false);
  const [runTimeLeft, setRunTimeLeft] = useState(180);
  const [runStrikes, setRunStrikes] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [runQueue, setRunQueue] = useState<ChessPuzzle[]>([]);
  const [runIndex, setRunIndex] = useState(0);
  const [runNewBest, setRunNewBest] = useState(false);

  // Coach explanation state
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [coachTipLoading, setCoachTipLoading] = useState(false);
  const [dailyRewardNotice, setDailyRewardNotice] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    if (initialMode === 'daily') {
      setActivePuzzleId(dailyPuzzle.id);
    }
  }, [initialMode, dailyPuzzle.id]);

  const filteredPuzzles = useMemo(
    () =>
      difficultyFilter === 'All'
        ? CHESS_PUZZLES
        : CHESS_PUZZLES.filter((p) => p.difficulty === difficultyFilter),
    [difficultyFilter]
  );

  const puzzle: ChessPuzzle = useMemo(() => {
    if (mode === 'daily') return dailyPuzzle;
    if ((mode === 'rush' || mode === 'survival') && runQueue.length > 0) {
      return runQueue[runIndex % runQueue.length];
    }
    return CHESS_PUZZLES.find((p) => p.id === activePuzzleId) || CHESS_PUZZLES[0];
  }, [mode, dailyPuzzle, runQueue, runIndex, activePuzzleId]);

  const [fen, setFen] = useState(puzzle.fen);
  const [stepIndex, setStepIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<'solving' | 'wrong' | 'solved'>('solving');
  const [feedback, setFeedback] = useState<string>(puzzle.description);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0);
  const [ratingAwarded, setRatingAwarded] = useState<boolean>(false);
  const [isOpponentReplying, setIsOpponentReplying] = useState<boolean>(false);
  const replyTimeoutRef = useRef<number | null>(null);
  const advanceTimeoutRef = useRef<number | null>(null);

  const clearPendingTimers = useCallback(() => {
    if (replyTimeoutRef.current !== null) {
      window.clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
    setIsOpponentReplying(false);
  }, []);

  const playerColor: Color = useMemo(() => {
    const c = new Chess(puzzle.fen);
    return c.turn();
  }, [puzzle.fen]);

  // Reset puzzle board when puzzle or mode changes
  useEffect(() => {
    clearPendingTimers();
    setFen(puzzle.fen);
    setStepIndex(0);
    setLastMove(null);
    setStatus('solving');
    setFeedback(puzzle.description);
    setHintLevel(0);
    setRatingAwarded(false);
    setCoachTip(null);
    return () => {
      clearPendingTimers();
    };
  }, [puzzle, mode, runIndex, clearPendingTimers]);

  // Finish Rush/Survival run helper
  const finishRun = useCallback(
    (finalScore: number) => {
      setRunActive(false);
      setRunOver(true);
      playSound('gameStart');
      if (finalScore > 0) {
        void recordPuzzleRushScore(user.uid, finalScore).then((improved) => {
          if (improved) setRunNewBest(true);
        });
      }
    },
    [playSound, user.uid]
  );

  // Countdown timer for Puzzle Rush (3-Min)
  useEffect(() => {
    if (mode !== 'rush' || !runActive) return;
    if (runTimeLeft <= 0) {
      finishRun(runScore);
      return;
    }
    const id = window.setTimeout(() => setRunTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [mode, runActive, runTimeLeft, runScore, finishRun]);

  const startTimedOrSurvivalRun = (targetMode: 'rush' | 'survival') => {
    clearPendingTimers();
    const sorted = [...CHESS_PUZZLES].sort((a, b) => a.rating - b.rating);
    setMode(targetMode);
    setRunQueue(sorted);
    setRunIndex(0);
    setRunScore(0);
    setRunStrikes(0);
    setRunTimeLeft(180);
    setRunOver(false);
    setRunNewBest(false);
    setRunActive(true);
    playSound('gameStart');
  };

  const expectedUci = puzzle.solution[stepIndex] || '';

  const hintSquares = useMemo(() => {
    if (hintLevel === 0 || !expectedUci || status === 'solved') return null;
    if (hintLevel === 1) return { from: expectedUci.slice(0, 2) };
    return { from: expectedUci.slice(0, 2), to: expectedUci.slice(2, 4) };
  }, [hintLevel, expectedUci, status]);

  const handlePuzzleMove = (from: string, to: string, promotion?: PieceSymbol) => {
    if (status === 'solved' || isOpponentReplying) return;
    if ((mode === 'rush' || mode === 'survival') && !runActive) return;

    const chess = new Chess(fen);
    const moveObj = chess.move({ from, to, promotion });
    if (!moveObj) {
      playSound('illegal');
      return;
    }

    const playedUci = `${from}${to}${promotion || ''}`;
    const matchesSolution =
      playedUci === expectedUci ||
      (expectedUci.length === 4 && `${from}${to}` === expectedUci) ||
      chess.isCheckmate();

    if (!matchesSolution) {
      playSound('illegal');
      setStatus('wrong');
      if (mode === 'rush' || mode === 'survival') {
        const nextStrikes = runStrikes + 1;
        setRunStrikes(nextStrikes);
        if (nextStrikes >= 3) {
          setFeedback(`${moveObj.san} was incorrect — 3 strikes! Run complete with score ${runScore}.`);
          finishRun(runScore);
        } else {
          setFeedback(`${moveObj.san} missed the tactic (Strike ${nextStrikes}/3). Advancing to next puzzle...`);
          advanceTimeoutRef.current = window.setTimeout(() => {
            setRunIndex((idx) => idx + 1);
          }, 750);
        }
      } else {
        setFeedback(`${moveObj.san} is not the best move here. Try again, use a hint, or ask Coach.`);
      }
      return;
    }

    // Correct move!
    const newFen = chess.fen();
    setFen(newFen);
    setLastMove({ from, to });
    setHintLevel(0);

    const nextIdx = stepIndex + 1;

    if (nextIdx >= puzzle.solution.length || chess.isCheckmate()) {
      setStatus('solved');
      setFeedback(`Solved! ${moveObj.san} completes "${puzzle.title}".`);
      playSound('puzzleCorrect');

      if (!user.solvedPuzzleIds.includes(puzzle.id)) {
        void recordPuzzleSolved(user, puzzle.id, puzzle.rating).then((newlyAwarded) => {
          if (newlyAwarded) setRatingAwarded(true);
        });
      }

      if (mode === 'daily') {
        void recordDailyPuzzleCompleted(user.uid, todayKey).then((reward) => {
          if (reward) {
            setDailyRewardNotice(
              `Daily Puzzle complete! +${reward.xpEarned} XP, +${reward.coinsEarned} Coins · ${reward.streak}-day puzzle streak`
            );
          }
        });
      }

      if (mode === 'rush' || mode === 'survival') {
        const nextScore = runScore + 1;
        setRunScore(nextScore);
        if (runIndex + 1 >= runQueue.length) {
          finishRun(nextScore);
        } else {
          advanceTimeoutRef.current = window.setTimeout(() => {
            setRunIndex((idx) => idx + 1);
          }, 420);
        }
      }
      return;
    }

    // Correct intermediate move -> play opponent reply after 360ms
    playMoveFromSan(moveObj.san);
    setStatus('solving');
    setFeedback(`Good move (${moveObj.san})! Keep calculating...`);
    setStepIndex(nextIdx);
    setIsOpponentReplying(true);

    const opponentUci = puzzle.solution[nextIdx];
    const targetPuzzleId = puzzle.id;
    clearPendingTimers();
    setIsOpponentReplying(true);
    replyTimeoutRef.current = window.setTimeout(() => {
      replyTimeoutRef.current = null;
      setIsOpponentReplying(false);
      if (targetPuzzleId !== puzzle.id) return;
      const replyChess = new Chess(newFen);
      const replyMove = replyChess.move({
        from: opponentUci.slice(0, 2),
        to: opponentUci.slice(2, 4),
        promotion: opponentUci.length === 5 ? (opponentUci[4] as PieceSymbol) : undefined,
      });
      if (replyMove) {
        setFen(replyChess.fen());
        setLastMove({ from: replyMove.from, to: replyMove.to });
        setStepIndex(nextIdx + 1);
        playMoveFromSan(replyMove.san);
      }
    }, 360);
  };

  const handleRetry = () => {
    clearPendingTimers();
    setFen(puzzle.fen);
    setStepIndex(0);
    setLastMove(null);
    setStatus('solving');
    setFeedback(puzzle.description);
    setHintLevel(0);
    setCoachTip(null);
  };

  const handleNextPuzzle = () => {
    const idx = filteredPuzzles.findIndex((p) => p.id === puzzle.id);
    const next = filteredPuzzles[(idx + 1) % filteredPuzzles.length];
    if (next) setActivePuzzleId(next.id);
  };

  const handleAskCoachPuzzle = async () => {
    if (coachTipLoading) return;
    setCoachTipLoading(true);
    try {
      const report = await askCoachPosition(fen, { depth: 11, movetimeMs: 220, multiPv: 1 });
      setCoachTip(`${report.headline}. ${report.advice}`);
    } finally {
      setCoachTipLoading(false);
    }
  };

  const alreadySolved = user.solvedPuzzleIds.includes(puzzle.id);
  const dailyDoneToday = progression?.lastDailyPuzzleDate === todayKey;
  const isMarathon = mode === 'rush' || mode === 'survival';
  const mins = Math.floor(runTimeLeft / 60);
  const secs = runTimeLeft % 60;

  return (
    <div className="max-w-7xl mx-auto pb-8 space-y-5">
      {/* Header + Stats */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Tactical Puzzles
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Daily Puzzle, {CHESS_PUZZLES.length} curated tactics, 3-Minute Puzzle Rush, and Survival mode.
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm font-mono tabular-nums">
          <div>
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Solved</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {user.puzzlesSolved} / {CHESS_PUZZLES.length}
            </span>
          </div>
          <div className="h-7 w-px bg-slate-200 dark:bg-[#2A313D]" />
          <div>
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Puzzle Elo</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">{user.puzzleRating}</span>
          </div>
          <div className="h-7 w-px bg-slate-200 dark:bg-[#2A313D]" />
          <div>
            <span className="text-slate-500 dark:text-slate-400 text-xs block">Rush Best</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {progression?.puzzleRushBest ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] w-fit">
        {(
          [
            { id: 'daily', label: 'Daily Puzzle', icon: Calendar },
            { id: 'library', label: `Rated Library (${CHESS_PUZZLES.length})`, icon: Trophy },
            { id: 'rush', label: 'Puzzle Rush (3-Min)', icon: Zap },
            { id: 'survival', label: 'Survival (3 Strikes)', icon: Shield },
          ] as { id: PuzzleMode; label: string; icon: React.ComponentType<{ className?: string }> }[]
        ).map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                clearPendingTimers();
                setRunActive(false);
                setRunOver(false);
                setMode(tab.id);
                if (tab.id === 'daily') setActivePuzzleId(dailyPuzzle.id);
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#222833]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Interactive Puzzle Board */}
        <div className="xl:col-span-7 space-y-4">
          <div className="max-w-[680px] mx-auto bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {mode === 'daily' ? `Daily Puzzle · ${puzzle.title}` : puzzle.title}
                </h2>
                {mode === 'daily' && dailyDoneToday && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Done Today
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {puzzle.difficulty} · {puzzle.theme} ·{' '}
                <span className="font-mono tabular-nums">{puzzle.rating} Elo</span>
                {mode === 'daily' && ` · ${todayKey}`}
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {playerColor === 'w' ? 'White to Move' : 'Black to Move'}
            </span>
          </div>

          <ChessBoard
            fen={fen}
            orientation={playerColor}
            interactive={
              status !== 'solved' && !isOpponentReplying && (!isMarathon || runActive)
            }
            allowedColor={playerColor}
            lastMove={lastMove}
            hintSquares={isMarathon ? null : hintSquares}
            boardTheme={settings.boardTheme}
            pieceStyle={settings.pieceStyle}
            animationsEnabled={settings.animationsEnabled}
            showCoordinates={localPrefs.showCoordinates}
            autoQueen={localPrefs.autoQueen}
            onMove={handlePuzzleMove}
          />
        </div>

        {/* Right: Mode-Specific Controls & Catalog */}
        <div className="xl:col-span-5 space-y-5">
          {/* Daily Puzzle Banner */}
          {mode === 'daily' && (
            <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Daily Puzzle Streak: {progression?.dailyPuzzleStreak ?? 0} days
                </span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  +100 XP · +60 Coins
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Every player worldwide receives the exact same tactical puzzle each day. Solve it to extend your daily streak!
              </p>
              {dailyRewardNotice && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {dailyRewardNotice}
                </p>
              )}
            </div>
          )}

          {/* Puzzle Rush / Survival HUD */}
          {isMarathon && (
            <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {mode === 'rush' ? 'Puzzle Rush · 3-Minute Blitz' : 'Puzzle Survival · Escalating'}
                </h3>
                <div className="flex items-center gap-1" aria-label={`Strikes ${runStrikes} of 3`}>
                  {[0, 1, 2].map((i) => (
                    <Heart
                      key={i}
                      className={`w-4 h-4 ${
                        i < 3 - runStrikes
                          ? 'text-red-500 fill-red-500'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {mode === 'rush' && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#242A35]">
                    <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
                      <Timer className="w-3 h-3" /> Time
                    </p>
                    <p className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {mins}:{secs.toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#242A35]">
                  <p className="text-[11px] text-slate-500">Score</p>
                  <p className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                    {runScore}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#242A35]">
                  <p className="text-[11px] text-slate-500">Personal Best</p>
                  <p className="font-mono text-xl font-bold text-amber-500 tabular-nums mt-0.5">
                    {Math.max(progression?.puzzleRushBest ?? 0, runScore)}
                  </p>
                </div>
              </div>

              {runNewBest && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  New personal record saved to your profile!
                </p>
              )}

              {!runActive && (
                <button
                  type="button"
                  onClick={() => startTimedOrSurvivalRun(mode)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {runOver ? 'Play Again' : mode === 'rush' ? 'Start 3-Minute Rush' : 'Start Survival Run'}
                </button>
              )}
            </div>
          )}

          {/* Status & Controls Card */}
          <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
            <div
              className={`p-4 rounded-lg border text-sm flex items-start gap-3 ${
                status === 'solved'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : status === 'wrong'
                  ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                  : 'bg-slate-50 dark:bg-[#12151A] border-slate-200 dark:border-[#2A313D] text-slate-700 dark:text-slate-300'
              }`}
            >
              {status === 'solved' ? (
                <Trophy className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
              ) : status === 'wrong' ? (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              ) : (
                <Lightbulb className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
              )}
              <div>
                <p className="font-medium leading-relaxed">{feedback}</p>
                {ratingAwarded && (
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    Puzzle Elo updated and saved!
                  </p>
                )}
              </div>
            </div>

            {coachTip && (
              <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
                <span className="font-bold">Coach:</span> {coachTip}
              </div>
            )}

            {!isMarathon && (
              <div className="flex flex-wrap gap-2">
                {status !== 'solved' && (
                  <button
                    type="button"
                    onClick={() => setHintLevel((prev) => (prev < 2 ? ((prev + 1) as 1 | 2) : 2))}
                    className="flex-1 py-2.5 px-3 rounded-lg bg-amber-500/12 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Lightbulb className="w-4 h-4" />
                    {hintLevel === 0 ? 'Hint (Piece)' : hintLevel === 1 ? 'Hint (Square)' : 'Shown'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleAskCoachPuzzle()}
                  disabled={coachTipLoading}
                  className="py-2.5 px-3 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {coachTipLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GraduationCap className="w-3.5 h-3.5" />
                  )}
                  Ask Coach
                </button>

                <button
                  type="button"
                  onClick={handleRetry}
                  className="py-2.5 px-3.5 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>

                {mode === 'library' && (
                  <button
                    type="button"
                    onClick={handleNextPuzzle}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {alreadySolved && status !== 'solved' && !isMarathon && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                You have previously solved this puzzle.
              </p>
            )}
          </div>

          {/* Puzzle Library List (Shown in Library Mode) */}
          {mode === 'library' && (
            <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Puzzle Library ({filteredPuzzles.length})
                </h3>
                <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#12151A]">
                  {(['All', 'Beginner', 'Intermediate', 'Advanced', 'Master'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setDifficultyFilter(tier)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        difficultyFilter === tier
                          ? 'bg-white dark:bg-[#222833] text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                {filteredPuzzles.map((item) => {
                  const isSolved = user.solvedPuzzleIds.includes(item.id);
                  const isSelected = item.id === puzzle.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActivePuzzleId(item.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600/12 border border-emerald-500/40'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1F242E] border border-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.difficulty} · {item.theme}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-slate-500 tabular-nums">{item.rating}</span>
                        {isSolved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
