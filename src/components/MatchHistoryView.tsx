import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GraduationCap,
  History,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import {
  evaluatePositionFast,
  formatResultReason,
  getCapturedPieces,
} from '../lib/chessEngine';
import { createChessFromInitialFen } from '../lib/chess960';
import { detectOpening } from '../lib/openings';
import {
  buildPgnFilename,
  downloadPgnFile,
  generateMatchPgnFromMatch,
} from '../lib/pgn';
import {
  analyzeMatchWithStockfish,
  type AnalysisProgress,
  type AnalyzedMove,
  type GameAnalysisResult,
} from '../lib/stockfishAnalyzer';
import { useChessAudio } from '../contexts/ChessAudioContext';
import {
  DEFAULT_LOCAL_PLAY_PREFERENCES,
  type ChessMatch,
  type LocalPlayPreferences,
  type UserSettings,
} from '../types/chess';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieces';
import { EvalBar } from './EvalBar';
import { GameAnalysisPanel } from './GameAnalysisPanel';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchHistoryViewProps {
  currentUid: string;
  matches: ChessMatch[];
  settings: UserSettings;
  localPrefs?: LocalPlayPreferences;
  initialReplayMatch: ChessMatch | null;
  onClearInitialReplay: () => void;
  onStartNewMatch: () => void;
}

function getMoveMarker(analyzed?: AnalyzedMove): { symbol: string; className: string } | null {
  if (!analyzed) return null;
  if (analyzed.classification === 'blunder') {
    return { symbol: '??', className: 'text-red-600 dark:text-red-400' };
  }
  if (analyzed.classification === 'mistake') {
    return { symbol: '?', className: 'text-amber-600 dark:text-amber-400' };
  }
  if (analyzed.classification === 'inaccuracy') {
    return { symbol: '?!', className: 'text-sky-600 dark:text-sky-400' };
  }
  if (analyzed.classification === 'best') {
    return { symbol: '!', className: 'text-emerald-600 dark:text-emerald-400' };
  }
  return null;
}

export const MatchHistoryView: React.FC<MatchHistoryViewProps> = ({
  currentUid,
  matches,
  settings,
  localPrefs = DEFAULT_LOCAL_PLAY_PREFERENCES,
  initialReplayMatch,
  onClearInitialReplay,
  onStartNewMatch,
}) => {
  const { playMoveFromSan } = useChessAudio();
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses' | 'draws'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<ChessMatch | null>(initialReplayMatch);
  const [ply, setPly] = useState<number>(initialReplayMatch ? initialReplayMatch.moves.length : 0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [flipped, setFlipped] = useState(
    initialReplayMatch ? initialReplayMatch.blackId === currentUid : false
  );
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [showPgnViewer, setShowPgnViewer] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [analysisByMatchId, setAnalysisByMatchId] = useState<Record<string, GameAnalysisResult>>({});
  const [analyzingMatchId, setAnalyzingMatchId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const activeMoveBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (initialReplayMatch) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setAnalyzingMatchId(null);
      setAnalysisProgress(null);
      setAnalysisError(null);
      setSelectedMatch(initialReplayMatch);
      setPly(initialReplayMatch.moves.length);
      setAutoPlaying(false);
      setFlipped(initialReplayMatch.blackId === currentUid);
      setShowPgnViewer(false);
      onClearInitialReplay();
    }
  }, [initialReplayMatch, onClearInitialReplay, currentUid]);

  // Precompute detected openings per match for fast search & badge rendering
  const openingByMatchId = useMemo(() => {
    const map: Record<string, ReturnType<typeof detectOpening>> = {};
    for (const m of matches) {
      map[m.matchId] = detectOpening(m.moves || []);
    }
    return map;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (filter === 'draws' && m.result !== '1/2-1/2') return false;
      if (filter === 'wins' && m.winnerId !== currentUid) return false;
      if (filter === 'losses' && (m.result === '1/2-1/2' || m.winnerId === currentUid)) return false;

      if (!q) return true;
      const opp =
        m.whiteId === currentUid
          ? `${m.blackUsername} ${m.blackDisplayName}`
          : `${m.whiteUsername} ${m.whiteDisplayName}`;
      const opening = openingByMatchId[m.matchId];
      const openingText = opening ? `${opening.eco} ${opening.name}` : '';
      return (
        opp.toLowerCase().includes(q) ||
        openingText.toLowerCase().includes(q) ||
        m.mode.toLowerCase().includes(q)
      );
    });
  }, [matches, filter, searchQuery, currentUid, openingByMatchId]);

  const replayPositions = useMemo(() => {
    if (!selectedMatch) return [];
    const c = createChessFromInitialFen(selectedMatch.initialFen);
    const list: { fen: string; from: string; to: string; san: string; turn: Color }[] = [
      { fen: c.fen(), from: '', to: '', san: '', turn: c.turn() },
    ];
    for (const san of selectedMatch.moves) {
      try {
        const moved = c.move(san);
        if (!moved) break;
        list.push({ fen: c.fen(), from: moved.from, to: moved.to, san: moved.san, turn: c.turn() });
      } catch {
        break;
      }
    }
    return list;
  }, [selectedMatch]);

  const currentPos = useMemo(() => {
    if (!selectedMatch) {
      return { fen: new Chess().fen(), from: '', to: '', san: '', turn: 'w' as Color };
    }
    return (
      replayPositions[ply] ||
      replayPositions[replayPositions.length - 1] || {
        fen: selectedMatch.fen,
        from: '',
        to: '',
        san: '',
        turn: selectedMatch.turn,
      }
    );
  }, [selectedMatch, replayPositions, ply]);

  const currentOpening = useMemo(() => {
    if (!selectedMatch) return null;
    const movesToPly = selectedMatch.moves.slice(0, ply);
    return detectOpening(movesToPly) || openingByMatchId[selectedMatch.matchId] || null;
  }, [selectedMatch, ply, openingByMatchId]);

  const selectedMatchPgn = useMemo(() => {
    if (!selectedMatch) return '';
    return generateMatchPgnFromMatch(selectedMatch);
  }, [selectedMatch]);

  const activeAnalysis = selectedMatch ? analysisByMatchId[selectedMatch.matchId] || null : null;

  const evalScore = useMemo(() => {
    if (!selectedMatch) return { cpWhite: 0, mateWhite: null as number | null };
    if (activeAnalysis && ply < activeAnalysis.evalSeriesWhiteCp.length) {
      const analyzedMove = ply > 0 ? activeAnalysis.moves[ply - 1] : null;
      return {
        cpWhite: activeAnalysis.evalSeriesWhiteCp[ply],
        mateWhite: analyzedMove?.evalAfterMate ?? null,
      };
    }
    return evaluatePositionFast(currentPos.fen);
  }, [selectedMatch, activeAnalysis, ply, currentPos.fen]);

  const capturedSummary = useMemo(() => getCapturedPieces(currentPos.fen), [currentPos.fen]);

  const keyMoments = useMemo(() => {
    if (!activeAnalysis) return [] as AnalyzedMove[];
    return activeAnalysis.moves.filter(
      (m) =>
        m.classification === 'blunder' ||
        m.classification === 'mistake' ||
        m.classification === 'inaccuracy'
    );
  }, [activeAnalysis]);

  const goToPly = useCallback(
    (nextPly: number, playAudio = true) => {
      const maxPly = Math.max(0, replayPositions.length - 1);
      const clamped = Math.max(0, Math.min(maxPly, nextPly));
      if (playAudio && clamped > 0 && clamped !== ply) {
        const target = replayPositions[clamped];
        if (target?.san) {
          playMoveFromSan(target.san);
        }
      }
      setPly(clamped);
    },
    [replayPositions, ply, playMoveFromSan]
  );

  // Auto-replay timer
  useEffect(() => {
    if (!autoPlaying || !selectedMatch) return;
    if (ply >= replayPositions.length - 1) {
      setAutoPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      const next = Math.min(replayPositions.length - 1, ply + 1);
      const target = replayPositions[next];
      if (target?.san) playMoveFromSan(target.san);
      setPly(next);
    }, 750);
    return () => window.clearTimeout(id);
  }, [autoPlaying, ply, replayPositions, selectedMatch, playMoveFromSan]);

  // Smoothly keep the active move visible in the move history list
  useEffect(() => {
    if (selectedMatch && activeMoveBtnRef.current) {
      activeMoveBtnRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [ply, selectedMatch]);

  // Keyboard navigation in Game Review mode (←, →, Home, End, Space, F)
  useEffect(() => {
    if (!selectedMatch) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      const maxPly = Math.max(0, replayPositions.length - 1);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setAutoPlaying(false);
        goToPly(ply - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setAutoPlaying(false);
        goToPly(ply + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setAutoPlaying(false);
        goToPly(0, false);
      } else if (e.key === 'End') {
        e.preventDefault();
        setAutoPlaying(false);
        goToPly(maxPly, false);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (maxPly === 0) return;
        if (ply >= maxPly && !autoPlaying) {
          setPly(0);
          setAutoPlaying(true);
        } else {
          setAutoPlaying((prev) => !prev);
        }
      } else if (e.key.toLowerCase() === 'f') {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedMatch, replayPositions.length, ply, autoPlaying, goToPly]);

  const handleRunAnalysis = async (targetMatch: ChessMatch) => {
    if (targetMatch.moves.length === 0) {
      setAnalysisError('No moves recorded in this game to analyze.');
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalyzingMatchId(targetMatch.matchId);
    setAnalysisProgress(null);
    setAnalysisError(null);
    setShowEvalBar(true);

    try {
      const result = await analyzeMatchWithStockfish({
        moves: targetMatch.moves,
        initialFen: targetMatch.initialFen,
        depth: 10,
        movetimeMs: 95,
        signal: controller.signal,
        onProgress: (p) => {
          if (!controller.signal.aborted) {
            setAnalysisProgress(p);
          }
        },
      });
      if (!controller.signal.aborted) {
        setAnalysisByMatchId((prev) => ({
          ...prev,
          [targetMatch.matchId]: result,
        }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setAnalysisError(err instanceof Error ? err.message : 'Coach review failed.');
    } finally {
      if (abortControllerRef.current === controller) {
        setAnalyzingMatchId(null);
        abortControllerRef.current = null;
      }
    }
  };

  const openReplay = (match: ChessMatch, autoAnalyze = false) => {
    if (analyzingMatchId && analyzingMatchId !== match.matchId) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setAnalyzingMatchId(null);
      setAnalysisProgress(null);
    }
    setAnalysisError(null);
    setSelectedMatch(match);
    setPly(match.moves.length);
    setAutoPlaying(false);
    setFlipped(match.blackId === currentUid);
    setShowPgnViewer(false);

    if (autoAnalyze && match.moves.length > 0 && !analysisByMatchId[match.matchId]) {
      void handleRunAnalysis(match);
    }
  };

  const handleCopyMatchPgn = async (match: ChessMatch) => {
    const pgn = generateMatchPgnFromMatch(match);
    try {
      await navigator.clipboard.writeText(pgn);
      setCopiedId(match.matchId);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadMatchPgn = (match: ChessMatch) => {
    const pgn = generateMatchPgnFromMatch(match);
    const matchDate = match.completedAt?.toDate() || match.createdAt?.toDate() || null;
    const filename = buildPgnFilename(
      match.whiteUsername || match.whiteDisplayName || 'White',
      match.blackUsername || match.blackDisplayName || 'Black',
      matchDate
    );
    downloadPgnFile(pgn, filename);
  };

  // Interactive Game Review View
  if (selectedMatch) {
    const maxPly = Math.max(0, replayPositions.length - 1);
    const isFinalPly = ply === maxPly;
    const isAnalyzingThisMatch = analyzingMatchId === selectedMatch.matchId;
    const activeAnalyzedMove =
      activeAnalysis && ply > 0 ? activeAnalysis.moves[ply - 1] || null : null;

    const hintSquares =
      activeAnalyzedMove &&
      activeAnalyzedMove.classification !== 'best' &&
      activeAnalyzedMove.bestMoveUci &&
      activeAnalyzedMove.bestMoveUci.length >= 4 &&
      activeAnalyzedMove.bestMoveUci !== activeAnalyzedMove.uci
        ? {
            from: activeAnalyzedMove.bestMoveUci.slice(0, 2),
            to: activeAnalyzedMove.bestMoveUci.slice(2, 4),
          }
        : null;

    const boardOrientation: Color = flipped ? 'b' : 'w';
    const topIsWhite = boardOrientation === 'b';

    const whiteInfo = {
      username: selectedMatch.whiteUsername,
      displayName: selectedMatch.whiteDisplayName,
      photoURL: selectedMatch.whitePhotoURL,
      rating: selectedMatch.whiteRating,
      delta: selectedMatch.whiteRatingDelta,
      captured: capturedSummary.capturedByWhite,
      advantage: capturedSummary.whiteAdvantage,
      capturedColor: 'b' as Color,
      isTurn: !isFinalPly && currentPos.turn === 'w',
      sideLabel: 'White',
    };

    const blackInfo = {
      username: selectedMatch.blackUsername,
      displayName: selectedMatch.blackDisplayName,
      photoURL: selectedMatch.blackPhotoURL,
      rating: selectedMatch.blackRating,
      delta: selectedMatch.blackRatingDelta,
      captured: capturedSummary.capturedByBlack,
      advantage: capturedSummary.blackAdvantage,
      capturedColor: 'w' as Color,
      isTurn: !isFinalPly && currentPos.turn === 'b',
      sideLabel: 'Black',
    };

    const topPlayer = topIsWhite ? whiteInfo : blackInfo;
    const bottomPlayer = topIsWhite ? blackInfo : whiteInfo;

    const movePairs: { num: number; white: string; black?: string; wPly: number; bPly?: number }[] = [];
    for (let i = 0; i < selectedMatch.moves.length; i += 2) {
      movePairs.push({
        num: Math.floor(i / 2) + 1,
        white: selectedMatch.moves[i],
        black: selectedMatch.moves[i + 1],
        wPly: i + 1,
        bPly: selectedMatch.moves[i + 1] ? i + 2 : undefined,
      });
    }

    const prevMoment = [...keyMoments].reverse().find((m) => m.ply < ply) || null;
    const nextMoment = keyMoments.find((m) => m.ply > ply) || null;
    const isCopiedThis = copiedId === selectedMatch.matchId;

    return (
      <div className="max-w-7xl mx-auto space-y-5 pb-8">
        {/* Top Review Navigation & Export Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                abortControllerRef.current?.abort();
                abortControllerRef.current = null;
                setAnalyzingMatchId(null);
                setAnalysisProgress(null);
                setAnalysisError(null);
                setSelectedMatch(null);
                setAutoPlaying(false);
              }}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Match History
            </button>

            {currentOpening && (
              <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-xs">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
                  {currentOpening.eco}
                </span>
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[260px]">
                  {currentOpening.name}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEvalBar((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showEvalBar
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-200/70 dark:bg-[#312F2C] text-slate-600 dark:text-slate-300'
              }`}
              title="Toggle Evaluation Bar"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Eval Bar
            </button>

            <button
              type="button"
              onClick={() => setShowPgnViewer((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showPgnViewer
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-200/70 dark:bg-[#312F2C] text-slate-600 dark:text-slate-300'
              }`}
              title="Inspect full PGN notation"
            >
              <FileText className="w-3.5 h-3.5" />
              PGN Text
            </button>

            <button
              type="button"
              onClick={() => void handleCopyMatchPgn(selectedMatch)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCopiedThis ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {isCopiedThis ? 'Copied PGN' : 'Copy PGN'}
            </button>

            <button
              type="button"
              onClick={() => handleDownloadMatchPgn(selectedMatch)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export .pgn
            </button>

            <button
              type="button"
              disabled={selectedMatch.moves.length === 0 || isAnalyzingThisMatch}
              onClick={() => void handleRunAnalysis(selectedMatch)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {isAnalyzingThisMatch ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Coach Reviewing...
                </>
              ) : (
                <>
                  <GraduationCap className="w-3.5 h-3.5" />
                  {activeAnalysis ? 'Re-review' : 'Coach Review'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Review Split Workspace */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left/Center: Player Bars + EvalBar + Board + Key Moments + Coach Review Panel */}
          <div className="xl:col-span-7 space-y-3">
            {/* Top Player Strip */}
            <div
              className={`max-w-[716px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#262421] border transition-colors ${
                topPlayer.isTurn
                  ? 'border-emerald-500/70'
                  : 'border-slate-200 dark:border-[#3C3A37]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar src={topPlayer.photoURL} name={topPlayer.displayName} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                      {topPlayer.username}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      ({topPlayer.rating}
                      {topPlayer.delta !== 0
                        ? ` ${topPlayer.delta > 0 ? `+${topPlayer.delta}` : topPlayer.delta}`
                        : ''}
                      )
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {topPlayer.sideLabel}
                    {topPlayer.isTurn ? ' · To Move' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center -space-x-1.5">
                  {topPlayer.captured.slice(0, 12).map((p, i) => (
                    <ChessPieceSvg
                      key={`${p}-${i}`}
                      type={p}
                      color={topPlayer.capturedColor}
                      style={settings.pieceStyle}
                      className="w-4 h-4"
                    />
                  ))}
                </div>
                {topPlayer.advantage > 0 && (
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1 tabular-nums">
                    +{topPlayer.advantage}
                  </span>
                )}
              </div>
            </div>

            {/* Eval Bar + ChessBoard */}
            <div className="max-w-[716px] mx-auto flex items-stretch justify-center gap-2.5">
              {showEvalBar && (
                <EvalBar
                  evalCpWhite={evalScore.cpWhite}
                  mateWhite={evalScore.mateWhite}
                  orientation={boardOrientation}
                  className="hidden sm:flex min-h-[320px]"
                />
              )}
              <div className="flex-1 max-w-[680px]">
                <ChessBoard
                  fen={currentPos.fen}
                  orientation={boardOrientation}
                  interactive={false}
                  lastMove={
                    currentPos.from && currentPos.to
                      ? { from: currentPos.from, to: currentPos.to }
                      : null
                  }
                  hintSquares={hintSquares}
                  gameOutcome={
                    isFinalPly && selectedMatch.result
                      ? { result: selectedMatch.result, reason: selectedMatch.resultReason }
                      : null
                  }
                  boardTheme={settings.boardTheme}
                  pieceStyle={settings.pieceStyle}
                  animationsEnabled={settings.animationsEnabled}
                  showCoordinates={localPrefs.showCoordinates}
                />
              </div>
            </div>

            {/* Bottom Player Strip */}
            <div
              className={`max-w-[716px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#262421] border transition-colors ${
                bottomPlayer.isTurn
                  ? 'border-emerald-500/70'
                  : 'border-slate-200 dark:border-[#3C3A37]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar src={bottomPlayer.photoURL} name={bottomPlayer.displayName} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                      {bottomPlayer.username}
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      ({bottomPlayer.rating}
                      {bottomPlayer.delta !== 0
                        ? ` ${bottomPlayer.delta > 0 ? `+${bottomPlayer.delta}` : bottomPlayer.delta}`
                        : ''}
                      )
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {bottomPlayer.sideLabel}
                    {bottomPlayer.isTurn ? ' · To Move' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center -space-x-1.5">
                  {bottomPlayer.captured.slice(0, 12).map((p, i) => (
                    <ChessPieceSvg
                      key={`${p}-${i}`}
                      type={p}
                      color={bottomPlayer.capturedColor}
                      style={settings.pieceStyle}
                      className="w-4 h-4"
                    />
                  ))}
                </div>
                {bottomPlayer.advantage > 0 && (
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1 tabular-nums">
                    +{bottomPlayer.advantage}
                  </span>
                )}
              </div>
            </div>

            <p className="max-w-[716px] mx-auto text-[11px] text-slate-400 dark:text-slate-500 text-center">
              Keyboard: ← → step moves · Space play/pause · Home / End jump · F flip · Right-click draw arrows
            </p>

            {/* Quick Key Moments Jumper when Coach Review is Available */}
            {activeAnalysis && keyMoments.length > 0 && (
              <div className="max-w-[716px] mx-auto bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="font-semibold">Key Moments:</span>
                  <span className="font-mono text-slate-500 dark:text-slate-400">
                    {keyMoments.length} turning point{keyMoments.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!prevMoment}
                    onClick={() => {
                      if (!prevMoment) return;
                      setAutoPlaying(false);
                      goToPly(prevMoment.ply);
                    }}
                    className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] disabled:opacity-40 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev Moment
                  </button>
                  <button
                    type="button"
                    disabled={!nextMoment}
                    onClick={() => {
                      if (!nextMoment) return;
                      setAutoPlaying(false);
                      goToPly(nextMoment.ply);
                    }}
                    className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] disabled:opacity-40 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    Next Moment
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {(isAnalyzingThisMatch || activeAnalysis || analysisError) && (
              <div className="max-w-[716px] mx-auto">
                <GameAnalysisPanel
                  whiteName={selectedMatch.whiteUsername}
                  blackName={selectedMatch.blackUsername}
                  analyzing={isAnalyzingThisMatch}
                  progress={analysisProgress}
                  analysis={activeAnalysis}
                  error={analysisError}
                  currentPly={ply}
                  onSelectPly={(nextPly) => {
                    setAutoPlaying(false);
                    goToPly(nextPly);
                  }}
                  onRunAnalysis={() => void handleRunAnalysis(selectedMatch)}
                />
              </div>
            )}
          </div>

          {/* Right Sidebar: Match Summary, Move List, Playback Bar & PGN Box */}
          <aside className="xl:col-span-5 space-y-4">
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-[#3C3A37]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    Game Review · {selectedMatch.result || '*'}
                  </h2>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Ply {ply} / {maxPly}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {selectedMatch.variant === 'chess960' ? 'Chess960 · ' : ''}
                  {formatResultReason(selectedMatch.resultReason)} ·{' '}
                  {selectedMatch.completedAt?.toDate().toLocaleDateString() ||
                    selectedMatch.createdAt?.toDate().toLocaleDateString() ||
                    'Completed'}
                </p>

                {currentOpening && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono text-slate-400 shrink-0">{currentOpening.eco}</span>
                    <span className="truncate font-medium">{currentOpening.name}</span>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B]">
                    <span className="text-slate-400 block">White</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {selectedMatch.whiteUsername}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {selectedMatch.whiteRating}
                      {selectedMatch.whiteRatingDelta !== 0 &&
                        ` (${selectedMatch.whiteRatingDelta > 0 ? '+' : ''}${selectedMatch.whiteRatingDelta})`}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B]">
                    <span className="text-slate-400 block">Black</span>
                    <span className="font-semibold text-slate-900 dark:text-white truncate block">
                      {selectedMatch.blackUsername}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {selectedMatch.blackRating}
                      {selectedMatch.blackRatingDelta !== 0 &&
                        ` (${selectedMatch.blackRatingDelta > 0 ? '+' : ''}${selectedMatch.blackRatingDelta})`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive Move List */}
              <div className="flex-1 min-h-[240px] max-h-[380px] overflow-y-auto p-3 font-mono text-xs tabular-nums space-y-0.5">
                {movePairs.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">No moves were recorded in this game.</p>
                ) : (
                  movePairs.map((row) => {
                    const wAnalyzed = activeAnalysis?.moves[row.wPly - 1];
                    const bAnalyzed = row.bPly ? activeAnalysis?.moves[row.bPly - 1] : undefined;
                    const wMarker = getMoveMarker(wAnalyzed);
                    const bMarker = getMoveMarker(bAnalyzed);

                    return (
                      <div key={row.num} className="grid grid-cols-12 items-center">
                        <span className="col-span-2 py-1.5 px-2 text-slate-400">{row.num}.</span>
                        <button
                          ref={ply === row.wPly ? activeMoveBtnRef : undefined}
                          type="button"
                          onClick={() => {
                            setAutoPlaying(false);
                            goToPly(row.wPly);
                          }}
                          className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer flex items-center justify-between gap-1 ${
                            ply === row.wPly
                              ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                              : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312F2C]'
                          }`}
                        >
                          <span>{row.white}</span>
                          {wMarker && <span className={`font-bold ${wMarker.className}`}>{wMarker.symbol}</span>}
                        </button>
                        {row.black ? (
                          <button
                            ref={ply === row.bPly ? activeMoveBtnRef : undefined}
                            type="button"
                            onClick={() => {
                              setAutoPlaying(false);
                              goToPly(row.bPly ?? ply);
                            }}
                            className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer flex items-center justify-between gap-1 ${
                              ply === row.bPly
                                ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312F2C]'
                            }`}
                          >
                            <span>{row.black}</span>
                            {bMarker && <span className={`font-bold ${bMarker.className}`}>{bMarker.symbol}</span>}
                          </button>
                        ) : (
                          <span className="col-span-5" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Playback Bar */}
              <div className="p-3 border-t border-slate-200 dark:border-[#3C3A37] bg-slate-50 dark:bg-[#1F1E1B] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={ply <= 0}
                    onClick={() => {
                      setAutoPlaying(false);
                      goToPly(0, false);
                    }}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-[#312F2C] disabled:opacity-35 text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Start (Home)"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={ply <= 0}
                    onClick={() => {
                      setAutoPlaying(false);
                      goToPly(ply - 1);
                    }}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-[#312F2C] disabled:opacity-35 text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Previous move (←)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={maxPly === 0}
                    onClick={() => {
                      if (ply >= maxPly && !autoPlaying) setPly(0);
                      setAutoPlaying((a) => !a);
                    }}
                    className="p-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white cursor-pointer"
                    title={autoPlaying ? 'Pause (Space)' : 'Auto-replay (Space)'}
                  >
                    {autoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    disabled={ply >= maxPly}
                    onClick={() => {
                      setAutoPlaying(false);
                      goToPly(ply + 1);
                    }}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-[#312F2C] disabled:opacity-35 text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Next move (→)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={ply >= maxPly}
                    onClick={() => {
                      setAutoPlaying(false);
                      goToPly(maxPly);
                    }}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-[#312F2C] disabled:opacity-35 text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Final position (End)"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => !f)}
                    className="p-2 rounded hover:bg-slate-200 dark:hover:bg-[#312F2C] text-slate-600 dark:text-slate-300 cursor-pointer"
                    title="Flip board (F)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyMatchPgn(selectedMatch)}
                    className="px-2.5 py-1.5 rounded bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    title="Copy full PGN"
                  >
                    {isCopiedThis ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    PGN
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadMatchPgn(selectedMatch)}
                    className="p-2 rounded bg-slate-200 dark:bg-[#312F2C] text-slate-700 dark:text-slate-200 cursor-pointer"
                    title="Download .pgn file"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Expandable PGN Notation Viewer */}
            {showPgnViewer && (
              <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Portable Game Notation (PGN)
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyMatchPgn(selectedMatch)}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      {isCopiedThis ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      {isCopiedThis ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadMatchPgn(selectedMatch)}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      .pgn
                    </button>
                  </div>
                </div>
                <pre className="p-3 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#353330] font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
                  {selectedMatchPgn}
                </pre>
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  }

  // Match Archive List View
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Match History & Game Review
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review every completed game move-by-move, export standard PGN files, and get move-by-move Coach feedback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search player or opening..."
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 w-48"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37]">
            {(['all', 'wins', 'losses', 'draws'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  filter === f
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl overflow-hidden">
        {filteredMatches.length === 0 ? (
          <div className="p-12 text-center">
            <History className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {searchQuery ? 'No matching games found' : 'No completed matches in this filter'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
              {searchQuery
                ? 'Try clearing your search query or switching filters.'
                : 'Finish an online, friend, private, or computer game to build your archive.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={onStartNewMatch}
                className="px-4 py-2 rounded-lg btn-chess-primary text-xs font-semibold cursor-pointer"
              >
                Play a Match
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#3C3A37] bg-slate-50 dark:bg-[#1F1E1B] text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 pl-5 pr-3 font-semibold">Players & Opening</th>
                  <th className="py-3 px-3 font-semibold">Outcome</th>
                  <th className="py-3 px-3 font-semibold hidden md:table-cell">Mode</th>
                  <th className="py-3 px-3 font-semibold text-right">Moves</th>
                  <th className="py-3 px-3 font-semibold text-right hidden sm:table-cell">Date</th>
                  <th className="py-3 pl-3 pr-5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#353330] text-sm">
                {filteredMatches.map((m) => {
                  const userIsWhite = m.whiteId === currentUid;
                  const oppName = userIsWhite ? m.blackUsername : m.whiteUsername;
                  const oppAvatar = userIsWhite ? m.blackPhotoURL : m.whitePhotoURL;
                  const oppRating = userIsWhite ? m.blackRating : m.whiteRating;
                  const delta = userIsWhite ? m.whiteRatingDelta : m.blackRatingDelta;
                  const isWin = m.winnerId === currentUid;
                  const isDraw = m.result === '1/2-1/2';
                  const opening = openingByMatchId[m.matchId];
                  const isCopiedRow = copiedId === m.matchId;

                  return (
                    <tr key={m.matchId} className="hover:bg-slate-50 dark:hover:bg-[#312F2C] transition-colors">
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar src={oppAvatar} name={oppName} size="sm" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              vs {oppName}
                            </p>
                            <p className="text-xs font-mono text-slate-500 tabular-nums truncate">
                              {oppRating} Elo · {userIsWhite ? 'White' : 'Black'}
                              {opening ? ` · ${opening.eco} ${opening.name}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`font-semibold ${
                            isDraw
                              ? 'text-amber-600 dark:text-amber-400'
                              : isWin
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isDraw ? 'Draw' : isWin ? 'Win' : 'Loss'} ({m.result})
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {formatResultReason(m.resultReason)}
                          {delta !== 0 && (
                            <span className="font-mono ml-1.5 tabular-nums">
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 hidden md:table-cell text-xs capitalize text-slate-500 dark:text-slate-400">
                        {m.mode}
                        {m.variant === 'chess960' && (
                          <span className="ml-1.5 font-mono text-emerald-600 dark:text-emerald-400 normal-case">
                            · Chess960
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {Math.ceil(m.moveCount / 2)}
                      </td>
                      <td className="py-3.5 px-3 text-right text-xs text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        {(m.completedAt?.toDate() || m.createdAt?.toDate())?.toLocaleDateString() || '—'}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleCopyMatchPgn(m)}
                            className="p-1.5 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Copy PGN"
                          >
                            {isCopiedRow ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadMatchPgn(m)}
                            className="p-1.5 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Download .pgn file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={m.moves.length === 0}
                            onClick={() => openReplay(m, true)}
                            className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-[#312F2C] hover:bg-emerald-600 text-slate-700 dark:text-slate-200 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                          >
                            <GraduationCap className="w-3.5 h-3.5" />
                            Coach Review
                          </button>
                          <button
                            type="button"
                            onClick={() => openReplay(m, false)}
                            className="px-3 py-1.5 rounded-md bg-emerald-600/12 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                          >
                            Game Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
